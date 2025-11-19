import type { Context } from 'hono'
import type { getDrizzleClient } from './pg.ts'
import type { Database } from './supabase.types.ts'
import { eq, sql } from 'drizzle-orm'
import { cloudlog } from './logging.ts'
import { logPgError } from './pg.ts'
import * as schema from './postgres_schema.ts'

/**
 * Get user_id from apikey using the existing Postgres function
 */
export async function getUserIdFromApikey(
  c: Context,
  apikey: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<string | null> {
  try {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'getUserIdFromApikey - querying',
      apikeyPrefix: apikey?.substring(0, 15),
    })

    // Call the existing Postgres function
    const result = await drizzleClient.execute<{ get_user_id: string }>(
      sql`SELECT get_user_id(${apikey})`,
    )

    const userId = result.rows[0]?.get_user_id ?? null

    cloudlog({
      requestId: c.get('requestId'),
      message: 'getUserIdFromApikey - result',
      userId,
    })

    return userId
  }
  catch (e: unknown) {
    logPgError(c, 'getUserIdFromApikey', e)
    return null
  }
}

/**
 * Get owner_org from app_id using the existing Postgres function
 */
export async function getOwnerOrgByAppId(
  c: Context,
  appId: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<string | null> {
  try {
    // Call the existing Postgres function
    const result = await drizzleClient.execute<{ get_user_main_org_id_by_app_id: string }>(
      sql`SELECT get_user_main_org_id_by_app_id(${appId})`,
    )

    return result.rows[0]?.get_user_main_org_id_by_app_id ?? null
  }
  catch (e: unknown) {
    logPgError(c, 'getOwnerOrgByAppId', e)
    return null
  }
}

/**
 * Check minimum rights for a user using the existing Postgres function
 */
export async function checkMinRightsPg(
  c: Context,
  minRight: Database['public']['Enums']['user_min_right'],
  userId: string,
  orgId: string,
  appId: string | null,
  channelId: number | null,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<boolean> {
  try {
    if (!userId) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'checkMinRightsPg - userId is null',
      })
      return false
    }

    // Call the existing Postgres function
    const result = await drizzleClient.execute<{ check_min_rights: boolean }>(
      sql`SELECT check_min_rights(${minRight}::user_min_right, ${userId}::uuid, ${orgId}::uuid, ${appId}, ${channelId})`,
    )

    const hasPermission = result.rows[0]?.check_min_rights ?? false

    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkMinRightsPg - result',
      hasPermission,
      minRight,
      userId,
      orgId,
      appId,
      channelId,
    })

    return hasPermission
  }
  catch (e: unknown) {
    logPgError(c, 'checkMinRightsPg', e)
    return false
  }
}

/**
 * Check if an API key has the right access to an app using the existing Postgres function
 */
export async function hasAppRightApikeyPg(
  c: Context,
  appId: string,
  right: Database['public']['Enums']['user_min_right'],
  userId: string,
  apikey: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<boolean> {
  try {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'hasAppRightApikeyPg - start',
      appId,
      right,
      userId,
      apikeyPrefix: apikey?.substring(0, 15),
    })

    // Call the existing Postgres function
    const result = await drizzleClient.execute<{ has_app_right_apikey: boolean }>(
      sql`SELECT has_app_right_apikey(${appId}, ${right}::user_min_right, ${userId}::uuid, ${apikey})`,
    )

    const hasPermission = result.rows[0]?.has_app_right_apikey ?? false

    cloudlog({
      requestId: c.get('requestId'),
      message: 'hasAppRightApikeyPg - result',
      hasPermission,
    })

    return hasPermission
  }
  catch (e: unknown) {
    logPgError(c, 'hasAppRightApikeyPg', e)
    return false
  }
}

/**
 * Get app by app_id with owner_org
 */
export async function getAppByAppIdPg(
  c: Context,
  appId: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<{ app_id: string, owner_org: string } | null> {
  try {
    const app = await drizzleClient
      .select({
        app_id: schema.apps.app_id,
        owner_org: schema.apps.owner_org,
      })
      .from(schema.apps)
      .where(eq(schema.apps.app_id, appId))
      .limit(1)
      .then(data => data[0])

    return app ?? null
  }
  catch (e: unknown) {
    logPgError(c, 'getAppByAppIdPg', e)
    return null
  }
}
