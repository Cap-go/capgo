import type { Context } from 'hono'
import type { AuthInfo } from './hono.ts'
import type { Database } from './supabase.types.ts'
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { honoFactory, quickError, simpleRateLimit } from './hono.ts'
import { cloudlog } from './logging.ts'
import { closeClient, getDrizzleClient, getPgClient, logPgError } from './pg.ts'
import * as schema from './postgres_schema.ts'
import { clearFailedAuth, isAPIKeyRateLimited, isIPRateLimited, recordAPIKeyUsage, recordFailedAuth } from './rate_limit.ts'
import { checkKey, checkKeyById, supabaseAdmin, supabaseClient } from './supabase.ts'
import { backgroundTask } from './utils.ts'

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
    // Record failed auth attempt for invalid API key
    backgroundTask(c, recordFailedAuth(c))
    return quickError(401, 'invalid_apikey', 'Invalid apikey')
  }

  // Check if API key is rate limited
  const apiKeyRateLimited = await isAPIKeyRateLimited(c, apikey.id)
  if (apiKeyRateLimited) {
    return simpleRateLimit({ reason: 'api_key_rate_limit_exceeded', apikey_id: apikey.id })
  }

  // Clear failed auth attempts on successful auth and record API usage
  backgroundTask(c, clearFailedAuth(c))
  backgroundTask(c, recordAPIKeyUsage(c, apikey.id))

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
    // Record failed auth attempt for invalid JWT
    backgroundTask(c, recordFailedAuth(c))
    return quickError(401, 'invalid_jwt', 'Invalid JWT')
  }
  // Clear failed auth attempts on successful JWT auth
  backgroundTask(c, clearFailedAuth(c))
  c.set('auth', {
    userId: user.user?.id,
    authType: 'jwt',
    jwt,
  } as AuthInfo)
}

export function middlewareV2(rights: Database['public']['Enums']['key_mode'][]) {
  return honoFactory.createMiddleware(async (c, next) => {
    // Check if IP is rate limited due to failed auth attempts
    const ipRateLimited = await isIPRateLimited(c)
    if (ipRateLimited) {
      return simpleRateLimit({ reason: 'too_many_failed_auth_attempts' })
    }

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
      // Record failed auth attempt for missing credentials
      backgroundTask(c, recordFailedAuth(c))
      return quickError(401, 'no_jwt_apikey_or_subkey', 'No JWT, apikey or subkey provided')
    }
    await next()
  })
}

export function middlewareKey(rights: Database['public']['Enums']['key_mode'][], usePostgres = false) {
  const subMiddlewareKey = honoFactory.createMiddleware(async (c, next) => {
    // Check if IP is rate limited due to failed auth attempts
    const ipRateLimited = await isIPRateLimited(c)
    if (ipRateLimited) {
      return simpleRateLimit({ reason: 'too_many_failed_auth_attempts' })
    }

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
      // Record failed auth attempt for missing key
      backgroundTask(c, recordFailedAuth(c))
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
      // Record failed auth attempt for invalid API key
      backgroundTask(c, recordFailedAuth(c))
      return quickError(401, 'invalid_apikey', 'Invalid apikey')
    }

    // Check if API key is rate limited
    const apiKeyRateLimited = await isAPIKeyRateLimited(c, apikey.id)
    if (apiKeyRateLimited) {
      return simpleRateLimit({ reason: 'api_key_rate_limit_exceeded', apikey_id: apikey.id })
    }

    // Clear failed auth attempts on successful auth and record API usage
    backgroundTask(c, clearFailedAuth(c))
    backgroundTask(c, recordAPIKeyUsage(c, apikey.id))

    c.set('apikey', apikey)
    c.set('capgkey', key)

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
      if (subkey)
        c.set('subkey', subkey)
    }
    await next()
  })
  return subMiddlewareKey
}
