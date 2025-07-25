import type { Database } from '../../utils/supabase.types.ts'
import type { GetLatest } from './get.ts'
import { getBodyOrQuery, honoFactory, middlewareKey } from '../../utils/hono.ts'
import { createBundle } from './create.ts'
import { deleteBundle } from './delete.ts'
import { get } from './get.ts'
import { setChannel } from './set_channel.ts'
import { app as updateMetadataApp } from './update_metadata.ts'

export const app = honoFactory.createApp()

// Add the route for updating bundle metadata
app.route('/metadata', updateMetadataApp)

app.get('/', middlewareKey(['all', 'write', 'read']), async (c) => {
  const body = await getBodyOrQuery<GetLatest>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return get(c, body, apikey)
})

app.delete('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<GetLatest>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return deleteBundle(c, body, apikey)
})

app.put('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return setChannel(c, body, apikey)
})

app.post('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return createBundle(c, body, apikey)
})
