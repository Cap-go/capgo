import { honoFactory, middlewareKey } from '../../utils/hono.ts'
import { cloudlogErr } from '../../utils/loggin.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

const app = honoFactory.createApp()

app.delete('/:id', middlewareKey(['all']), async (c) => {
  const key = c.get('apikey')!
  if (key.limited_to_orgs?.length) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete apikey You cannot do that as a limited API key' })
    return c.json({ error: 'You cannot do that as a limited API key' }, 401)
  }

  const id = c.req.param('id')
  if (!id) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete apikey API key ID is required' })
    return c.json({ error: 'API key ID is required' }, 400)
  }

  const supabase = supabaseAdmin(c as any)

  const { data: apikey, error: apikeyError } = await supabase.from('apikeys').select('*').or(`key.eq.${id},id.eq.${id}`).eq('user_id', key.user_id).single()
  if (!apikey || apikeyError) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete apikey API key not found', error: apikeyError })
    return c.json({ error: 'API key not found', supabaseError: apikeyError }, 404)
  }

  const { error } = await supabase
    .from('apikeys')
    .delete()
    .or(`key.eq.${id},id.eq.${id}`)
    .eq('user_id', key.user_id)

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete apikey Failed to delete API key', error })
    return c.json({ error: 'Failed to delete API key', supabaseError: error }, 500)
  }

  return c.json({ success: true })
})

export default app
