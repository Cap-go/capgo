import type { Database } from '../../utils/supabase.types.ts'
import { Constants } from '../../../../../src/types/supabase.types.ts'
import { honoFactory, middlewareKey } from '../../utils/hono.ts'
import { supabaseAdmin, supabaseApikey } from '../../utils/supabase.ts'

const app = honoFactory.createApp()

app.post('/', middlewareKey(['all']), async (c) => {
  const key = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  if (!key) {
    console.error('Cannot create apikey', 'Unauthorized')
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (key.limited_to_orgs && key.limited_to_orgs.length > 0) {
    console.error('Cannot create apikey', 'You cannot do that as a limited API key')
    return c.json({ error: 'You cannot do that as a limited API key' }, 401)
  }

  const orgId = c.req.query('org_id')
  const appId = c.req.query('app_id')

  if (!orgId && !appId) {
    console.error('Cannot create apikey', 'Org ID or App ID is required')
    return c.json({ error: 'Org ID or App ID is required' }, 400)
  }

  const mode = c.req.query('mode')
  if (!mode) {
    console.error('Cannot create apikey', 'Mode is required')
    return c.json({ error: 'Mode is required' }, 400)
  }

  if (mode !== 'all' && mode !== 'upload' && mode !== 'read' && mode !== 'write') {
    console.error('Cannot create apikey', 'Invalid mode')
    return c.json({ error: 'Invalid mode' }, 400)
  }

  const supabase = supabaseAdmin(c as any)
  if (orgId) {
    const { data: org, error } = await supabase.from('orgs').select('*').eq('id', orgId).single()
    if (!org || error) {
      console.error('Cannot create apikey', 'Org not found', error)
      return c.json({ error: 'Org not found', supabaseError: error }, 404)
    }

    const apikey = crypto.randomUUID()
    const { data: apikeyData, error: apikeyError } = await supabase.from('apikeys').insert({
      user_id: key.user_id,
      key: apikey,
      mode,
      name: '',
      limited_to_orgs: [org.id],
    }).select().single()

    if (apikeyError) {
      console.error('Cannot create apikey', 'Failed to create API key', apikeyError)
      return c.json({ error: 'Failed to create API key', supabaseError: apikeyError }, 500)
    }

    return c.json({ apikey: apikeyData })
  }
  else if (appId) {
    const { data: app, error } = await supabase.from('apps').select('*').eq('id', appId).single()
    if (!app || error) {
      console.error('Cannot create apikey', 'App not found', error)
      return c.json({ error: 'App not found', supabaseError: error }, 404)
    }

    const apikey = crypto.randomUUID()
    const { data: apikeyData, error: apikeyError } = await supabase.from('apikeys').insert({
      user_id: key.user_id,
      key: apikey,
      mode,
      name: '',
      limited_to_orgs: [app.owner_org],
      limited_to_apps: [app.app_id],
    }).select().single()

    if (apikeyError) {
      console.error('Cannot create apikey', 'Failed to create API key', apikeyError)
      return c.json({ error: 'Failed to create API key', supabaseError: apikeyError }, 500)
    }

    return c.json({ apikey: apikeyData })
  }
})

app.delete('/:id', middlewareKey(['all']), async (c) => {
  const key = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  if (!key) {
    console.error('Cannot delete apikey', 'Unauthorized')
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (key.limited_to_orgs && key.limited_to_orgs.length > 0) {
    console.error('Cannot delete apikey', 'You cannot do that as a limited API key')
    return c.json({ error: 'You cannot do that as a limited API key' }, 401)
  }

  const id = c.req.param('id')
  if (!id) {
    console.error('Cannot delete apikey', 'API key ID is required')
    return c.json({ error: 'API key ID is required' }, 400)
  }

  const supabase = supabaseAdmin(c as any)

  const { data: apikey, error: apikeyError } = await supabase.from('apikeys').select('*').or(`key.eq.${id},id.eq.${id}`).eq('user_id', key.user_id).single()
  if (!apikey || apikeyError) {
    console.error('Cannot delete apikey', 'API key not found', apikeyError)
    return c.json({ error: 'API key not found', supabaseError: apikeyError }, 404)
  }

  const { error } = await supabase
    .from('apikeys')
    .delete()
    .or(`key.eq.${id},id.eq.${id}`)
    .eq('user_id', key.user_id)

  if (error) {
    console.error('Cannot delete apikey', 'Failed to delete API key', error)
    return c.json({ error: 'Failed to delete API key', supabaseError: error }, 500)
  }

  return c.json({ success: true })
})

app.patch('/:id', middlewareKey(['all']), async (c) => {
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
  const updateData: Partial<Database['public']['Tables']['apikeys']['Update']> = {}

  if (name !== undefined) {
    if (typeof name !== 'string') {
      console.error('Cannot update apikey', 'Name must be a string')
      return c.json({ error: 'Name must be a string' }, 400)
    }
    updateData.name = name
  }

  if (mode !== undefined) {
    const validModes = Constants.public.Enums.key_mode
    if (typeof mode !== 'string' || !validModes.includes(mode as any)) {
      console.error('Cannot update apikey', 'Invalid mode')
      return c.json({ error: `Invalid mode. Must be one of: ${validModes.join(', ')}` }, 400)
    }
    updateData.mode = mode as Database['public']['Enums']['key_mode']
  }

  if (limited_to_apps !== undefined) {
    if (!Array.isArray(limited_to_apps) || !limited_to_apps.every(item => typeof item === 'string')) {
      console.error('Cannot update apikey', 'limited_to_apps must be an array of strings')
      return c.json({ error: 'limited_to_apps must be an array of strings' }, 400)
    }
    updateData.limited_to_apps = limited_to_apps
  }

  if (limited_to_orgs !== undefined) {
    if (!Array.isArray(limited_to_orgs) || !limited_to_orgs.every(item => typeof item === 'string')) {
      console.error('Cannot update apikey', 'limited_to_orgs must be an array of strings')
      return c.json({ error: 'limited_to_orgs must be an array of strings' }, 400)
    }
    updateData.limited_to_orgs = limited_to_orgs
  }

  if (Object.keys(updateData).length === 0) {
    console.error('Cannot update apikey', 'No valid fields provided for update')
    return c.json({ error: 'No valid fields provided for update. Provide name, mode, limited_to_apps, or limited_to_orgs.' }, 400)
  }

  const supabase = supabaseApikey(c as any, c.get('capgkey') as string)

  // Check if the apikey to update exists (RLS handles ownership)
  const { data: existingApikey, error: fetchError } = await supabase
    .from('apikeys')
    .select('id') // Select only id, RLS implicitly filters by user_id
    .or(`key.eq.${id},id.eq.${id}`)
    .maybeSingle()

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
    .select()
    .single()

  if (updateError) {
    console.error('Cannot update apikey', 'Failed to update API key', updateError)
    return c.json({ error: 'Failed to update API key', supabaseError: updateError }, 500)
  }

  return c.json({ apikey: updatedApikey })
})

export { app }
