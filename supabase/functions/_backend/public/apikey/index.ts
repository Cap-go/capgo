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
  if (!orgId) {
    return c.json({ error: 'Org ID is required' }, 400)
  }

  const mode = c.req.query('mode')
  if (!mode) {
    return c.json({ error: 'Mode is required' }, 400)
  }

  if (mode !== 'all' && mode !== 'upload' && mode !== 'read' && mode !== 'write') {
    return c.json({ error: 'Invalid mode' }, 400)
  }

  const supabase = supabaseAdmin(c)
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
})

export { app }
