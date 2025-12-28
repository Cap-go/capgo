import type { Database } from '../../utils/supabase.types.ts'
import { honoFactory, parseBody, quickError, simpleError } from '../../utils/hono.ts'
import { middlewareKey } from '../../utils/hono_middleware.ts'
import { supabaseApikey, validateApikeyExpirationForOrg } from '../../utils/supabase.ts'
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
  const expiresAt = body.expires_at ?? null

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

  // Validate expiration date if provided
  if (expiresAt) {
    const expirationDate = new Date(expiresAt)
    if (Number.isNaN(expirationDate.getTime())) {
      throw simpleError('invalid_expiration_date', 'Invalid expiration date format')
    }
    if (expirationDate <= new Date()) {
      throw simpleError('invalid_expiration_date', 'Expiration date must be in the future')
    }
  }

  // Use anon client with capgkey header; RLS enforces ownership via user_id
  const supabase = supabaseApikey(c, key.key)

  // Collect all org IDs for policy validation
  let allOrgIds: string[] = [...limitedToOrgs]

  const newData: Database['public']['Tables']['apikeys']['Insert'] = {
    user_id: key.user_id,
    key: crypto.randomUUID(),
    mode,
    name,
    limited_to_apps: limitedToApps,
    limited_to_orgs: limitedToOrgs,
    expires_at: expiresAt,
  }
  if (orgId) {
    const { data: org, error } = await supabase.from('orgs').select('*').eq('id', orgId).single()
    if (!org || error) {
      throw quickError(404, 'org_not_found', 'Org not found', { supabaseError: error })
    }
    newData.limited_to_orgs = [org.id]
    allOrgIds = [org.id]
  }
  if (appId) {
    const { data: app, error } = await supabase.from('apps').select('*').eq('id', appId).single()
    if (!app || error) {
      throw quickError(404, 'app_not_found', 'App not found', { supabaseError: error })
    }
    newData.limited_to_apps = [app.app_id]
  }

  // Validate expiration against org policies
  for (const limitedOrgId of allOrgIds) {
    const validation = await validateApikeyExpirationForOrg(c, limitedOrgId, expiresAt, supabase)
    if (!validation.valid) {
      if (validation.error === 'expiration_required') {
        throw simpleError('expiration_required', 'This organization requires API keys to have an expiration date')
      }
      if (validation.error === 'expiration_exceeds_max') {
        throw simpleError('expiration_exceeds_max', `API key expiration cannot exceed ${validation.maxDays} days for this organization`)
      }
    }
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
