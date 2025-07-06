import type { Database } from '../../utils/supabase.types.ts'
import { honoFactory, middlewareKey, parseBody, quickError, simpleError } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
import { Constants } from '../../utils/supabase.types.ts'

const app = honoFactory.createApp()

app.post('/', middlewareKey(['all']), async (c) => {
  const key = c.get('apikey')!

  if (key.limited_to_orgs?.length) {
    throw simpleError('cannot_create_apikey', 'You cannot do that as a limited API key', { key })
  }
  const body = await parseBody<any>(c)

  const orgId = body.org_id
  const appId = body.app_id
  const name = body.name ?? ''
  const limitedToApps = body.limited_to_apps ?? []
  const limitedToOrgs = body.limited_to_orgs ?? []

  const mode = body.mode ?? 'all'
  if (!name) {
    throw simpleError('name_is_required', 'Name is required')
  }
  if (!mode) {
    throw simpleError('mode_is_required', 'Mode is required')
  }
  const validModes = Constants.public.Enums.key_mode
  if (!validModes.includes(mode)) {
    throw simpleError('invalid_mode', 'Invalid mode')
  }

  const supabase = supabaseAdmin(c)
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
      throw quickError(404, 'org_not_found', 'Org not found', { supabaseError: error })
    }
    newData.limited_to_orgs = [org.id]
  }
  if (appId) {
    const { data: app, error } = await supabase.from('apps').select('*').eq('id', appId).single()
    if (!app || error) {
      throw quickError(404, 'app_not_found', 'App not found', { supabaseError: error })
    }
    newData.limited_to_apps = [app.app_id]
  }

  const { data: apikeyData, error: apikeyError } = await supabase.from('apikeys')
    .insert(newData)
    .select()
    .single()
  if (apikeyError) {
    throw simpleError('failed_to_create_apikey', 'Failed to create API key', { supabaseError: apikeyError })
  }
  return c.json(apikeyData)
})

export default app
