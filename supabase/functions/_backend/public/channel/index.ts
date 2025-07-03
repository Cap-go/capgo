import type { Database } from '../../utils/supabase.types.ts'
import type { ChannelSet } from './delete.ts'
import { getBody, honoFactory, middlewareKey, simpleError } from '../../utils/hono.ts'
import { deleteChannel } from './delete.ts'
import { get } from './get.ts'
import { post } from './post.ts'

export const app = honoFactory.createApp()

app.post('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await c.req.json<ChannelSet>()
    .catch((e) => {
      throw simpleError('invalid_json_body', 'Invalid JSON body', { e })
    })
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return post(c, body, apikey)
})

app.get('/', middlewareKey(['all', 'write', 'read']), async (c) => {
  const body = await getBody<ChannelSet>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return get(c, body, apikey)
})

app.delete('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBody<ChannelSet>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return deleteChannel(c, body, apikey)
})
