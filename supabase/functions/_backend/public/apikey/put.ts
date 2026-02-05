import type { Context } from 'hono'
import type { AuthInfo } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { honoFactory, parseBody, quickError, simpleError } from '../../utils/hono.ts'
import { middlewareV2 } from '../../utils/hono_middleware.ts'
import { supabaseWithAuth, validateExpirationAgainstOrgPolicies, validateExpirationDate } from '../../utils/supabase.ts'
import { Constants } from '../../utils/supabase.types.ts'

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
  mode?: 'read' | 'write' | 'all' | 'upload'
  limited_to_apps?: string[]
  limited_to_orgs?: string[]
  expires_at?: string | null
  regenerate?: boolean
}

async function handlePut(c: Context, idParam?: string) {
  const auth = c.get('auth') as AuthInfo
  const authApikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row'] | undefined

  // Only check limited_to_orgs constraint for API key auth (not JWT)
  if (auth.authType === 'apikey' && authApikey?.limited_to_orgs?.length) {
    throw quickError(401, 'cannot_update_apikey', 'You cannot do that as a limited API key', { apikeyId: authApikey.id })
  }

  const body = await parseBody<ApiKeyPut>(c)
  const { id, name, mode, limited_to_apps, limited_to_orgs, expires_at, regenerate } = body

  const resolvedId = typeof idParam === 'string' && idParam.length > 0 ? idParam : (id !== undefined ? String(id) : '')
  if (!resolvedId) {
    throw simpleError('api_key_id_required', 'API key ID is required')
  }

  // Validate id format to prevent PostgREST filter injection
  if (!isValidIdFormat(resolvedId)) {
    throw simpleError('invalid_id_format', 'API key ID must be a valid UUID or number')
  }

  // Validate expiration date format (throws if invalid)
  validateExpirationDate(expires_at)

  const limitedToApps = Array.isArray(limited_to_apps) ? limited_to_apps : undefined
  const limitedToOrgs = Array.isArray(limited_to_orgs) ? limited_to_orgs : undefined

  const updateData: Partial<Database['public']['Tables']['apikeys']['Update']> = {
    name,
    mode,
    // we use undefined to remove the field from the update
    limited_to_apps: limitedToApps && limitedToApps.length > 0 ? limitedToApps : undefined,
    limited_to_orgs: limitedToOrgs && limitedToOrgs.length > 0 ? limitedToOrgs : undefined,
  }
  const hasUpdates = name !== undefined
    || mode !== undefined
    || limitedToApps !== undefined
    || limitedToOrgs !== undefined
    || expires_at !== undefined

  // Handle expires_at: null means remove expiration, undefined means don't update
  if (expires_at !== undefined) {
    updateData.expires_at = expires_at
  }

  if (name !== undefined && typeof name !== 'string') {
    throw simpleError('name_must_be_a_string', 'Name must be a string')
  }

  const validModes = Constants.public.Enums.key_mode
  if (mode !== undefined && (typeof mode !== 'string' || !validModes.includes(mode as any))) {
    throw simpleError('invalid_mode', `Invalid mode. Must be one of: ${validModes.join(', ')}`)
  }

  if (limited_to_apps !== undefined && (!Array.isArray(limited_to_apps) || !limited_to_apps.every(item => typeof item === 'string'))) {
    throw simpleError('limited_to_apps_must_be_an_array_of_strings', 'limited_to_apps must be an array of strings')
  }

  if (limited_to_orgs !== undefined && (!Array.isArray(limited_to_orgs) || !limited_to_orgs.every(item => typeof item === 'string'))) {
    throw simpleError('limited_to_orgs_must_be_an_array_of_strings', 'limited_to_orgs must be an array of strings')
  }

  if (regenerate !== undefined && typeof regenerate !== 'boolean') {
    throw simpleError('regenerate_must_be_boolean', 'regenerate must be a boolean')
  }

  if (!hasUpdates && !regenerate) {
    throw simpleError('no_valid_fields_provided_for_update', 'No valid fields provided for update. Provide name, mode, limited_to_apps, limited_to_orgs, or expires_at.')
  }

  // Use supabaseWithAuth which handles both JWT and API key authentication
  const supabase = supabaseWithAuth(c, auth)

  // Check if the apikey to update exists (RLS handles ownership)
  const { data: existingApikey, error: fetchError } = await supabase
    .from('apikeys')
    .select('id, limited_to_orgs, expires_at, key, key_hash') // Also fetch expires_at for policy validation
    .or(`key.eq.${resolvedId},id.eq.${resolvedId}`)
    .eq('user_id', auth.userId)
    .single()

  if (fetchError) {
    // RLS might return an error or just no data if not found/accessible
    throw quickError(fetchError.code === 'PGRST116' ? 404 : 500, 'api_key_not_found_or_access_denied', 'API key not found or access denied', { supabaseError: fetchError })
  }
  if (!existingApikey) {
    throw quickError(404, 'api_key_not_found_or_access_denied', 'API key not found or access denied')
  }

  // Determine the org IDs to validate against (use new ones if provided, otherwise existing)
  const orgsToValidate = limited_to_orgs?.length ? limited_to_orgs : (existingApikey.limited_to_orgs || [])

  // Validate expiration against org policies (only if expires_at is being set or orgs are being changed)
  if (expires_at !== undefined || limited_to_orgs?.length) {
    // Use new expires_at if provided, otherwise fall back to existing
    const expirationToValidate = expires_at !== undefined ? expires_at : (existingApikey.expires_at ?? null)
    await validateExpirationAgainstOrgPolicies(orgsToValidate, expirationToValidate, supabase)
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
      throw quickError(500, 'failed_to_update_apikey', 'Failed to update API key', { supabaseError: updateError })
    }
    updatedApikey = updatedData
  }

  if (regenerate) {
    if (isHashedKey) {
      const { data: regeneratedApikey, error: regenerateError } = await supabase.rpc('regenerate_hashed_apikey', {
        p_apikey_id: existingApikey.id,
        p_user_id: auth.userId,
      })
      if (regenerateError || !regeneratedApikey) {
        throw quickError(500, 'failed_to_update_apikey', 'Failed to regenerate API key', { supabaseError: regenerateError })
      }
      return c.json(regeneratedApikey)
    }

    const { data: updatedData, error: updateError } = await supabase
      .from('apikeys')
      .update({ key: 'regenerate' })
      .eq('id', existingApikey.id)
      .eq('user_id', auth.userId)
      .select()
      .single()

    if (updateError || !updatedData) {
      throw quickError(500, 'failed_to_update_apikey', 'Failed to regenerate API key', { supabaseError: updateError })
    }
    return c.json(updatedData)
  }

  return c.json(updatedApikey)
}

app.put('/', middlewareV2(['all']), async c => handlePut(c))
app.put('/:id', middlewareV2(['all']), async c => handlePut(c, c.req.param('id')))

export default app
