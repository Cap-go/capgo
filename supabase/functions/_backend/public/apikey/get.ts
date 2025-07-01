import { honoFactory, middlewareKey } from '../../utils/hono.ts'
import { cloudlogErr } from '../../utils/loggin.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

const app = honoFactory.createApp()

app.get('/', middlewareKey(['all']), async (c) => {
  const key = c.get('apikey')!
  if (key.limited_to_orgs?.length) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot create apikey You cannot do that as a limited API key' })
    return c.json({ error: 'You cannot do that as a limited API key' }, 401)
  }
  const supabase = supabaseAdmin(c as any)

  const { data: apikeys, error } = await supabase
    .from('apikeys')
    .select('*')
    .eq('user_id', key.user_id)

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot list apikeys Failed to list API keys', error })
    return c.json({ error: 'Failed to list API keys', supabaseError: error }, 500)
  }

  return c.json(apikeys)
})

app.get('/:id', middlewareKey(['all']), async (c) => {
  const key = c.get('apikey')!
  if (key.limited_to_orgs?.length) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot create apikey You cannot do that as a limited API key' })
    return c.json({ error: 'You cannot do that as a limited API key' }, 401)
  }
  const id = c.req.param('id')
  if (!id) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot update apikey API key ID is required' })
    return c.json({ error: 'API key ID is required' }, 400)
  }
  const supabase = supabaseAdmin(c as any)
  const { data: apikey, error } = await supabase
    .from('apikeys')
    .select('*')
    .or(`key.eq.${id},id.eq.${id}`)
    .eq('user_id', key.user_id)
    .single()
  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get apikey Failed to get API key', error })
    return c.json({ error: 'Failed to get API key', supabaseError: error }, 404)
  }
  return c.json(apikey)
})

export default app
