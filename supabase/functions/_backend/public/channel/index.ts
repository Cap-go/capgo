import type { Database } from '../../utils/supabase.types.ts'
import type { ChannelSet } from './delete.ts'
import { getBody, honoFactory, middlewareKey } from '../../utils/hono.ts'
import { deleteChannel } from './delete.ts'
import { get } from './get.ts'
import { post } from './post.ts'

export const app = honoFactory.createApp()

app.post('/', middlewareKey(['all', 'write']), async (c) => {
  try {
    const body = await c.req.json<ChannelSet>()
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    return post(c as any, body, apikey)
  }
  catch (e) {
    console.error('Cannot create channel', e)
    return c.json({ status: 'Cannot create channel', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', middlewareKey(['all', 'write', 'read']), async (c) => {
  try {
    const body = await getBody<ChannelSet>(c as any)
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    return get(c as any, body, apikey)
  }
  catch (e) {
    console.error('Cannot get channel', e)
    return c.json({ status: 'Cannot get channel', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/', middlewareKey(['all', 'write']), async (c) => {
  try {
    const body = await getBody<ChannelSet>(c as any)
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    return deleteChannel(c as any, body, apikey)
  }
  catch (e) {
    console.error('Cannot delete channel', e)
    return c.json({ status: 'Cannot delete channel', error: JSON.stringify(e) }, 500)
  }
})
