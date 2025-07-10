import { honoFactory, middlewareKey, quickError, simpleError } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

const app = honoFactory.createApp()

app.delete('/:id', middlewareKey(['all']), async (c) => {
  const key = c.get('apikey')!
  if (key.limited_to_orgs?.length) {
    throw quickError(401, 'cannot_delete_apikey', 'You cannot do that as a limited API key', { key })
  }

  const id = c.req.param('id')
  if (!id) {
    throw simpleError('api_key_id_required', 'API key ID is required', { id })
  }

  const supabase = supabaseAdmin(c)

  const { data: apikey, error: apikeyError } = await supabase.from('apikeys').select('*').or(`key.eq.${id},id.eq.${id}`).eq('user_id', key.user_id).single()
  if (!apikey || apikeyError) {
    throw quickError(404, 'api_key_not_found', 'API key not found', { supabaseError: apikeyError })
  }

  const { error } = await supabase
    .from('apikeys')
    .delete()
    .or(`key.eq.${id},id.eq.${id}`)
    .eq('user_id', key.user_id)

  if (error) {
    throw quickError(500, 'failed_to_delete_apikey', 'Failed to delete API key', { supabaseError: error })
  }

  return c.json({ success: true })
})

export default app
