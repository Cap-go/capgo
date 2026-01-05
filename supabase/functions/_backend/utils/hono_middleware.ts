import type { Context } from 'hono'
import type { AuthInfo } from './hono.ts'
import type { Database } from './supabase.types.ts'
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { hashApiKey } from './hash.ts'
import { honoFactory, quickError } from './hono.ts'
import { cloudlog } from './logging.ts'
import { closeClient, getDrizzleClient, getPgClient, logPgError } from './pg.ts'
import * as schema from './postgres_schema.ts'
import { checkKey, checkKeyById, supabaseAdmin, supabaseClient } from './supabase.ts'

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

/**
 * Check API key using Postgres/Drizzle instead of Supabase SDK
 * Expiration is checked directly in SQL query - no JS check needed
 */
async function checkKeyPg(
  _c: Context,
  keyString: string,
  rights: Database['public']['Enums']['key_mode'][],
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<Database['public']['Tables']['apikeys']['Row'] | null> {
  try {
    // Compute hash upfront so we can check both plain-text and hashed keys in one query
    const keyHash = await hashApiKey(keyString)

    // Single query: match by plain-text key OR hashed key
    // Expiration check is done in SQL: expires_at IS NULL OR expires_at > now()
    const result = await drizzleClient
      .select()
      .from(schema.apikeys)
      .where(and(
        or(
          eq(schema.apikeys.key, keyString),
          eq(schema.apikeys.key_hash, keyHash),
        ),
        inArray(schema.apikeys.mode, rights),
        notExpiredCondition,
      ))
      .limit(1)
      .then(data => data[0])

    if (!result) {
      cloudlog({ requestId: _c.get('requestId'), message: 'Invalid apikey (pg)', keyStringPrefix: keyString?.substring(0, 8), rights })
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
