import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import { and, eq } from 'drizzle-orm'
import { cloudlog } from './logging.ts'
import { getDrizzleClient, logPgError } from './pg.ts'
import * as schema from './postgres_schema.ts'

/**
 * Get user_id from apikey using Postgres/Drizzle
 * Equivalent to the get_user_id(apikey) RPC function
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

    const result = await drizzleClient
      .select({ user_id: schema.apikeys.user_id })
      .from(schema.apikeys)
      .where(eq(schema.apikeys.key, apikey))
      .limit(1)
      .then(data => data[0])

    cloudlog({
      requestId: c.get('requestId'),
      message: 'getUserIdFromApikey - result',
      userId: result?.user_id ?? null,
    })

    return result?.user_id ?? null
  }
  catch (e: unknown) {
    logPgError(c, 'getUserIdFromApikey', e)
    return null
  }
}

/**
 * Get owner_org from app_id using Postgres/Drizzle
 * Equivalent to get_user_main_org_id_by_app_id(app_id) RPC function
 */
export async function getOwnerOrgByAppId(
  c: Context,
  appId: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<string | null> {
  try {
    const result = await drizzleClient
      .select({ owner_org: schema.apps.owner_org })
      .from(schema.apps)
      .where(eq(schema.apps.app_id, appId))
      .limit(1)
      .then(data => data[0])

    return result?.owner_org ?? null
  }
  catch (e: unknown) {
    logPgError(c, 'getOwnerOrgByAppId', e)
    return null
  }
}

/**
 * Check minimum rights for a user
 * Equivalent to check_min_rights(min_right, user_id, org_id, app_id, channel_id) RPC function
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

    // Get all user rights for this org and user
    const userRights = await drizzleClient
      .select({
        user_right: schema.org_users.user_right,
        app_id: schema.org_users.app_id,
        channel_id: schema.org_users.channel_id,
      })
      .from(schema.org_users)
      .where(and(
        eq(schema.org_users.org_id, orgId),
        eq(schema.org_users.user_id, userId),
      ))

    // Define the right hierarchy
    const rightHierarchy: Record<Database['public']['Enums']['user_min_right'], number> = {
      'invite_read': 0,
      'invite_upload': 1,
      'invite_write': 2,
      'invite_admin': 3,
      'invite_super_admin': 3.5,
      'read': 4,
      'upload': 5,
      'write': 6,
      'admin': 7,
      'super_admin': 8,
    }

    const minRightLevel = rightHierarchy[minRight]

    // Check if any of the user's rights meet the minimum requirement
    for (const userRight of userRights) {
      if (!userRight.user_right)
        continue

      const userRightLevel = rightHierarchy[userRight.user_right]

      // Check conditions as in the SQL function
      const hasOrgWideRight = userRightLevel >= minRightLevel
        && userRight.app_id === null
        && userRight.channel_id === null

      const hasAppRight = userRightLevel >= minRightLevel
        && userRight.app_id === appId
        && userRight.channel_id === null

      const hasChannelRight = userRightLevel >= minRightLevel
        && userRight.app_id === appId
        && userRight.channel_id === channelId

      if (hasOrgWideRight || hasAppRight || hasChannelRight) {
        cloudlog({
          requestId: c.get('requestId'),
          message: 'checkMinRightsPg - permission granted',
          minRight,
          userRight: userRight.user_right,
          hasOrgWideRight,
          hasAppRight,
          hasChannelRight,
        })
        return true
      }
    }

    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkMinRightsPg - permission denied',
      minRight,
      userId,
      orgId,
      appId,
      channelId,
      userRightsCount: userRights.length,
    })

    return false
  }
  catch (e: unknown) {
    logPgError(c, 'checkMinRightsPg', e)
    return false
  }
}

/**
 * Check if an API key has the right access to an app
 * Equivalent to has_app_right_apikey(appid, right, userid, apikey) RPC function
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

    // Get owner_org for the app
    const orgId = await getOwnerOrgByAppId(c, appId, drizzleClient)
    if (!orgId) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'hasAppRightApikeyPg - org not found',
        appId,
      })
      return false
    }

    // Get the apikey record
    const apiKeyRecord = await drizzleClient
      .select({
        limited_to_orgs: schema.apikeys.limited_to_orgs,
        limited_to_apps: schema.apikeys.limited_to_apps,
      })
      .from(schema.apikeys)
      .where(eq(schema.apikeys.key, apikey))
      .limit(1)
      .then(data => data[0])

    if (!apiKeyRecord) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'hasAppRightApikeyPg - apikey not found',
      })
      return false
    }

    // Check if apikey is limited to specific orgs
    if (apiKeyRecord.limited_to_orgs && apiKeyRecord.limited_to_orgs.length > 0) {
      if (!apiKeyRecord.limited_to_orgs.includes(orgId)) {
        cloudlog({
          requestId: c.get('requestId'),
          message: 'hasAppRightApikeyPg - org restriction denied',
          orgId,
          limitedToOrgs: apiKeyRecord.limited_to_orgs,
        })
        return false
      }
    }

    // Check if apikey is limited to specific apps
    if (apiKeyRecord.limited_to_apps && apiKeyRecord.limited_to_apps.length > 0) {
      if (!apiKeyRecord.limited_to_apps.includes(appId)) {
        cloudlog({
          requestId: c.get('requestId'),
          message: 'hasAppRightApikeyPg - app restriction denied',
          appId,
          limitedToApps: apiKeyRecord.limited_to_apps,
        })
        return false
      }
    }

    // Check minimum rights
    const hasRights = await checkMinRightsPg(c, right, userId, orgId, appId, null, drizzleClient)

    cloudlog({
      requestId: c.get('requestId'),
      message: 'hasAppRightApikeyPg - final result',
      hasRights,
    })

    return hasRights
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

