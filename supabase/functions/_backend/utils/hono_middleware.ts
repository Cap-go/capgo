import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { SignJWT } from 'jose'
import { getClaimsFromJWT, honoFactory, quickError, simpleRateLimit } from './hono.ts'
import { cloudlog, cloudlogErr } from './logging.ts'
import { closeClient, getDrizzleClient, getPgClient, logPgError } from './pg.ts'
import * as schema from './postgres_schema.ts'
import { isAPIKeyRateLimited, isIPRateLimited, recordAPIKeyUsage, recordFailedAuth } from './rate_limit.ts'
import { buildRateLimitInfo } from './rateLimitInfo.ts'
import { checkKey, checkKeyById, supabaseAdmin } from './supabase.ts'
import { getEnv } from './utils.ts'

// =============================================================================
// RBAC Context Middleware
// =============================================================================

interface RbacContextOptions {
  orgIdResolver?: (c: Context) => string | null | Promise<string | null>
}

async function getAppIdFromRequest(c: Context) {
  const queryAppId = c.req.query('app_id')
  if (queryAppId) {
    return queryAppId
  }
  const body = await c.req.raw.clone().json().catch(() => ({ app_id: null })) as { app_id: string | null }
  return body.app_id ?? null
}

async function fetchOrgIdFromAppId(c: Context, appId: string) {
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
      return appResult[0].ownerOrg
    }
  }
  catch (e) {
    logPgError(c, 'middlewareRbacContext:resolveAppOrg', e)
  }
  finally {
    if (pgClient) {
      await closeClient(c, pgClient)
    }
  }
  return null
}

async function resolveOrgIdForRbac(c: Context, options?: RbacContextOptions) {
  if (options?.orgIdResolver) {
    const orgId = await Promise.resolve(options.orgIdResolver(c))
    if (orgId) {
      return orgId
    }
  }

  const appId = await getAppIdFromRequest(c)
  if (!appId) {
    return null
  }

  return fetchOrgIdFromAppId(c, appId)
}

async function setRbacContextForOrg(c: Context, orgId: string) {
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
      await closeClient(c, pgClient)
    }
  }
}

function setRbacContextLegacy(c: Context) {
  c.set('rbacEnabled', false)
  cloudlog({
    requestId: c.get('requestId'),
    message: 'middlewareRbacContext: no orgId resolved, defaulting to legacy',
  })
}

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
export function middlewareRbacContext(options?: RbacContextOptions) {
  return honoFactory.createMiddleware(async (c, next) => {
    const orgId = await resolveOrgIdForRbac(c, options)
    if (orgId) {
      await setRbacContextForOrg(c, orgId)
    }
    else {
      setRbacContextLegacy(c)
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

function maskSecret(value?: string | null) {
  if (!value) {
    return undefined
  }
  return `${value.slice(0, 8)}...`
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
  expectedUserId?: string,
): Promise<Database['public']['Tables']['apikeys']['Row'] | null> {
  try {
    const conditions = [
      eq(schema.apikeys.id, id),
      inArray(schema.apikeys.mode, rights),
      notExpiredCondition,
    ]
    if (expectedUserId) {
      conditions.push(eq(schema.apikeys.user_id, expectedUserId))
    }
    // Expiration check is done in SQL: expires_at IS NULL OR expires_at > now()
    const result = await drizzleClient
      .select()
      .from(schema.apikeys)
      .where(and(
        ...conditions,
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

function getSubkeyId(c: Context) {
  const headerValue = c.req.header('x-limited-key-id')
  return headerValue ? Number(headerValue) : null
}

function setApiKeyAuthContext(c: Context, apikey: Database['public']['Tables']['apikeys']['Row'], keyString: string) {
  c.set('auth', {
    userId: apikey.user_id,
    authType: 'apikey',
    apikey,
    jwt: null,
  })
  c.set('apikey', apikey)
  c.set('capgkey', keyString)
}

function setSubkeyAuthContext(c: Context, userId: string, subkey: Database['public']['Tables']['apikeys']['Row']) {
  c.set('auth', {
    userId,
    authType: 'apikey',
    apikey: subkey,
    jwt: null,
  })
  c.set('subkey', subkey)
}

function hasEmptySubkeyLimits(subkey: Database['public']['Tables']['apikeys']['Row']) {
  const apps = subkey.limited_to_apps
  const orgs = subkey.limited_to_orgs
  return Array.isArray(apps) && apps.length === 0 && Array.isArray(orgs) && orgs.length === 0
}

function validateSubkeyLimits(c: Context, subkey: Database['public']['Tables']['apikeys']['Row']) {
  if (hasEmptySubkeyLimits(subkey)) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Invalid subkey, no limited apps or orgs',
      subkeyId: subkey.id,
      subkeyUserId: subkey.user_id,
    })
    return quickError(401, 'invalid_subkey', 'Invalid subkey, no limited apps or orgs')
  }
  return null
}

function validateSubkeyUser(c: Context, subkey: Database['public']['Tables']['apikeys']['Row'], apikey: Database['public']['Tables']['apikeys']['Row']) {
  if (subkey.user_id !== apikey.user_id) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Subkey user_id does not match apikey user_id',
      subkeyId: subkey.id,
      subkeyUserId: subkey.user_id,
      apikeyId: apikey.id,
      apikeyUserId: apikey.user_id,
    })
    return quickError(401, 'invalid_subkey', 'Invalid subkey')
  }
  return null
}

function resolveAuthHeaders(c: Context) {
  let jwt = c.req.header('authorization')
  let capgkey = c.req.header('capgkey') ?? c.req.header('x-api-key')

  if (jwt && isUUID(jwt)) {
    cloudlog({ requestId: c.get('requestId'), message: 'Setting apikey in capgkey_string', jwtPrefix: maskSecret(jwt) })
    capgkey = jwt
    jwt = undefined
  }

  return { jwt, capgkey }
}

function resolveKeyHeaders(c: Context) {
  const capgkeyString = c.req.header('capgkey')
  const apikeyString = c.req.header('authorization')
  const key = capgkeyString ?? apikeyString
  return { capgkeyString, apikeyString, key }
}

async function resolveApiKey(
  c: Context,
  key: string,
  rights: Database['public']['Enums']['key_mode'][],
  usePostgres: boolean,
) {
  if (!usePostgres) {
    return checkKey(c, key, supabaseAdmin(c), rights)
  }

  let pgClient: ReturnType<typeof getPgClient> | null = null
  try {
    pgClient = getPgClient(c, true)
    const drizzleClient = getDrizzleClient(pgClient)
    return await checkKeyPg(c, key, rights, drizzleClient)
  }
  finally {
    if (pgClient) {
      await closeClient(c, pgClient)
    }
  }
}

async function resolveSubkey(
  c: Context,
  subkeyId: number,
  rights: Database['public']['Enums']['key_mode'][],
  usePostgres: boolean,
  expectedUserId?: string,
) {
  if (!usePostgres) {
    return checkKeyById(c, subkeyId, supabaseAdmin(c), rights, expectedUserId)
  }

  let subkeyPgClient: ReturnType<typeof getPgClient> | null = null
  try {
    subkeyPgClient = getPgClient(c, true)
    const drizzleClient = getDrizzleClient(subkeyPgClient)
    return await checkKeyByIdPg(c, subkeyId, rights, drizzleClient, expectedUserId)
  }
  finally {
    if (subkeyPgClient) {
      await closeClient(c, subkeyPgClient)
    }
  }
}

// =============================================================================
// Service Principal Provisioning (Phase 2)
// =============================================================================

/**
 * Row returned by the get_service_principal_info() SQL function.
 * Used to drive lazy service-principal provisioning in the middleware.
 */
interface ServicePrincipalInfoRow extends Record<string, unknown> {
  apikey_id: number
  service_principal_id: string
  owner_user_id: string
  is_provisioned: boolean
  key_mode: Database['public']['Enums']['key_mode']
  is_expired: boolean
  limited_to_orgs: string[] | null
  limited_to_apps: string[] | null
}

/**
 * Fetches service-principal metadata for the given API key value.
 * Returns null when the key is not found (already validated upstream).
 */
async function fetchServicePrincipalInfo(
  c: Context,
  keyString: string,
): Promise<ServicePrincipalInfoRow | null> {
  let pgClient: ReturnType<typeof getPgClient> | null = null
  try {
    pgClient = getPgClient(c, true)
    const drizzle = getDrizzleClient(pgClient)
    const result = await drizzle.execute<ServicePrincipalInfoRow>(
      sql`SELECT * FROM public.get_service_principal_info(${keyString})`,
    )
    return result.rows[0] ?? null
  }
  catch (e) {
    logPgError(c, 'fetchServicePrincipalInfo', e)
    return null
  }
  finally {
    if (pgClient) {
      await closeClient(c, pgClient)
    }
  }
}

/**
 * Creates an auth.users entry for the service principal (id = rbacId) and
 * marks the API key as provisioned.  Idempotent: if the user already exists
 * the error is silently ignored so the mark still runs.
 */
async function provisionServicePrincipal(
  c: Context,
  apikeyId: number,
  rbacId: string,
): Promise<void> {
  // Use a dedicated admin client for the createUser call (per AGENTS.md pitfall warning)
  const adminClient = supabaseAdmin(c)

  const { error: createError } = await adminClient.auth.admin.createUser({
    id: rbacId,
    // Service principals never sign in via email/password; the address is
    // stable but non-deliverable and only kept for auth system uniqueness.
    email: `sp-${rbacId}@service.capgo.internal`,
    email_confirm: true,
  })

  if (createError && !createError.message.includes('already been registered')) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'provisionServicePrincipal: createUser failed',
      rbacId,
      error: createError.message,
    })
    // Non-fatal: return without marking provisioned; next request will retry
    return
  }

  // Mark provisioned via a separate PG client (keeps admin client clean)
  let pgClient: ReturnType<typeof getPgClient> | null = null
  try {
    pgClient = getPgClient(c, true)
    const drizzle = getDrizzleClient(pgClient)
    await drizzle.execute(
      sql`SELECT public.mark_service_principal_provisioned(${apikeyId}::bigint, ${rbacId}::uuid)`,
    )
    cloudlog({
      requestId: c.get('requestId'),
      message: 'provisionServicePrincipal: provisioned',
      apikeyId,
      rbacId,
    })
  }
  catch (e) {
    logPgError(c, 'provisionServicePrincipal:markProvisioned', e)
  }
  finally {
    if (pgClient) {
      await closeClient(c, pgClient)
    }
  }
}

/**
 * Signs a short-lived Supabase-compatible JWT with sub = rbacId.
 * The JWT is stored in context so handlers can opt in to the
 * service-principal auth path (Phase 3 will flip the default).
 */
async function signServicePrincipalJwt(c: Context, rbacId: string): Promise<string | null> {
  try {
    const jwtSecret = getEnv(c, 'JWT_SECRET')
    const secret = new TextEncoder().encode(jwtSecret)
    return await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('supabase')
      .setSubject(rbacId)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret)
  }
  catch (e) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'signServicePrincipalJwt: failed to sign JWT',
      rbacId,
      error: String(e),
    })
    return null
  }
}

/**
 * Orchestrates lazy service-principal provisioning for an API key request.
 * On first use: creates auth.users entry + marks key as provisioned.
 * Every request: signs a short-lived JWT and stores it in context.
 * Non-fatal: any failure is logged and the request continues normally.
 */
async function applyServicePrincipal(c: Context, keyString: string): Promise<void> {
  const info = await fetchServicePrincipalInfo(c, keyString)
  if (!info) {
    return
  }

  if (!info.is_provisioned) {
    await provisionServicePrincipal(c, info.apikey_id, info.service_principal_id)
  }

  const jwt = await signServicePrincipalJwt(c, info.service_principal_id)
  if (jwt) {
    c.set('servicePrincipalJwt', jwt)
    cloudlog({
      requestId: c.get('requestId'),
      message: 'applyServicePrincipal: service principal JWT set',
      servicePrincipalId: info.service_principal_id,
      wasProvisioned: info.is_provisioned,
    })
  }
}

async function foundAPIKey(c: Context, capgkeyString: string, rights: Database['public']['Enums']['key_mode'][]) {
  const subkey_id = getSubkeyId(c)

  cloudlog({ requestId: c.get('requestId'), message: 'Capgkey provided', capgkeyPrefix: maskSecret(capgkeyString) })
  const apikey = await resolveApiKey(c, capgkeyString, rights, false)
  if (!apikey) {
    cloudlog({ requestId: c.get('requestId'), message: 'Invalid apikey', capgkeyPrefix: maskSecret(capgkeyString), rights })
    // Record failed auth attempt - await to ensure accurate counting
    await recordFailedAuth(c)
    return quickError(401, 'invalid_apikey', 'Invalid apikey')
  }

  // Record API usage first, then check if rate limited
  await recordAPIKeyUsage(c, apikey.id)

  // Check if API key is rate limited after recording usage
  const apiKeyRateLimited = await isAPIKeyRateLimited(c, apikey.id)
  if (apiKeyRateLimited.limited) {
    return simpleRateLimit({ reason: 'api_key_rate_limit_exceeded', apikey_id: apikey.id, ...buildRateLimitInfo(apiKeyRateLimited.resetAt) })
  }

  // Store the original key string for hashed key authentication
  // This is needed because hashed keys have key=null in the database
  setApiKeyAuthContext(c, apikey, capgkeyString)

  // Phase 2: lazily provision service principal and set JWT in context.
  // Non-fatal — any failure is logged and the request continues with the
  // existing capgkey-based auth path.
  await applyServicePrincipal(c, capgkeyString)

  if (subkey_id) {
    cloudlog({ requestId: c.get('requestId'), message: 'Subkey id provided', subkey_id })
    const subkey = await resolveSubkey(c, subkey_id, rights, false, apikey.user_id)
    if (!subkey) {
      cloudlog({ requestId: c.get('requestId'), message: 'Invalid subkey', subkey_id })
      return quickError(401, 'invalid_subkey', 'Invalid subkey')
    }
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Subkey resolved',
      subkeyId: subkey.id,
      subkeyUserId: subkey.user_id,
    })
    const userError = validateSubkeyUser(c, subkey, apikey)
    if (userError) {
      return userError
    }
    const limitError = validateSubkeyLimits(c, subkey)
    if (limitError) {
      return limitError
    }
    setSubkeyAuthContext(c, apikey.user_id, subkey)
  }
}

async function foundJWT(c: Context, jwt: string) {
  cloudlog({ requestId: c.get('requestId'), message: 'JWT provided', jwtPrefix: maskSecret(jwt) })

  // Decode JWT claims via Supabase Auth `getClaims()`.
  const claims = await getClaimsFromJWT(c, jwt)
  if (!claims || !claims.sub) {
    cloudlog({ requestId: c.get('requestId'), message: 'Invalid JWT claims' })
    // Record failed auth attempt - await to ensure accurate counting
    await recordFailedAuth(c)
    return quickError(401, 'invalid_jwt', 'Invalid JWT')
  }

  c.set('auth', {
    userId: claims.sub,
    authType: 'jwt',
    jwt,
    apikey: null,
  })
}

export function middlewareV2(rights: Database['public']['Enums']['key_mode'][]) {
  return honoFactory.createMiddleware(async (c, next) => {
    // Check if IP is rate limited due to failed auth attempts
    const ipRateLimited = await isIPRateLimited(c)
    if (ipRateLimited.limited) {
      return simpleRateLimit({ reason: 'too_many_failed_auth_attempts', ...buildRateLimitInfo(ipRateLimited.resetAt) })
    }

    const { jwt, capgkey } = resolveAuthHeaders(c)
    if (jwt) {
      const res = await foundJWT(c, jwt)
      if (res) {
        return res
      }
    }
    else if (capgkey) {
      const res = await foundAPIKey(c, capgkey, rights)
      if (res) {
        return res
      }
    }
    else {
      cloudlog({ requestId: c.get('requestId'), message: 'No apikey or subkey provided' })
      // Record failed auth attempt - await to ensure accurate counting
      await recordFailedAuth(c)
      return quickError(401, 'no_jwt_apikey_or_subkey', 'No JWT, apikey or subkey provided')
    }
    await next()
  })
}

export function middlewareKey(rights: Database['public']['Enums']['key_mode'][], usePostgres = false) {
  const subMiddlewareKey = honoFactory.createMiddleware(async (c, next) => {
    // Check if IP is rate limited due to failed auth attempts
    const ipRateLimited = await isIPRateLimited(c)
    if (ipRateLimited.limited) {
      return simpleRateLimit({ reason: 'too_many_failed_auth_attempts', ...buildRateLimitInfo(ipRateLimited.resetAt) })
    }

    const { capgkeyString, apikeyString, key } = resolveKeyHeaders(c)
    const subkey_id = getSubkeyId(c)

    cloudlog({
      requestId: c.get('requestId'),
      message: 'middlewareKey - checking authorization',
      method: c.req.method,
      url: c.req.url,
      hasCapgkey: !!capgkeyString,
      hasAuthorization: !!apikeyString,
      hasKey: !!key,
      usePostgres,
    })
    if (!key) {
      cloudlog({ requestId: c.get('requestId'), message: 'No key provided', method: c.req.method, url: c.req.url })
      // Record failed auth attempt - await to ensure accurate counting
      await recordFailedAuth(c)
      return quickError(401, 'no_key_provided', 'No key provided')
    }

    const apikey = await resolveApiKey(c, key, rights, usePostgres)

    if (!apikey) {
      cloudlog({ requestId: c.get('requestId'), message: 'Invalid apikey', keyPrefix: maskSecret(key), method: c.req.method, url: c.req.url })
      // Record failed auth attempt - await to ensure accurate counting
      await recordFailedAuth(c)
      return quickError(401, 'invalid_apikey', 'Invalid apikey')
    }

    // Record API usage first, then check if rate limited
    await recordAPIKeyUsage(c, apikey.id)

    // Check if API key is rate limited after recording usage
    const apiKeyRateLimited = await isAPIKeyRateLimited(c, apikey.id)
    if (apiKeyRateLimited.limited) {
      return simpleRateLimit({ reason: 'api_key_rate_limit_exceeded', apikey_id: apikey.id, ...buildRateLimitInfo(apiKeyRateLimited.resetAt) })
    }

    // Set auth context for RBAC (can be overridden by subkey below)
    setApiKeyAuthContext(c, apikey, key)

    if (subkey_id) {
      const subkey = await resolveSubkey(c, subkey_id, rights, usePostgres, apikey.user_id)

      if (!subkey) {
        cloudlog({ requestId: c.get('requestId'), message: 'Invalid subkey', subkey_id })
        return quickError(401, 'invalid_subkey', 'Invalid subkey')
      }
      const userError = validateSubkeyUser(c, subkey, apikey)
      if (userError) {
        return userError
      }
      const limitError = validateSubkeyLimits(c, subkey)
      if (limitError) {
        return limitError
      }
      // Override auth context with subkey for RBAC
      setSubkeyAuthContext(c, apikey.user_id, subkey)
    }
    await next()
  })
  return subMiddlewareKey
}
