import type { Context } from 'hono'
import type { PgClient, PlanAction } from './pg.ts'
import type { PgAuthLookupResult } from './pg_auth_lookup.ts'
import { eq, sql } from 'drizzle-orm'
import { cloudlog } from './logging.ts'
import { buildPlanValidationExpression, closeClient, getDrizzleClient, getPgClient, logPgError } from './pg.ts'
import { waitAuthPgRetryJitter } from './pg_auth_retry.ts'
import { isTransientPgError } from './pg_errors.ts'
import * as schema from './postgres_schema.ts'

/**
 * Get user_id from apikey using the existing Postgres function
 */
export async function getUserIdFromApikey(
  c: Context,
  apikey: string,
  pgClient: PgClient,
): Promise<PgAuthLookupResult<string>> {
  try {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'getUserIdFromApikey - querying',
      apikeyPrefix: apikey?.substring(0, 15),
    })

    const result = await withFreshPgRetry(c, 'getUserIdFromApikey', pgClient, client => getDrizzleClient(client).execute<{ get_user_id: string }>(
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
    return { kind: 'db_error', error: e }
  }
}

/**
 * Run a primary read on the caller's client; after a transient failure retry
 * once on a fresh primary client. A Hyperdrive Client whose connection dropped
 * is not queryable, so retrying on the same client cannot recover.
 * Throws the last error; each failure is logged under `source`.
 */
export async function withFreshPgRetry<T>(
  c: Context,
  source: string,
  primaryClient: PgClient,
  run: (client: PgClient) => Promise<T>,
): Promise<T> {
  try {
    return await run(primaryClient)
  }
  catch (e: unknown) {
    logPgError(c, source, e)
    if (!isTransientPgError(e))
      throw e
  }

  await waitAuthPgRetryJitter()
  let freshClient: PgClient | undefined
  try {
    freshClient = await getPgClient(c, false)
    return await run(freshClient)
  }
  catch (e: unknown) {
    logPgError(c, `${source} retry`, e)
    throw e
  }
  finally {
    if (freshClient)
      await closeClient(c, freshClient)
  }
}

/**
 * Get app owner_org and plan validity for the given plan actions.
 * Distinguishes database errors from a missing app so callers can return a
 * retryable database_unavailable instead of masking the failure.
 */
export async function getAppPlanStatePg(
  c: Context,
  appId: string,
  pgClient: PgClient,
  actions: PlanAction[],
): Promise<PgAuthLookupResult<{ owner_org: string, plan_valid: boolean }>> {
  if (actions.length === 0)
    throw new Error('getAppPlanStatePg requires at least one plan action')

  try {
    const app = await withFreshPgRetry(c, 'getAppPlanStatePg', pgClient, client => getDrizzleClient(client)
      .select({
        owner_org: schema.apps.owner_org,
        plan_valid: buildPlanValidationExpression(actions, schema.apps.owner_org),
      })
      .from(schema.apps)
      .where(eq(schema.apps.app_id, appId))
      .limit(1)
      .then(data => data[0]))
    return app ? { kind: 'ok', value: app } : { kind: 'not_found' }
  }
  catch (e: unknown) {
    return { kind: 'db_error', error: e }
  }
}
