import type { CreateBindingParams } from '../../private/role_bindings.ts'
import type { AuthInfo } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { sql } from 'drizzle-orm'
import { createRoleBindingForPrincipal } from '../../private/role_bindings.ts'
import { honoFactory, parseBody, quickError, simpleError } from '../../utils/hono.ts'
import { middlewareV2 } from '../../utils/hono_middleware.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../../utils/pg.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { resolveApikeyPolicyOrgIds, supabaseAdmin, supabaseWithAuth, validateExpirationAgainstOrgPolicies, validateExpirationDate } from '../../utils/supabase.ts'
import { Constants } from '../../utils/supabase.types.ts'

interface BindingInput {
  role_name: string
  scope_type: 'org' | 'app' | 'channel'
  org_id: string
  app_id?: string | null
  channel_id?: string | number | null
  reason?: string
}

type ApiKeyRow = Database['public']['Tables']['apikeys']['Row']

type DrizzleExecutor = Pick<ReturnType<typeof getDrizzleClient>, 'execute'>

interface CreateApiKeyRecordParams {
  userId: string
  mode: Database['public']['Enums']['key_mode'] | null
  name: string
  limitedToOrgs: string[]
  limitedToApps: string[]
  expiresAt: string | null
  isHashed: boolean
}

const app = honoFactory.createApp()

function apiKeyHasLimitedScope(apikey: ApiKeyRow | undefined) {
  return (apikey?.limited_to_orgs?.length ?? 0) > 0 || (apikey?.limited_to_apps?.length ?? 0) > 0
}

function uuidSqlArray(values: string[]) {
  if (!values.length)
    return sql`ARRAY[]::uuid[]`

  return sql`ARRAY[${sql.join(values.map(value => sql`${value}::uuid`), sql`, `)}]::uuid[]`
}

function textSqlArray(values: string[]) {
  if (!values.length)
    return sql`ARRAY[]::text[]`

  return sql`ARRAY[${sql.join(values.map(value => sql`${value}::text`), sql`, `)}]::text[]`
}

async function createApiKeyRecord(
  db: DrizzleExecutor,
  params: CreateApiKeyRecordParams,
): Promise<ApiKeyRow> {
  const plainKey = crypto.randomUUID()
  const result = await db.execute<ApiKeyRow>(sql`INSERT INTO public.apikeys (
      user_id,
      key,
      key_hash,
      mode,
      name,
      limited_to_orgs,
      limited_to_apps,
      expires_at
    )
    VALUES (
      ${params.userId}::uuid,
      CASE WHEN ${params.isHashed}::boolean THEN NULL ELSE ${plainKey}::text END,
      CASE WHEN ${params.isHashed}::boolean THEN encode(extensions.digest(${plainKey}::text, 'sha256'), 'hex') ELSE NULL END,
      ${params.mode}::public.key_mode,
      ${params.name}::text,
      ${uuidSqlArray(params.limitedToOrgs)},
      ${textSqlArray(params.limitedToApps)},
      ${params.expiresAt}::timestamptz
    )
    RETURNING *`)

  const apiKey = result.rows[0] as ApiKeyRow | undefined
  if (!apiKey) {
    throw new Error('API key insert returned no rows')
  }

  apiKey.key = plainKey
  return apiKey
}

app.post('/', middlewareV2(['all']), async (c) => {
  const auth = c.get('auth') as AuthInfo
  const apikey = c.get('apikey') as ApiKeyRow | undefined

  const body = await parseBody<any>(c)

  const orgId = body.org_id
  const appId = body.app_id
  const name = body.name ?? ''
  if (body.limited_to_apps !== undefined && !Array.isArray(body.limited_to_apps)) {
    throw simpleError('invalid_limited_to_apps', 'limited_to_apps must be an array of app ids')
  }
  if (body.limited_to_orgs !== undefined && !Array.isArray(body.limited_to_orgs)) {
    throw simpleError('invalid_limited_to_orgs', 'limited_to_orgs must be an array of org ids')
  }
  const limitedToApps: string[] = Array.isArray(body.limited_to_apps) ? [...body.limited_to_apps] : []
  const limitedToOrgs: string[] = Array.isArray(body.limited_to_orgs) ? [...body.limited_to_orgs] : []
  if (!limitedToApps.every(item => typeof item === 'string')) {
    throw simpleError('invalid_limited_to_apps', 'limited_to_apps must be an array of app ids')
  }
  if (!limitedToOrgs.every(item => typeof item === 'string')) {
    throw simpleError('invalid_limited_to_orgs', 'limited_to_orgs must be an array of org ids')
  }

  // API key callers must be full legacy keys. Limited keys, write keys, and
  // RBAC-managed keys must not be able to mint broader credentials.
  if (auth.authType === 'apikey' && (apikey?.mode !== 'all' || apiKeyHasLimitedScope(apikey))) {
    throw simpleError('cannot_create_apikey', 'You cannot create API keys with this API key', { keyId: apikey?.id })
  }
  const expiresAt = body.expires_at ?? null
  const isHashed = body.hashed === true

  // Validate and parse bindings array
  const bindings: BindingInput[] = Array.isArray(body.bindings) ? body.bindings : []
  if (body.bindings !== undefined && !Array.isArray(body.bindings)) {
    throw simpleError('invalid_bindings', 'bindings must be an array')
  }
  for (const binding of bindings) {
    if (!binding || typeof binding !== 'object') {
      throw simpleError('invalid_bindings', 'Each binding must be an object')
    }
    if (typeof binding.role_name !== 'string' || !binding.role_name) {
      throw simpleError('invalid_bindings', 'Each binding must have a role_name')
    }
    if (!['org', 'app', 'channel'].includes(binding.scope_type)) {
      throw simpleError('invalid_bindings', 'Each binding must have a valid scope_type (org, app, channel)')
    }
    if (typeof binding.org_id !== 'string' || !binding.org_id) {
      throw simpleError('invalid_bindings', 'Each binding must have an org_id')
    }
  }

  const hasBindings = bindings.length > 0

  // mode is required when no bindings are provided, optional (null) otherwise
  const mode = body.mode ?? null
  if (!name) {
    throw simpleError('name_is_required', 'Name is required')
  }
  if (!hasBindings && !mode) {
    throw simpleError('mode_is_required', 'Mode is required when no bindings are provided')
  }
  if (mode !== null) {
    const validModes = Constants.public.Enums.key_mode
    if (!validModes.includes(mode)) {
      throw simpleError('invalid_mode', 'Invalid mode')
    }
  }

  // Validate expiration date format (throws if invalid)
  validateExpirationDate(expiresAt)

  // Use supabaseWithAuth which handles both JWT and API key authentication
  const supabase = supabaseWithAuth(c, auth)
  const policyLookupSupabase = supabaseAdmin(c)

  if (orgId) {
    const { data: org, error } = await supabase.from('orgs').select('*').eq('id', orgId).single()
    if (!org || error) {
      throw quickError(404, 'org_not_found', 'Org not found', { supabaseError: error })
    }
    limitedToOrgs.splice(0, limitedToOrgs.length, org.id)
  }
  if (appId) {
    const { data: app, error } = await supabase.from('apps').select('*').eq('id', appId).single()
    if (!app || error) {
      throw quickError(404, 'app_not_found', 'App not found', { supabaseError: error })
    }
    limitedToApps.splice(0, limitedToApps.length, app.app_id)
  }

  // Validate expiration against org policies (throws if invalid)
  const allOrgIds = await resolveApikeyPolicyOrgIds(supabase, {
    limitedToApps,
    limitedToOrgs,
    policyLookupSupabase,
  })
  await validateExpirationAgainstOrgPolicies(allOrgIds, expiresAt, supabase)

  let apikeyData: ApiKeyRow | null = null

  if (hasBindings) {
    let pgClient: ReturnType<typeof getPgClient> | undefined
    try {
      // Check RBAC permission for each unique org in the bindings before creating anything.
      const bindingOrgIds = [...new Set(bindings.map(b => b.org_id))]
      for (const bindingOrgId of bindingOrgIds) {
        if (!(await checkPermission(c, 'org.update_user_roles', { orgId: bindingOrgId }))) {
          throw quickError(403, 'forbidden_binding', `Forbidden - Admin rights required for org ${bindingOrgId}`)
        }
      }

      pgClient = getPgClient(c)
      const drizzle = getDrizzleClient(pgClient)
      const createdBindings: unknown[] = []
      const callerPrincipalId = auth.authType === 'apikey' ? auth.apikey!.rbac_id : auth.userId

      await drizzle.transaction(async (tx) => {
        apikeyData = await createApiKeyRecord(tx, {
          userId: auth.userId,
          mode,
          name,
          limitedToOrgs,
          limitedToApps,
          expiresAt,
          isHashed,
        })

        if (!apikeyData.rbac_id) {
          throw new Error('Created API key is missing rbac_id')
        }

        for (const binding of bindings) {
          const bindingParams: CreateBindingParams = {
            principal_type: 'apikey',
            principal_id: apikeyData.rbac_id,
            role_name: binding.role_name,
            scope_type: binding.scope_type,
            org_id: binding.org_id,
            app_id: binding.app_id,
            channel_id: binding.channel_id,
            reason: binding.reason,
          }

          const result = await createRoleBindingForPrincipal(
            tx as unknown as ReturnType<typeof getDrizzleClient>,
            bindingParams,
            auth.userId,
            auth.authType as 'jwt' | 'apikey',
            callerPrincipalId,
          )

          if (!result.ok) {
            cloudlogErr({
              requestId: c.get('requestId'),
              message: 'apikey_binding_failed',
              binding,
              error: result.error,
            })
            throw quickError(result.status as any, 'binding_failed', result.error)
          }

          createdBindings.push(result.data)
        }
      })

      cloudlog({
        requestId: c.get('requestId'),
        message: 'apikey_bindings_created',
        apikeyId: (apikeyData as ApiKeyRow | null)?.id,
        bindingsCount: createdBindings.length,
      })
    }
    catch (error: any) {
      if (error?.status) {
        throw error
      }
      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'apikey_bindings_unexpected_error',
        error,
      })
      throw simpleError('binding_creation_failed', 'Failed to create role bindings for the API key')
    }
    finally {
      if (pgClient) {
        await closeClient(c, pgClient)
      }
    }
  }
  else if (isHashed) {
    const { data, error } = await supabase.rpc('create_hashed_apikey', {
      p_mode: mode,
      p_name: name,
      p_limited_to_orgs: limitedToOrgs,
      p_limited_to_apps: limitedToApps,
      p_expires_at: expiresAt,
    })
    apikeyData = data
    if (error || !apikeyData) {
      throw simpleError('failed_to_create_apikey', 'Failed to create API key', { supabaseError: error })
    }
  }
  else {
    const { data, error } = await supabase
      .from('apikeys')
      .insert({
        user_id: auth.userId,
        key: null,
        key_hash: null,
        mode,
        name,
        limited_to_apps: limitedToApps,
        limited_to_orgs: limitedToOrgs,
        expires_at: expiresAt,
      })
      .select()
      .single()
    apikeyData = data
    if (error || !apikeyData) {
      throw simpleError('failed_to_create_apikey', 'Failed to create API key', { supabaseError: error })
    }
  }

  return c.json(apikeyData)
})

export default app
