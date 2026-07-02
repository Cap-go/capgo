import type { Context } from 'hono'
import type { AuthInfo, MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { honoFactory, quickError, simpleError } from '../../utils/hono.ts'
import { middlewareV2 } from '../../utils/hono_middleware.ts'
import { closeClient, getPgClient } from '../../utils/pg.ts'
import { supabaseWithAuth } from '../../utils/supabase.ts'
import { attachApiKeyGlobalPermissions } from './global_permissions.ts'
import { apiKeyHasLimitedScope } from './scope.ts'

const app = honoFactory.createApp()

// Validate id format to prevent PostgREST filter injection
// ID must be a valid UUID or numeric string
function isValidIdFormat(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const numericRegex = /^\d+$/
  return uuidRegex.test(id) || numericRegex.test(id)
}

async function withGlobalPermissions<T extends Database['public']['Tables']['apikeys']['Row']>(
  c: Context<MiddlewareKeyVariables>,
  apikeys: T[],
) {
  const rbacIds = apikeys.map(key => key.rbac_id).filter((rbacId): rbacId is string => !!rbacId)
  if (rbacIds.length === 0) {
    return attachApiKeyGlobalPermissions(apikeys, [])
  }

  let pgClient
  try {
    pgClient = getPgClient(c)
    const { rows } = await pgClient.query<{ apikey_rbac_id: string, permission_key: string }>(
      `SELECT apikey_rbac_id::text, permission_key
       FROM public.apikey_global_permissions
       WHERE apikey_rbac_id = ANY($1::uuid[])`,
      [rbacIds],
    )
    return attachApiKeyGlobalPermissions(apikeys, rows)
  }
  finally {
    if (pgClient) {
      await closeClient(c, pgClient)
    }
  }
}

app.get('/', middlewareV2(['all']), async (c) => {
  const auth = c.get('auth') as AuthInfo
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row'] | undefined

  if (auth.authType === 'apikey' && await apiKeyHasLimitedScope(c, apikey)) {
    throw quickError(401, 'cannot_list_apikeys', 'You cannot do that as a limited API key', { apikeyId: apikey?.id })
  }

  // Use supabaseWithAuth which handles both JWT and API key authentication
  const supabase = supabaseWithAuth(c, auth)

  const { data: apikeys, error } = await supabase
    .from('apikeys')
    .select('*')
    .eq('user_id', auth.userId)

  if (error) {
    throw quickError(500, 'failed_to_list_apikeys', 'Failed to list API keys', { supabaseError: error })
  }

  return c.json(await withGlobalPermissions(c, apikeys ?? []))
})

app.get('/:id', middlewareV2(['all']), async (c) => {
  const auth = c.get('auth') as AuthInfo
  const authApikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row'] | undefined

  if (auth.authType === 'apikey' && await apiKeyHasLimitedScope(c, authApikey)) {
    throw quickError(401, 'cannot_get_apikey', 'You cannot do that as a limited API key', { apikeyId: authApikey?.id })
  }

  const id = c.req.param('id')
  if (!id) {
    throw simpleError('api_key_id_required', 'API key ID is required')
  }

  // Validate id format to prevent PostgREST filter injection
  if (!isValidIdFormat(id)) {
    throw simpleError('invalid_id_format', 'API key ID must be a valid UUID or number')
  }

  // Use supabaseWithAuth which handles both JWT and API key authentication
  const supabase = supabaseWithAuth(c, auth)
  const baseQuery = supabase
    .from('apikeys')
    .select('*')
    .eq('user_id', auth.userId)

  const apikeyQuery = /^\d+$/.test(id)
    ? baseQuery.eq('id', Number(id))
    : baseQuery.eq('key', id)

  const { data: fetchedApikey, error } = await apikeyQuery
    .single()
  if (error) {
    throw quickError(404, 'failed_to_get_apikey', 'Failed to get API key', { supabaseError: error })
  }
  const [apikeyWithPermissions] = await withGlobalPermissions(c, fetchedApikey ? [fetchedApikey] : [])
  return c.json(apikeyWithPermissions)
})

export default app
