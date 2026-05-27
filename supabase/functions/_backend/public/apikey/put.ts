import type { Context } from 'hono'
import type { AuthInfo, MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { honoFactory, parseBody, quickError, simpleError } from '../../utils/hono.ts'
import { middlewareV2 } from '../../utils/hono_middleware.ts'
import { supabaseAdmin, supabaseWithAuth, validateExpirationAgainstOrgPolicies, validateExpirationDate } from '../../utils/supabase.ts'
import { apiKeyHasLimitedScope } from './scope.ts'

const app = honoFactory.createApp()

// Validate id format to prevent PostgREST filter injection
// ID must be a valid UUID or numeric string
function isValidIdFormat(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const numericRegex = /^\d+$/
  return uuidRegex.test(id) || numericRegex.test(id)
}

interface ApiKeyPut {
  id?: string | number
  name?: string
  expires_at?: string | null
  regenerate?: boolean
}

async function handlePut(c: Context<MiddlewareKeyVariables>, idParam?: string) {
  const requestId = c.get('requestId')
  const auth = c.get('auth') as AuthInfo
  const authApikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row'] | undefined

  // Block any constrained API key from mutating other keys owned by the same user.
  if (auth.authType === 'apikey' && await apiKeyHasLimitedScope(c, authApikey)) {
    throw quickError(401, 'cannot_update_apikey', 'You cannot do that as a limited API key', { requestId, apikeyId: authApikey?.id })
  }

  const body = await parseBody<ApiKeyPut>(c)
  const { id, name, expires_at, regenerate } = body

  const resolvedId = typeof idParam === 'string' && idParam.length > 0 ? idParam : (id !== undefined ? String(id) : '')
  if (!resolvedId) {
    throw simpleError('api_key_id_required', 'API key ID is required', { requestId })
  }

  // Validate id format to prevent PostgREST filter injection
  if (!isValidIdFormat(resolvedId)) {
    throw simpleError('invalid_id_format', 'API key ID must be a valid UUID or number', { requestId })
  }

  // Validate expiration date format (throws if invalid)
  validateExpirationDate(expires_at)

  // Build update data from only explicitly-provided fields.
  // Note: empty arrays are meaningful and should clear the list.
  const updateData: Partial<Database['public']['Tables']['apikeys']['Update']> = {}
  if (name !== undefined) {
    updateData.name = name
  }
  // Handle expires_at: null means remove expiration, undefined means don't update.
  if (expires_at !== undefined) {
    updateData.expires_at = expires_at
  }

  const hasUpdates = Object.keys(updateData).length > 0

  if (name !== undefined && typeof name !== 'string') {
    throw simpleError('name_must_be_a_string', 'Name must be a string', { requestId })
  }

  if (regenerate !== undefined && typeof regenerate !== 'boolean') {
    throw simpleError('regenerate_must_be_boolean', 'regenerate must be a boolean', { requestId })
  }

  if (!hasUpdates && !regenerate) {
    throw simpleError('no_valid_fields_provided_for_update', 'No valid fields provided for update. Provide name, expires_at, or regenerate.', { requestId })
  }

  // Use supabaseWithAuth which handles both JWT and API key authentication
  const supabase = supabaseWithAuth(c, auth)
  const policyLookupSupabase = supabaseAdmin(c)

  // Check if the apikey to update exists (RLS handles ownership)
  const baseQuery = supabase
    .from('apikeys')
    .select('id, rbac_id, expires_at, key, key_hash')
    .eq('user_id', auth.userId)

  // Avoid PostgREST cast errors by querying only the relevant column:
  // - apikeys.id is bigint (numeric)
  // - apikeys.key is varchar (UUID string)
  const apikeyQuery = /^\d+$/.test(resolvedId)
    ? baseQuery.eq('id', Number(resolvedId))
    : baseQuery.eq('key', resolvedId)

  const { data: existingApikey, error: fetchError } = await apikeyQuery.single()

  if (fetchError) {
    // RLS might return an error or just no data if not found/accessible
    throw quickError(fetchError.code === 'PGRST116' ? 404 : 500, 'api_key_not_found_or_access_denied', 'API key not found or access denied', { requestId, supabaseError: fetchError })
  }
  if (!existingApikey) {
    throw quickError(404, 'api_key_not_found_or_access_denied', 'API key not found or access denied', { requestId })
  }
  if (!existingApikey.rbac_id) {
    throw quickError(409, 'apikey_missing_rbac_bindings', 'API key is missing RBAC bindings and cannot be updated', { requestId, apikeyId: existingApikey.id })
  }

  // Validate expiration against org policies (only if expiration or scopes are changing)
  if (expires_at !== undefined) {
    const { data: bindings, error: bindingError } = await policyLookupSupabase
      .from('role_bindings')
      .select('org_id')
      .eq('principal_type', 'apikey')
      .eq('principal_id', existingApikey.rbac_id)

    if (bindingError) {
      throw quickError(500, 'failed_to_load_apikey_bindings', 'Failed to load API key bindings', { requestId, supabaseError: bindingError })
    }

    const orgsToValidate = [...new Set((bindings || []).map(binding => binding.org_id).filter((orgId): orgId is string => !!orgId))]
    await validateExpirationAgainstOrgPolicies(orgsToValidate, expires_at, supabase)
  }

  const isHashedKey = existingApikey.key_hash !== null

  let updatedApikey = existingApikey
  if (hasUpdates) {
    const { data: updatedData, error: updateError } = await supabase
      .from('apikeys')
      .update(updateData)
      .eq('id', existingApikey.id) // Use the fetched ID to ensure we update the correct record
      .eq('user_id', auth.userId)
      .select()
      .single()

    if (updateError || !updatedData) {
      throw quickError(500, 'failed_to_update_apikey', 'Failed to update API key', { requestId, supabaseError: updateError })
    }
    updatedApikey = updatedData
  }

  if (regenerate) {
    if (isHashedKey) {
      const { data: regeneratedApikey, error: regenerateError } = await supabase.rpc('regenerate_hashed_apikey', {
        p_apikey_id: existingApikey.id,
      })
      if (regenerateError || !regeneratedApikey) {
        throw quickError(500, 'failed_to_update_apikey', 'Failed to regenerate API key', { requestId, supabaseError: regenerateError })
      }
      return c.json(regeneratedApikey)
    }

    const { data: updatedData, error: updateError } = await supabase
      .from('apikeys')
      // Any non-null value different from the current key will trigger the
      // `apikeys_force_server_key()` database trigger to regenerate the key.
      // We use the literal string 'regenerate' here purely as a placeholder;
      // the final key returned below is the value generated by the trigger.
      .update({ key: 'regenerate' })
      .eq('id', existingApikey.id)
      .eq('user_id', auth.userId)
      .select()
      .single()

    if (updateError || !updatedData) {
      throw quickError(500, 'failed_to_update_apikey', 'Failed to regenerate API key', { requestId, supabaseError: updateError })
    }
    return c.json(updatedData)
  }

  return c.json(updatedApikey)
}

app.put('/', middlewareV2(['all']), async c => handlePut(c))
app.put('/:id', middlewareV2(['all']), async c => handlePut(c, c.req.param('id')))

export default app
