import { Hono } from 'hono/tiny'
import { middlewareKey } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

const app = new Hono()

app.post('/', middlewareKey(['all']), async (c) => {
  const key = c.get('apikey')
  if (!key) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (key.limited_to_orgs && key.limited_to_orgs.length > 0) {
    return c.json({ error: 'You cannot do that as a limited API key' }, 401)
  }

  const orgId = c.req.query('org_id')
  const appId = c.req.query('app_id')

  if (!orgId && !appId) {
    return c.json({ error: 'Org ID or App ID is required' }, 400)
  }

  const mode = c.req.query('mode')
  if (!mode) {
    return c.json({ error: 'Mode is required' }, 400)
  }

  if (mode !== 'all' && mode !== 'upload' && mode !== 'read' && mode !== 'write') {
    return c.json({ error: 'Invalid mode' }, 400)
  }

  const supabase = supabaseAdmin(c)
  if (orgId) {
    const { data: org, error } = await supabase.from('orgs').select('*').eq('id', orgId).single()
    if (!org || error) {
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
      return c.json({ error: 'Failed to create API key', supabaseError: apikeyError }, 500)
    }

    return c.json({ apikey: apikeyData })
  }
  else if (appId) {
    const { data: app, error } = await supabase.from('apps').select('*').eq('id', appId).single()
    if (!app || error) {
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
      return c.json({ error: 'Failed to create API key', supabaseError: apikeyError }, 500)
    }

    return c.json({ apikey: apikeyData })
  }
})

app.delete('/:id', middlewareKey(['all']), async (c) => {
  const key = c.get('apikey')
  if (!key) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (key.limited_to_orgs && key.limited_to_orgs.length > 0) {
    return c.json({ error: 'You cannot do that as a limited API key' }, 401)
  }

  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'API key ID is required' }, 400)
  }

  const supabase = supabaseAdmin(c)

  const { data: apikey, error: apikeyError } = await supabase.from('apikeys').select('*').eq('key', id).eq('user_id', key.user_id).single()
  if (!apikey || apikeyError) {
    return c.json({ error: 'API key not found', supabaseError: apikeyError }, 404)
  }

  const { error } = await supabase
    .from('apikeys')
    .delete()
    .eq('key', id)
    .eq('user_id', key.user_id)

  if (error) {
    return c.json({ error: 'Failed to delete API key', supabaseError: error }, 500)
  }

  return c.json({ success: true })
})

export { app }
