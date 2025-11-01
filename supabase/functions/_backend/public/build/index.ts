import type { Database } from '../../utils/supabase.types.ts'
import type { RequestBuildBody } from './request.ts'
import { getBodyOrQuery, honoFactory } from '../../utils/hono.ts'
import { middlewareKey } from '../../utils/hono_middleware.ts'
import { requestBuild } from './request.ts'

export const app = honoFactory.createApp()

// POST /build - Request a new native build
app.post('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<RequestBuildBody>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return requestBuild(c, body, apikey)
})
