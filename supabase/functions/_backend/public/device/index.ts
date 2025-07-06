import type { Database } from '../../utils/supabase.types.ts'
import type { DeviceLink } from './delete.ts'
import { getBody, honoFactory, middlewareKey, parseBody } from '../../utils/hono.ts'
import { cloudlog } from '../../utils/loggin.ts'
import { deleteOverride } from './delete.ts'
import { get } from './get.ts'
import { post } from './post.ts'

export const app = honoFactory.createApp()

app.post('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await parseBody<DeviceLink>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']

  cloudlog({ requestId: c.get('requestId'), message: 'body', body })
  cloudlog({ requestId: c.get('requestId'), message: 'apikey', apikey })
  return post(c, body, apikey)
})

app.get('/', middlewareKey(['all', 'write', 'read']), async (c) => {
  const body = await getBody<DeviceLink>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'body', body })
  cloudlog({ requestId: c.get('requestId'), message: 'apikey', apikey })
  return get(c, body, apikey)
})

app.delete('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBody<DeviceLink>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'body', body })
  cloudlog({ requestId: c.get('requestId'), message: 'apikey', apikey })
  return deleteOverride(c, body, apikey)
})
