import type { Context } from 'hono'
import type { PlanAction } from './pg.ts'
import type { PgAuthLookupResult } from './pg_auth_lookup.ts'
import { eq, sql } from 'drizzle-orm'
import { cloudlog } from './logging.ts'
import { buildPlanValidationExpression, closeClient, getDrizzleClient, getPgClient, logPgError } from './pg.ts'
import { waitAuthPgRetryJitter, withAuthPgRetry } from './pg_auth_retry.ts'
import { isTransientPgError } from './pg_errors.ts'
import * as schema from './postgres_schema.ts'

/**
 * Get user_id from apikey using the existing Postgres function
 */
export async function getUserIdFromApikey(
  c: Context,
  apikey: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<PgAuthLookupResult<string>> {
  try {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'getUserIdFromApikey - querying',
      apikeyPrefix: apikey?.substring(0, 15),
    })

    const result = await withAuthPgRetry(() => drizzleClient.execute<{ get_user_id: string }>(
      sql`SELECT get_user_id(${apikey})`,
    ))

    const userId = result.rows[0]?.get_user_id ?? null

    cloudlog({
      requestId: c.get('requestId'),
      message: 'getUserIdFromApikey - result',
      userId,
    })

    if (!userId)
      return { kind: 'not_found' }

    return { kind: 'ok', value: userId }
  }
  catch (e: unknown) {
    logPgError(c, 'getUserIdFromApikey', e)
    return { kind: 'db_error', error: e }
  }
}

/**
 * Get app owner_org and plan validity for the given plan actions.
 * Each attempt runs on a fresh primary client: a Hyperdrive Client whose
 * connection dropped is not queryable, so retrying on it cannot recover.
 * Distinguishes database errors from a missing app so callers can return a
 * retryable database_unavailable instead of masking the failure.
 */
export async function getAppPlanStatePg(
  c: Context,
  appId: string,
  actions: PlanAction[],
): Promise<PgAuthLookupResult<{ owner_org: string, plan_valid: boolean }>> {
  if (actions.length === 0)
    throw new Error('getAppPlanStatePg requires at least one plan action')

  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    let pgClient: Awaited<ReturnType<typeof getPgClient>> | undefined
    try {
      pgClient = await getPgClient(c, false)
      const app = await getDrizzleClient(pgClient)
        .select({
          owner_org: schema.apps.owner_org,
          plan_valid: buildPlanValidationExpression(actions, schema.apps.owner_org),
        })
        .from(schema.apps)
        .where(eq(schema.apps.app_id, appId))
        .limit(1)
        .then(data => data[0])

      if (!app)
        return { kind: 'not_found' }

      return { kind: 'ok', value: app }
    }
    catch (e: unknown) {
      logPgError(c, `getAppPlanStatePg attempt ${attempt + 1}`, e)
      lastError = e
      if (attempt === 0 && isTransientPgError(e)) {
        await waitAuthPgRetryJitter()
        continue
      }
      break
    }
    finally {
      if (pgClient)
        await closeClient(c, pgClient)
    }
  }
  return { kind: 'db_error', error: lastError }
}
