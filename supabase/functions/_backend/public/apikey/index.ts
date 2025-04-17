import type { Database } from '../../utils/supabase.types.ts'
import { honoFactory, middlewareKey } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

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

  const numberId = Number(id)
  if (Number.isNaN(numberId)) {
    console.error('Cannot delete apikey', 'Invalid API key ID')
    return c.json({ error: 'Invalid API key ID' }, 400)
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
    .eq('id', numberId)
    .eq('user_id', key.user_id)

  if (error) {
    console.error('Cannot delete apikey', 'Failed to delete API key', error)
    return c.json({ error: 'Failed to delete API key', supabaseError: error }, 500)
  }

  return c.json({ success: true })
})

export { app }
