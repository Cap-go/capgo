import type { Context } from 'hono'
import type { AuthInfo } from './hono.ts'
import type { Database } from './supabase.types.ts'
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { honoFactory, quickError } from './hono.ts'
import { cloudlog } from './logging.ts'
import { closeClient, getDrizzleClient, getPgClient, logPgError } from './pg.ts'
import * as schema from './postgres_schema.ts'
import { checkKey, checkKeyById, supabaseAdmin, supabaseClient } from './supabase.ts'

// =============================================================================
// RBAC Context Middleware
// =============================================================================

/**
 * Middleware that resolves and caches the RBAC feature flag for the current org.
 * Should be used after authentication middleware and when orgId is known.
 *
 * Usage:
 *   app.use('/app/*', middlewareV2(['all']), middlewareRbacContext())
 *
 * After this middleware runs:
 *   - c.get('rbacEnabled') - boolean indicating if RBAC is enabled for the org
 *   - c.get('resolvedOrgId') - the resolved org ID (if provided)
 */
export function middlewareRbacContext(options?: { orgIdResolver?: (c: Context) => string | null | Promise<string | null> }) {
  return honoFactory.createMiddleware(async (c, next) => {
    let orgId: string | null = null

    // Try to resolve orgId from provided resolver
    if (options?.orgIdResolver) {
      const resolved = options.orgIdResolver(c)
      orgId = resolved instanceof Promise ? await resolved : resolved
    }

    // If no orgId yet, try to get it from common sources
    if (!orgId) {
      // Try to get from query/body app_id and resolve to org
      const appId = c.req.query('app_id') || (await c.req.json().catch(() => ({})))?.app_id
      if (appId) {
        let pgClient
        try {
          pgClient = getPgClient(c, true)
          const drizzleClient = getDrizzleClient(pgClient)
          const appResult = await drizzleClient
            .select({ ownerOrg: schema.apps.owner_org })
            .from(schema.apps)
            .where(eq(schema.apps.app_id, appId))
            .limit(1)
          if (appResult.length > 0 && appResult[0].ownerOrg) {
            orgId = appResult[0].ownerOrg
          }
        }
        catch (e) {
          logPgError(c, 'middlewareRbacContext:resolveAppOrg', e)
        }
        finally {
          if (pgClient) {
            closeClient(c, pgClient)
          }
        }
      }
    }

    // If we have an orgId, check if RBAC is enabled
    if (orgId) {
      c.set('resolvedOrgId', orgId)
      let pgClient
      try {
        pgClient = getPgClient(c, true)
        const drizzleClient = getDrizzleClient(pgClient)
        const result = await drizzleClient.execute(
          sql`SELECT public.rbac_is_enabled_for_org(${orgId}::uuid) as enabled`,
        )
        const enabled = (result.rows[0] as any)?.enabled === true
        c.set('rbacEnabled', enabled)

        cloudlog({
          requestId: c.get('requestId'),
          message: 'middlewareRbacContext: resolved',
          orgId,
          rbacEnabled: enabled,
        })
      }
      catch (e) {
        logPgError(c, 'middlewareRbacContext:checkRbacEnabled', e)
        c.set('rbacEnabled', false)
      }
      finally {
        if (pgClient) {
          closeClient(c, pgClient)
        }
      }
    }
    else {
      c.set('rbacEnabled', false)
      cloudlog({
        requestId: c.get('requestId'),
        message: 'middlewareRbacContext: no orgId resolved, defaulting to legacy',
      })
    }

    await next()
  })
}

// TODO: make universal middleware who
//  Accept authorization header (JWT)
//  Accept capgkey header (legacy apikey header name for CLI)
//  Accept x-api-key header (new apikey header name for CLI + public api)
//  Accept x-limited-key-id header (subkey id, for whitelabel api, only work in combination with x-api-key)
// It takes rights as an argument, so it can be used in public and private api
// It sets apikey, capgkey, subkey to the context
// It throws an error if the apikey is invalid
// It throws an error if the subkey is invalid
// It throws an error if the apikey is invalid and the subkey is invalid
// It throws an error if the apikey is invalid and the subkey is invalid
// It throws an error if no apikey or subkey is provided
// It throws an error if the rights are invalid

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

/**
 * SQL condition for non-expired API keys: expires_at IS NULL OR expires_at > now()
 */
const notExpiredCondition = or(
  isNull(schema.apikeys.expires_at),
  sql`${schema.apikeys.expires_at} > now()`,
)

// Type for the find_apikey_by_value result
type FindApikeyByValueResult = {
  id: number
  created_at: string | null
  user_id: string
  key: string | null
  key_hash: string | null
  mode: Database['public']['Enums']['key_mode']
  updated_at: string | null
  name: string
  limited_to_orgs: string[] | null
  limited_to_apps: string[] | null
  expires_at: string | null
} & Record<string, unknown>

/**
 * Check API key using Postgres/Drizzle instead of Supabase SDK
 * Uses find_apikey_by_value SQL function to look up both plain-text and hashed keys
 */
async function checkKeyPg(
  _c: Context,
  keyString: string,
  rights: Database['public']['Enums']['key_mode'][],
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<Database['public']['Tables']['apikeys']['Row'] | null> {
  try {
    // Use find_apikey_by_value SQL function to look up both plain-text and hashed keys
    const result = await drizzleClient.execute<FindApikeyByValueResult>(
      sql`SELECT * FROM find_apikey_by_value(${keyString})`,
    )

    const apiKey = result.rows[0]
    if (!apiKey) {
      cloudlog({ requestId: _c.get('requestId'), message: 'Invalid apikey (pg)', keyStringPrefix: keyString?.substring(0, 8), rights })
      return null
    }

    // Check if mode is allowed
    if (!rights.includes(apiKey.mode)) {
      cloudlog({ requestId: _c.get('requestId'), message: 'Invalid apikey mode (pg)', keyStringPrefix: keyString?.substring(0, 8), rights, mode: apiKey.mode })
      return null
    }

    // Check if key is expired
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      cloudlog({ requestId: _c.get('requestId'), message: 'Apikey expired (pg)', keyStringPrefix: keyString?.substring(0, 8) })
      return null
    }

    // Convert to the expected format
    return {
      id: apiKey.id,
      created_at: apiKey.created_at,
      user_id: apiKey.user_id,
      key: apiKey.key,
      mode: apiKey.mode,
      updated_at: apiKey.updated_at,
      name: apiKey.name,
      limited_to_orgs: apiKey.limited_to_orgs || [],
      limited_to_apps: apiKey.limited_to_apps || [],
      expires_at: apiKey.expires_at,
    } as Database['public']['Tables']['apikeys']['Row']
  }
  catch (e: unknown) {
    logPgError(_c, 'checkKeyPg', e)
    return null
  }
}

/**
 * Check API key by ID using Postgres/Drizzle instead of Supabase SDK
 * Expiration is checked directly in SQL query - no JS check needed
 */
async function checkKeyByIdPg(
  _c: Context,
  id: number,
  rights: Database['public']['Enums']['key_mode'][],
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<Database['public']['Tables']['apikeys']['Row'] | null> {
  try {
    // Expiration check is done in SQL: expires_at IS NULL OR expires_at > now()
    const result = await drizzleClient
      .select()
      .from(schema.apikeys)
      .where(and(
        eq(schema.apikeys.id, id),
        inArray(schema.apikeys.mode, rights),
        notExpiredCondition,
      ))
      .limit(1)
      .then(data => data[0])

    if (!result) {
      return null
    }

    // Convert to the expected format, ensuring arrays are properly handled
    return {
      id: result.id,
      created_at: result.created_at?.toISOString() || null,
      user_id: result.user_id,
      key: result.key,
      mode: result.mode,
      updated_at: result.updated_at?.toISOString() || null,
      name: result.name,
      limited_to_orgs: result.limited_to_orgs || [],
      limited_to_apps: result.limited_to_apps || [],
      expires_at: result.expires_at?.toISOString() || null,
    } as Database['public']['Tables']['apikeys']['Row']
  }
  catch (e: unknown) {
    logPgError(_c, 'checkKeyByIdPg', e)
    return null
  }
}

async function foundAPIKey(c: Context, capgkeyString: string, rights: Database['public']['Enums']['key_mode'][]) {
  const subkey_id = c.req.header('x-limited-key-id') ? Number(c.req.header('x-limited-key-id')) : null

  cloudlog({ requestId: c.get('requestId'), message: 'Capgkey provided', capgkeyString })
  const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(c, capgkeyString, supabaseAdmin(c), rights)
  if (!apikey) {
    cloudlog({ requestId: c.get('requestId'), message: 'Invalid apikey', capgkeyString, rights })
    return quickError(401, 'invalid_apikey', 'Invalid apikey')
  }
  c.set('auth', {
    userId: apikey.user_id,
    authType: 'apikey',
    apikey,
  } as AuthInfo)
  c.set('apikey', apikey)
  // Store the original key string for hashed key authentication
  // This is needed because hashed keys have key=null in the database
  c.set('capgkey', capgkeyString)
  if (subkey_id) {
    cloudlog({ requestId: c.get('requestId'), message: 'Subkey id provided', subkey_id })
    const subkey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKeyById(c, subkey_id, supabaseAdmin(c), rights)
    cloudlog({ requestId: c.get('requestId'), message: 'Subkey', subkey })
    if (!subkey) {
      cloudlog({ requestId: c.get('requestId'), message: 'Invalid subkey', subkey_id })
      return quickError(401, 'invalid_subkey', 'Invalid subkey')
    }
    if (subkey && subkey.user_id !== apikey.user_id) {
      cloudlog({ requestId: c.get('requestId'), message: 'Subkey user_id does not match apikey user_id', subkey, apikey })
      return quickError(401, 'invalid_subkey', 'Invalid subkey')
    }
    if (subkey?.limited_to_apps && subkey?.limited_to_apps.length === 0 && subkey?.limited_to_orgs && subkey?.limited_to_orgs.length === 0) {
      cloudlog({ requestId: c.get('requestId'), message: 'Invalid subkey, no limited apps or orgs', subkey })
      return quickError(401, 'invalid_subkey', 'Invalid subkey, no limited apps or orgs')
    }
    if (subkey) {
      c.set('auth', {
        userId: apikey.user_id,
        authType: 'apikey',
        apikey: subkey,
      } as AuthInfo)
      c.set('subkey', subkey)
    }
  }
}

async function foundJWT(c: Context, jwt: string) {
  cloudlog({ requestId: c.get('requestId'), message: 'JWT provided', jwt })
  const supabaseJWT = supabaseClient(c, jwt)
  const { data: user, error: userError } = await supabaseJWT.auth.getUser()
  if (userError) {
    cloudlog({ requestId: c.get('requestId'), message: 'Invalid JWT', userError })
    return quickError(401, 'invalid_jwt', 'Invalid JWT')
  }
  c.set('auth', {
    userId: user.user?.id,
    authType: 'jwt',
    jwt,
  } as AuthInfo)
}

export function middlewareV2(rights: Database['public']['Enums']['key_mode'][]) {
  return honoFactory.createMiddleware(async (c, next) => {
    let jwt = c.req.header('authorization')
    let capgkey = c.req.header('capgkey') ?? c.req.header('x-api-key')

    // make sure jwt is valid otherwise it means it was an apikey and you need to set it in capgkey_string
    // if jwt is uuid, it means it was an apikey and you need to set it in capgkey_string
    if (jwt && isUUID(jwt)) {
      cloudlog({ requestId: c.get('requestId'), message: 'Setting apikey in capgkey_string', jwt })
      capgkey = jwt
      jwt = undefined
    }
    if (jwt) {
      await foundJWT(c, jwt)
    }
    else if (capgkey) {
      await foundAPIKey(c, capgkey, rights)
    }
    else {
      cloudlog({ requestId: c.get('requestId'), message: 'No apikey or subkey provided' })
      return quickError(401, 'no_jwt_apikey_or_subkey', 'No JWT, apikey or subkey provided')
    }
    await next()
  })
}

export function middlewareKey(rights: Database['public']['Enums']['key_mode'][], usePostgres = false) {
  const subMiddlewareKey = honoFactory.createMiddleware(async (c, next) => {
    const capgkey_string = c.req.header('capgkey')
    const apikey_string = c.req.header('authorization')
    const subkey_id = c.req.header('x-limited-key-id') ? Number(c.req.header('x-limited-key-id')) : null
    const key = capgkey_string ?? apikey_string

    cloudlog({
      requestId: c.get('requestId'),
      message: 'middlewareKey - checking authorization',
      method: c.req.method,
      url: c.req.url,
      hasCapgkey: !!capgkey_string,
      hasAuthorization: !!apikey_string,
      hasKey: !!key,
      usePostgres,
    })
    if (!key) {
      cloudlog({ requestId: c.get('requestId'), message: 'No key provided', method: c.req.method, url: c.req.url })
      return quickError(401, 'no_key_provided', 'No key provided')
    }

    let apikey: Database['public']['Tables']['apikeys']['Row'] | null = null
    let pgClient: ReturnType<typeof getPgClient> | null = null

    if (usePostgres) {
      try {
        pgClient = getPgClient(c, true) // read-only query
        const drizzleClient = getDrizzleClient(pgClient)
        apikey = await checkKeyPg(c, key, rights, drizzleClient)
      }
      finally {
        if (pgClient) {
          await closeClient(c, pgClient)
        }
      }
    }
    else {
      apikey = await checkKey(c, key, supabaseAdmin(c), rights)
    }

    if (!apikey) {
      cloudlog({ requestId: c.get('requestId'), message: 'Invalid apikey', key, method: c.req.method, url: c.req.url })
      return quickError(401, 'invalid_apikey', 'Invalid apikey')
    }
    c.set('apikey', apikey)
    c.set('capgkey', key)

    // Set auth context for RBAC (can be overridden by subkey below)
    c.set('auth', {
      userId: apikey.user_id,
      authType: 'apikey',
      apikey,
    } as AuthInfo)

    if (subkey_id) {
      let subkey: Database['public']['Tables']['apikeys']['Row'] | null = null
      let subkeyPgClient: ReturnType<typeof getPgClient> | null = null

      if (usePostgres) {
        try {
          subkeyPgClient = getPgClient(c, true)
          const drizzleClient = getDrizzleClient(subkeyPgClient)
          subkey = await checkKeyByIdPg(c, subkey_id, rights, drizzleClient)
        }
        finally {
          if (subkeyPgClient) {
            subkeyPgClient.end().catch((err) => {
              cloudlog({
                requestId: c.get('requestId'),
                message: 'middlewareKey - Subkey PG connection close error',
                error: err instanceof Error ? err.message : String(err),
              })
            })
          }
        }
      }
      else {
        subkey = await checkKeyById(c, subkey_id, supabaseAdmin(c), rights)
      }

      if (!subkey) {
        cloudlog({ requestId: c.get('requestId'), message: 'Invalid subkey', subkey_id })
        return quickError(401, 'invalid_subkey', 'Invalid subkey')
      }
      if (subkey?.limited_to_apps && subkey?.limited_to_apps.length === 0 && subkey?.limited_to_orgs && subkey?.limited_to_orgs.length === 0) {
        cloudlog({ requestId: c.get('requestId'), message: 'Invalid subkey, no limited apps or orgs', subkey })
        return quickError(401, 'invalid_subkey', 'Invalid subkey, no limited apps or orgs')
      }
      if (subkey) {
        c.set('subkey', subkey)
        // Override auth context with subkey for RBAC
        c.set('auth', {
          userId: apikey!.user_id,
          authType: 'apikey',
          apikey: subkey,
        } as AuthInfo)
      }
    }
    await next()
  })
  return subMiddlewareKey
}
