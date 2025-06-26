import type { Database } from '../../utils/supabase.types.ts'
import { honoFactory, middlewareKey } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
import { Constants } from '../../utils/supabase.types.ts'

const app = honoFactory.createApp()

app.put('/:id', middlewareKey(['all']), async (c) => {
  const key = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  if (!key) {
    console.error('Cannot update apikey', 'Unauthorized')
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (key.limited_to_orgs && key.limited_to_orgs.length > 0) {
    console.error('Cannot update apikey', 'You cannot do that as a limited API key')
    return c.json({ error: 'You cannot do that as a limited API key' }, 401)
  }

  const id = c.req.param('id')
  if (!id) {
    console.error('Cannot update apikey', 'API key ID is required')
    return c.json({ error: 'API key ID is required' }, 400)
  }

  const body = await c.req.json()
  const { name, mode, limited_to_apps, limited_to_orgs } = body
  const updateData: Partial<Database['public']['Tables']['apikeys']['Update']> = {
    name,
    mode,
    limited_to_apps,
    limited_to_orgs,
  }

  if (name !== undefined && typeof name !== 'string') {
    console.error('Cannot update apikey', 'Name must be a string')
    return c.json({ error: 'Name must be a string' }, 400)
  }

  const validModes = Constants.public.Enums.key_mode
  if (mode !== undefined && (typeof mode !== 'string' || !validModes.includes(mode as any))) {
    console.error('Cannot update apikey', 'Invalid mode')
    return c.json({ error: `Invalid mode. Must be one of: ${validModes.join(', ')}` }, 400)
  }

  if (limited_to_apps !== undefined && (!Array.isArray(limited_to_apps) || !limited_to_apps.every(item => typeof item === 'string'))) {
    console.error('Cannot update apikey', 'limited_to_apps must be an array of strings')
    return c.json({ error: 'limited_to_apps must be an array of strings' }, 400)
  }

  if (limited_to_orgs !== undefined && (!Array.isArray(limited_to_orgs) || !limited_to_orgs.every(item => typeof item === 'string'))) {
    console.error('Cannot update apikey', 'limited_to_orgs must be an array of strings')
    return c.json({ error: 'limited_to_orgs must be an array of strings' }, 400)
  }

  if (Object.keys(updateData).length === 0) {
    console.error('Cannot update apikey', 'No valid fields provided for update')
    return c.json({ error: 'No valid fields provided for update. Provide name, mode, limited_to_apps, or limited_to_orgs.' }, 400)
  }

  const supabase = supabaseAdmin(c as any)

  // Check if the apikey to update exists (RLS handles ownership)
  const { data: existingApikey, error: fetchError } = await supabase
    .from('apikeys')
    .select('id') // Select only id, RLS implicitly filters by user_id
    .or(`key.eq.${id},id.eq.${id}`)
    .eq('user_id', key.user_id)
    .single()

  if (fetchError) {
    // RLS might return an error or just no data if not found/accessible
    console.error('Cannot update apikey', 'API key not found or access denied', fetchError)
    return c.json({ error: 'API key not found or access denied', supabaseError: fetchError }, fetchError.code === 'PGRST116' ? 404 : 500)
  }
  if (!existingApikey) {
    console.error('Cannot update apikey', 'API key not found or access denied (no data returned)')
    return c.json({ error: 'API key not found or access denied' }, 404)
  }

  const { data: updatedApikey, error: updateError } = await supabase
    .from('apikeys')
    .update(updateData)
    .eq('id', existingApikey.id) // Use the fetched ID to ensure we update the correct record
    .eq('user_id', key.user_id)
    .select()
    .single()

  if (updateError) {
    console.error('Cannot update apikey', 'Failed to update API key', updateError)
    return c.json({ error: 'Failed to update API key', supabaseError: updateError }, 500)
  }

  return c.json(updatedApikey)
})

export default app
