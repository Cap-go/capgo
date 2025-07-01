import type { Database } from '../../utils/supabase.types.ts'
import { honoFactory, middlewareKey } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/loggin.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
import { Constants } from '../../utils/supabase.types.ts'

const app = honoFactory.createApp()

app.post('/', middlewareKey(['all']), async (c) => {
  const key = c.get('apikey')!

  if (key.limited_to_orgs?.length) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot create apikey You cannot do that as a limited API key' })
    return c.json({ error: 'You cannot do that as a limited API key' }, 401)
  }
  const body = await c.req.json()
  cloudlog({ requestId: c.get('requestId'), message: 'body', data: body })

  const orgId = body.org_id
  const appId = body.app_id
  const name = body.name ?? ''
  const limitedToApps = body.limited_to_apps ?? []
  const limitedToOrgs = body.limited_to_orgs ?? []

  const mode = body.mode ?? 'all'
  if (!name) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot create apikey Name is required' })
    return c.json({ error: 'Name is required' }, 400)
  }
  if (!mode) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot create apikey Mode is required' })
    return c.json({ error: 'Mode is required' }, 400)
  }
  const validModes = Constants.public.Enums.key_mode
  if (!validModes.includes(mode)) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot create apikey Invalid mode' })
    return c.json({ error: 'Invalid mode' }, 400)
  }

  const supabase = supabaseAdmin(c as any)
  const newData: Database['public']['Tables']['apikeys']['Insert'] = {
    user_id: key.user_id,
    key: crypto.randomUUID(),
    mode,
    name,
    limited_to_apps: limitedToApps,
    limited_to_orgs: limitedToOrgs,
  }
  if (orgId) {
    const { data: org, error } = await supabase.from('orgs').select('*').eq('id', orgId).single()
    if (!org || error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot create apikey Org not found', error })
      return c.json({ error: 'Org not found', supabaseError: error }, 404)
    }
    newData.limited_to_orgs = [org.id]
  }
  if (appId) {
    const { data: app, error } = await supabase.from('apps').select('*').eq('id', appId).single()
    if (!app || error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot create apikey App not found', error })
      return c.json({ error: 'App not found', supabaseError: error }, 404)
    }
    newData.limited_to_apps = [app.app_id]
  }

  const { data: apikeyData, error: apikeyError } = await supabase.from('apikeys')
    .insert(newData)
    .select()
    .single()
  if (apikeyError) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot create apikey Failed to create API key', error: apikeyError })
    return c.json({ error: 'Failed to create API key', supabaseError: apikeyError }, 500)
  }
  return c.json(apikeyData)
})

export default app
