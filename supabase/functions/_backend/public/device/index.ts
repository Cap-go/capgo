import type { Database } from '../../utils/supabase.types.ts'
import type { DeviceLink } from './delete.ts'
import { getBody, honoFactory, middlewareKey } from '../../utils/hono.ts'
import { deleteOverride } from './delete.ts'
import { get } from './get.ts'
import { post } from './post.ts'

export const app = honoFactory.createApp()

app.post('/', middlewareKey(['all', 'write']), async (c) => {
  try {
    const body = await c.req.json<DeviceLink>()
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']

    console.log('body', body)
    console.log('apikey', apikey)
    return post(c as any, body, apikey)
  }
  catch (e) {
    console.log('Cannot post devices', e)
    return c.json({ status: 'Cannot post devices', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', middlewareKey(['all', 'write', 'read']), async (c) => {
  try {
    const body = await getBody<DeviceLink>(c as any)
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    console.log('body', body)
    console.log('apikey', apikey)
    return get(c as any, body, apikey)
  }
  catch (e) {
    console.log('Cannot get devices', e)
    return c.json({ status: 'Cannot get devices', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/', middlewareKey(['all', 'write']), async (c) => {
  try {
    const body = await getBody<DeviceLink>(c as any)
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    console.log('body', body)
    console.log('apikey', apikey)
    return deleteOverride(c as any, body, apikey)
  }
  catch (e) {
    console.log('Cannot delete devices', e)
    return c.json({ status: 'Cannot delete devices', error: JSON.stringify(e) }, 500)
  }
})
