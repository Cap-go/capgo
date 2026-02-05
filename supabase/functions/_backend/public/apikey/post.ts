import type { AuthInfo } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { honoFactory, parseBody, quickError, simpleError } from '../../utils/hono.ts'
import { middlewareV2 } from '../../utils/hono_middleware.ts'
import { supabaseWithAuth, validateExpirationAgainstOrgPolicies, validateExpirationDate } from '../../utils/supabase.ts'
import { Constants } from '../../utils/supabase.types.ts'

const app = honoFactory.createApp()

app.post('/', middlewareV2(['all']), async (c) => {
  const auth = c.get('auth') as AuthInfo
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row'] | undefined

  // Only check limited_to_orgs constraint for API key auth (not JWT)
  if (auth.authType === 'apikey' && apikey?.limited_to_orgs?.length) {
    throw simpleError('cannot_create_apikey', 'You cannot do that as a limited API key', { apikey })
  }

  const body = await parseBody<any>(c)

  const orgId = body.org_id
  const appId = body.app_id
  const name = body.name ?? ''
  const limitedToApps = body.limited_to_apps ?? []
  const limitedToOrgs = body.limited_to_orgs ?? []
  const expiresAt = body.expires_at ?? null
  const isHashed = body.hashed === true

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

  // Validate expiration date format (throws if invalid)
  validateExpirationDate(expiresAt)

  // Use supabaseWithAuth which handles both JWT and API key authentication
  const supabase = supabaseWithAuth(c, auth)

  // Collect all org IDs for policy validation
  let allOrgIds: string[] = [...limitedToOrgs]

  if (orgId) {
    const { data: org, error } = await supabase.from('orgs').select('*').eq('id', orgId).single()
    if (!org || error) {
      throw quickError(404, 'org_not_found', 'Org not found', { supabaseError: error })
    }
    limitedToOrgs.splice(0, limitedToOrgs.length, org.id)
    allOrgIds = [org.id]
  }
  if (appId) {
    const { data: app, error } = await supabase.from('apps').select('*').eq('id', appId).single()
    if (!app || error) {
      throw quickError(404, 'app_not_found', 'App not found', { supabaseError: error })
    }
    limitedToApps.splice(0, limitedToApps.length, app.app_id)
  }

  // Validate expiration against org policies (throws if invalid)
  await validateExpirationAgainstOrgPolicies(allOrgIds, expiresAt, supabase)

  let apikeyData: Database['public']['Tables']['apikeys']['Row'] | null = null
  let apikeyError: unknown = null

  if (isHashed) {
    const { data, error } = await supabase.rpc('create_hashed_apikey', {
      p_user_id: auth.userId,
      p_mode: mode,
      p_name: name,
      p_limited_to_orgs: limitedToOrgs,
      p_limited_to_apps: limitedToApps,
      p_expires_at: expiresAt,
    })
    apikeyData = data
    apikeyError = error
  }
  else {
    const { data, error } = await supabase
      .from('apikeys')
      .insert({
        user_id: auth.userId,
        key: null,
        key_hash: null,
        mode,
        name,
        limited_to_apps: limitedToApps,
        limited_to_orgs: limitedToOrgs,
        expires_at: expiresAt,
      })
      .select()
      .single()
    apikeyData = data
    apikeyError = error
  }
  if (apikeyError || !apikeyData) {
    throw simpleError('failed_to_create_apikey', 'Failed to create API key', { supabaseError: apikeyError })
  }

  return c.json(apikeyData)
})

export default app
