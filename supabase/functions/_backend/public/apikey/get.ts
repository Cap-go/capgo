import type { AuthInfo } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { honoFactory, quickError, simpleError } from '../../utils/hono.ts'
import { middlewareV2 } from '../../utils/hono_middleware.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

const app = honoFactory.createApp()

// Validate id format to prevent PostgREST filter injection
// ID must be a valid UUID or numeric string
function isValidIdFormat(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const numericRegex = /^\d+$/
  return uuidRegex.test(id) || numericRegex.test(id)
}

app.get('/', middlewareV2(['all']), async (c) => {
  const auth = c.get('auth') as AuthInfo
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row'] | undefined

  const callerHasLimitedScope = (apikey?.limited_to_orgs?.length ?? 0) > 0
    || (apikey?.limited_to_apps?.length ?? 0) > 0
  if (auth.authType === 'apikey' && callerHasLimitedScope) {
    throw quickError(401, 'cannot_list_apikeys', 'You cannot do that as a limited API key', { apikeyId: apikey?.id })
  }

  // Direct PostgREST table access is intentionally stricter for API-key
  // callers. This endpoint already authenticated the caller, so use the
  // service-role client and keep the explicit owner filter below.
  const supabase = supabaseAdmin(c)

  const { data: apikeys, error } = await supabase
    .from('apikeys')
    .select('*')
    .eq('user_id', auth.userId)

  if (error) {
    throw quickError(500, 'failed_to_list_apikeys', 'Failed to list API keys', { supabaseError: error })
  }

  return c.json(apikeys)
})

app.get('/:id', middlewareV2(['all']), async (c) => {
  const auth = c.get('auth') as AuthInfo
  const authApikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row'] | undefined

  const callerHasLimitedScope = (authApikey?.limited_to_orgs?.length ?? 0) > 0
    || (authApikey?.limited_to_apps?.length ?? 0) > 0
  if (auth.authType === 'apikey' && callerHasLimitedScope) {
    throw quickError(401, 'cannot_get_apikey', 'You cannot do that as a limited API key', { apikeyId: authApikey?.id })
  }

  const id = c.req.param('id')
  if (!id) {
    throw simpleError('api_key_id_required', 'API key ID is required')
  }

  // Validate id format to prevent PostgREST filter injection
  if (!isValidIdFormat(id)) {
    throw simpleError('invalid_id_format', 'API key ID must be a valid UUID or number')
  }

  // Direct PostgREST table access is intentionally stricter for API-key
  // callers. This endpoint already authenticated the caller, so use the
  // service-role client and keep the explicit owner filter below.
  const supabase = supabaseAdmin(c)
  const { data: fetchedApikey, error } = await supabase
    .from('apikeys')
    .select('*')
    .or(`key.eq.${id},id.eq.${id}`)
    .eq('user_id', auth.userId)
    .single()
  if (error) {
    throw quickError(404, 'failed_to_get_apikey', 'Failed to get API key', { supabaseError: error })
  }
  return c.json(fetchedApikey)
})

export default app
