import type { Database } from '../../utils/supabase.types.ts'
import { honoFactory, middlewareKey, quickError, simpleError } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
import { Constants } from '../../utils/supabase.types.ts'

const app = honoFactory.createApp()

app.put('/:id', middlewareKey(['all']), async (c) => {
  const key = c.get('apikey')!

  if (key.limited_to_orgs?.length) {
    throw quickError(401, 'cannot_update_apikey', 'You cannot do that as a limited API key', { key })
  }

  const id = c.req.param('id')
  if (!id) {
    throw simpleError('api_key_id_required', 'API key ID is required', { id })
  }

  const body = await c.req.json()
    .catch((e) => {
      throw simpleError('invalid_json_parse_body', 'Invalid JSON body', { e })
    })
  const { name, mode, limited_to_apps, limited_to_orgs } = body
  const updateData: Partial<Database['public']['Tables']['apikeys']['Update']> = {
    name,
    mode,
    limited_to_apps,
    limited_to_orgs,
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

  if (Object.keys(updateData).length === 0) {
    throw simpleError('no_valid_fields_provided_for_update', 'No valid fields provided for update. Provide name, mode, limited_to_apps, or limited_to_orgs.')
  }

  const supabase = supabaseAdmin(c)

  // Check if the apikey to update exists (RLS handles ownership)
  const { data: existingApikey, error: fetchError } = await supabase
    .from('apikeys')
    .select('id') // Select only id, RLS implicitly filters by user_id
    .or(`key.eq.${id},id.eq.${id}`)
    .eq('user_id', key.user_id)
    .single()

  if (fetchError) {
    // RLS might return an error or just no data if not found/accessible
    throw quickError(fetchError.code === 'PGRST116' ? 404 : 500, 'api_key_not_found_or_access_denied', 'API key not found or access denied', { supabaseError: fetchError })
  }
  if (!existingApikey) {
    throw quickError(404, 'api_key_not_found_or_access_denied', 'API key not found or access denied')
  }

  const { data: updatedApikey, error: updateError } = await supabase
    .from('apikeys')
    .update(updateData)
    .eq('id', existingApikey.id) // Use the fetched ID to ensure we update the correct record
    .eq('user_id', key.user_id)
    .select()
    .single()

  if (updateError) {
    throw quickError(500, 'failed_to_update_apikey', 'Failed to update API key', { supabaseError: updateError })
  }

  return c.json(updatedApikey)
})

export default app
