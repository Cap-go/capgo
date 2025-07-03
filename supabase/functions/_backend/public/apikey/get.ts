import { honoFactory, middlewareKey, simpleError } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

const app = honoFactory.createApp()

app.get('/', middlewareKey(['all']), async (c) => {
  const key = c.get('apikey')!
  if (key.limited_to_orgs?.length) {
    throw simpleError('cannot_create_apikey', 'You cannot do that as a limited API key', { key })
  }
  const supabase = supabaseAdmin(c)

  const { data: apikeys, error } = await supabase
    .from('apikeys')
    .select('*')
    .eq('user_id', key.user_id)

  if (error) {
    throw simpleError('failed_to_list_apikeys', 'Failed to list API keys', { supabaseError: error })
  }

  return c.json(apikeys)
})

app.get('/:id', middlewareKey(['all']), async (c) => {
  const key = c.get('apikey')!
  if (key.limited_to_orgs?.length) {
    throw simpleError('cannot_create_apikey', 'You cannot do that as a limited API key', { key })
  }
  const id = c.req.param('id')
  if (!id) {
    throw simpleError('api_key_id_required', 'API key ID is required', { id })
  }
  const supabase = supabaseAdmin(c)
  const { data: apikey, error } = await supabase
    .from('apikeys')
    .select('*')
    .or(`key.eq.${id},id.eq.${id}`)
    .eq('user_id', key.user_id)
    .single()
  if (error) {
    throw simpleError('failed_to_get_apikey', 'Failed to get API key', { supabaseError: error })
  }
  return c.json(apikey)
})

export default app
