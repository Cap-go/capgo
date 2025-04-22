import type { Database } from '../../utils/supabase.types.ts'
import { honoFactory, middlewareKey } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
import { Constants } from '../../utils/supabase.types.ts'

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
  const body = await c.req.json()
  console.log('body', body)

  const orgId = body.org_id
  const appId = body.app_id
  const name = body.name ?? ''

  const mode = body.mode ?? 'all'
  if (!name) {
    console.error('Cannot create apikey', 'Name is required')
    return c.json({ error: 'Name is required' }, 400)
  }
  if (!mode) {
    console.error('Cannot create apikey', 'Mode is required')
    return c.json({ error: 'Mode is required' }, 400)
  }
  const validModes = Constants.public.Enums.key_mode
  if (!validModes.includes(mode)) {
    console.error('Cannot create apikey', 'Invalid mode')
    return c.json({ error: 'Invalid mode' }, 400)
  }

  const supabase = supabaseAdmin(c as any)
  const newData: Database['public']['Tables']['apikeys']['Insert'] = {
    user_id: key.user_id,
    key: crypto.randomUUID(),
    mode,
    name,
  }
  if (orgId) {
    const { data: org, error } = await supabase.from('orgs').select('*').eq('id', orgId).single()
    if (!org || error) {
      console.error('Cannot create apikey', 'Org not found', error)
      return c.json({ error: 'Org not found', supabaseError: error }, 404)
    }
    newData.limited_to_orgs = [org.id]
  }
  if (appId) {
    const { data: app, error } = await supabase.from('apps').select('*').eq('id', appId).single()
    if (!app || error) {
      console.error('Cannot create apikey', 'App not found', error)
      return c.json({ error: 'App not found', supabaseError: error }, 404)
    }
    newData.limited_to_apps = [app.app_id]
  }

  const { data: apikeyData, error: apikeyError } = await supabase.from('apikeys')
    .insert(newData)
    .select()
    .single()
  if (apikeyError) {
    console.error('Cannot create apikey', 'Failed to create API key', apikeyError)
    return c.json({ error: 'Failed to create API key', supabaseError: apikeyError }, 500)
  }
  return c.json(apikeyData)
})

export default app
