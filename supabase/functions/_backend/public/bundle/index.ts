import type { Database } from '../../utils/supabase.types.ts'
import type { GetLatest } from './get.ts'
import { getBody, honoFactory, middlewareKey } from '../../utils/hono.ts'
import { cloudlogErr } from '../../utils/loggin.ts'
import { deleteBundle } from './delete.ts'
import { get } from './get.ts'
import { setChannel } from './set_channel.ts'
import { app as updateMetadataApp } from './update_metadata.ts'

export const app = honoFactory.createApp()

// Add the route for updating bundle metadata
app.route('/metadata', updateMetadataApp)

app.get('/', middlewareKey(['all', 'write', 'read']), async (c) => {
  try {
    const body = await getBody<GetLatest>(c as any)
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    return get(c as any, body, apikey)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get bundle', error: e })
    return c.json({ status: 'Cannot get bundle', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/', middlewareKey(['all', 'write']), async (c) => {
  try {
    const body = await getBody<GetLatest>(c as any)
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    return deleteBundle(c as any, body, apikey)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete bundle', error: e })
    return c.json({ status: 'Cannot delete bundle', error: JSON.stringify(e) }, 500)
  }
})

app.put('/', middlewareKey(['all', 'write']), async (c) => {
  try {
    const body = await getBody<any>(c as any)
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    return setChannel(c as any, body, apikey)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot set bundle to channel', error: e })
    return c.json({ status: 'Cannot set bundle to channel', error: JSON.stringify(e) }, 500)
  }
})
