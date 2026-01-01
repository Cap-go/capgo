import type { AuthInfo } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { honoFactory, quickError, simpleError } from '../../utils/hono.ts'
import { middlewareV2 } from '../../utils/hono_middleware.ts'
import { supabaseWithAuth } from '../../utils/supabase.ts'

const app = honoFactory.createApp()

// Validate id format to prevent PostgREST filter injection
// ID must be a valid UUID or numeric string
function isValidIdFormat(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const numericRegex = /^\d+$/
  return uuidRegex.test(id) || numericRegex.test(id)
}

app.delete('/:id', middlewareV2(['all']), async (c) => {
  const auth = c.get('auth') as AuthInfo
  const authApikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row'] | undefined

  // Only check limited_to_orgs constraint for API key auth (not JWT)
  if (auth.authType === 'apikey' && authApikey?.limited_to_orgs?.length) {
    throw quickError(401, 'cannot_delete_apikey', 'You cannot do that as a limited API key', { apikeyId: authApikey.id })
  }

  const id = c.req.param('id')
  if (!id) {
    throw simpleError('api_key_id_required', 'API key ID is required')
  }

  // Validate id format to prevent PostgREST filter injection
  if (!isValidIdFormat(id)) {
    throw simpleError('invalid_id_format', 'API key ID must be a valid UUID or number')
  }

  // Use supabaseWithAuth which handles both JWT and API key authentication
  const supabase = supabaseWithAuth(c, auth)

  const { data: apikey, error: apikeyError } = await supabase.from('apikeys').select('*').or(`key.eq.${id},id.eq.${id}`).eq('user_id', auth.userId).single()
  if (!apikey || apikeyError) {
    throw quickError(404, 'api_key_not_found', 'API key not found', { supabaseError: apikeyError })
  }

  const { error } = await supabase
    .from('apikeys')
    .delete()
    .or(`key.eq.${id},id.eq.${id}`)
    .eq('user_id', auth.userId)

  if (error) {
    throw quickError(500, 'failed_to_delete_apikey', 'Failed to delete API key', { supabaseError: error })
  }

  return c.json({ success: true })
})

export default app
