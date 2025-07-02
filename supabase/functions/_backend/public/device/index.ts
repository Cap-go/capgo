import type { Database } from '../../utils/supabase.types.ts'
import type { DeviceLink } from './delete.ts'
import { getBody, honoFactory, middlewareKey } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/loggin.ts'
import { deleteOverride } from './delete.ts'
import { get } from './get.ts'
import { post } from './post.ts'

export const app = honoFactory.createApp()

app.post('/', middlewareKey(['all', 'write']), async (c) => {
  try {
    const body = await c.req.json<DeviceLink>()
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']

    cloudlog({ requestId: c.get('requestId'), message: 'body', body })
    cloudlog({ requestId: c.get('requestId'), message: 'apikey', apikey })
    return post(c, body, apikey)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot post devices', error: e })
    return c.json({ status: 'Cannot post devices', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', middlewareKey(['all', 'write', 'read']), async (c) => {
  try {
    const body = await getBody<DeviceLink>(c)
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    cloudlog({ requestId: c.get('requestId'), message: 'body', body })
    cloudlog({ requestId: c.get('requestId'), message: 'apikey', apikey })
    return get(c, body, apikey)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get devices', error: e })
    return c.json({ status: 'Cannot get devices', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/', middlewareKey(['all', 'write']), async (c) => {
  try {
    const body = await getBody<DeviceLink>(c)
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    cloudlog({ requestId: c.get('requestId'), message: 'body', body })
    cloudlog({ requestId: c.get('requestId'), message: 'apikey', apikey })
    return deleteOverride(c, body, apikey)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete devices', error: e })
    return c.json({ status: 'Cannot delete devices', error: JSON.stringify(e) }, 500)
  }
})
