import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { honoFactory, quickError, simpleError } from '../../utils/hono.ts'
import { middlewareAuth } from '../../utils/hono_middleware.ts'
import { closeClient, getPgClient } from '../../utils/pg.ts'
import { supabaseWithAuth } from '../../utils/supabase.ts'
import { attachApiKeyGlobalPermissions } from './global_permissions.ts'
import { ensureApiKeyManagementAllowed, isValidApiKeyIdFormat, requireApiKeyManagementAuth, selectOwnedApiKeyByIdentifier } from './scope.ts'

const app = honoFactory.createApp()

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

app.get('/', middlewareAuth(), async (c) => {
  const auth = requireApiKeyManagementAuth(c, 'not_authorized', 'API key management requires authentication')
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row'] | undefined

  await ensureApiKeyManagementAllowed(c, auth, apikey, 'cannot_list_apikeys')

  const { data: apikeys, error } = await supabaseWithAuth(c, auth)
    .from('apikeys')
    .select('*')
    .eq('user_id', auth.userId)

  if (error) {
    throw quickError(500, 'failed_to_list_apikeys', 'Failed to list API keys', { supabaseError: error })
  }

  return c.json(await withGlobalPermissions(c, apikeys ?? []))
})

app.get('/:id', middlewareAuth(), async (c) => {
  const auth = requireApiKeyManagementAuth(c, 'not_authorized', 'API key management requires authentication')
  const authApikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row'] | undefined

  await ensureApiKeyManagementAllowed(c, auth, authApikey, 'cannot_get_apikey')

  const id = c.req.param('id')
  if (!id) {
    throw simpleError('api_key_id_required', 'API key ID is required')
  }

  // Validate id format to prevent PostgREST filter injection
  if (!isValidApiKeyIdFormat(id)) {
    throw simpleError('invalid_id_format', 'API key ID must be a valid UUID or number')
  }

  const { data: fetchedApikey, error } = await selectOwnedApiKeyByIdentifier(c, auth, id)
  if (error || !fetchedApikey) {
    throw quickError(404, 'failed_to_get_apikey', 'Failed to get API key', { supabaseError: error })
  }
  const [apikeyWithPermissions] = await withGlobalPermissions(c, fetchedApikey ? [fetchedApikey] : [])
  return c.json(apikeyWithPermissions)
})

export default app
