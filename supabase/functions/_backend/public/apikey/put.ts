import type { Database } from '../../utils/supabase.types.ts'
import { honoFactory, middlewareKey } from '../../utils/hono.ts'
import { cloudlogErr } from '../../utils/loggin.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
import { Constants } from '../../utils/supabase.types.ts'

const app = honoFactory.createApp()

app.put('/:id', middlewareKey(['all']), async (c) => {
  const key = c.get('apikey')!

  if (key.limited_to_orgs?.length) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot update apikey You cannot do that as a limited API key' })
    return c.json({ error: 'You cannot do that as a limited API key' }, 401)
  }

  const id = c.req.param('id')
  if (!id) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot update apikey API key ID is required' })
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
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot update apikey Name must be a string' })
    return c.json({ error: 'Name must be a string' }, 400)
  }

  const validModes = Constants.public.Enums.key_mode
  if (mode !== undefined && (typeof mode !== 'string' || !validModes.includes(mode as any))) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot update apikey Invalid mode' })
    return c.json({ error: `Invalid mode. Must be one of: ${validModes.join(', ')}` }, 400)
  }

  if (limited_to_apps !== undefined && (!Array.isArray(limited_to_apps) || !limited_to_apps.every(item => typeof item === 'string'))) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot update apikey limited_to_apps must be an array of strings' })
    return c.json({ error: 'limited_to_apps must be an array of strings' }, 400)
  }

  if (limited_to_orgs !== undefined && (!Array.isArray(limited_to_orgs) || !limited_to_orgs.every(item => typeof item === 'string'))) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot update apikey limited_to_orgs must be an array of strings' })
    return c.json({ error: 'limited_to_orgs must be an array of strings' }, 400)
  }

  if (Object.keys(updateData).length === 0) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot update apikey No valid fields provided for update' })
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
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot update apikey API key not found or access denied', error: fetchError })
    return c.json({ error: 'API key not found or access denied', supabaseError: fetchError }, fetchError.code === 'PGRST116' ? 404 : 500)
  }
  if (!existingApikey) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot update apikey API key not found or access denied (no data returned)' })
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
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot update apikey Failed to update API key', error: updateError })
    return c.json({ error: 'Failed to update API key', supabaseError: updateError }, 500)
  }

  return c.json(updatedApikey)
})

export default app
