import type { Context } from '@hono/hono'
import type { z } from '@hono/zod-openapi'
import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { hasAppRight, supabaseAdmin } from '../../../utils/supabase.ts'
import { fetchLimit } from '../../../utils/utils.ts'
import type { MiddlewareKeyEnv } from '../../../utils/hono.ts'
import { middlewareKey } from '../../../utils/hono.ts'
import { errorHook, errorResponse_422, error_500, response_400 } from '../../../utils/open_api.ts'
import type { requestSchema } from './docs.ts'
import { route, validResponseSchema } from './docs.ts'

export const app = new OpenAPIHono<MiddlewareKeyEnv>({
  defaultHook: errorHook(),
})

app.use(route.getRoutingPath(), middlewareKey(['all', 'write', 'read', 'upload']))
app.openapi(route, async (c: Context) => {
  try {
    const body = c.req.query() as any as z.infer<typeof requestSchema>
    const apikey = c.get('apikey')
    // return get(c, body, apikey)

    if (!(await hasAppRight(c, body.app_id, apikey.user_id, 'read')))
      return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

    const fetchOffset = body.page == null ? 0 : body.page
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1
    const { data: dataBundles, error: dbError } = await supabaseAdmin(c)
      .from('app_versions')
      .select(`
        id,
        created_at,
        app_id,
        name,
        updated_at,
        external_url,
        checksum,
        session_key,
        storage_provider,
        min_update_version
      `)
      .eq('app_id', body.app_id)
      .eq('deleted', false)
      .range(from, to)
      .order('created_at', { ascending: false })
    if (dbError || !dataBundles || !dataBundles.length)
      return c.json({ status: 'Cannot get bundle', error: dbError }, 500)

    const parsedResponse = validResponseSchema.safeParse(dataBundles)
    if (!parsedResponse.success) {
      console.error('Database response does not match schema', parsedResponse.error)
      return c.json({ status: 'Database response does not match schema', error: parsedResponse.error }, 500)
    }

    return c.json(parsedResponse.data, 200)
  }
  catch (e) {
    return c.json({ status: 'Cannot get bundle', error: JSON.stringify(e) }, 500)
  }
})
// app.use(), async (c) => {
//   try {
//     const body = await getBody<GetLatest>(c)
//     const apikey = c.get('apikey')
//     return get(c, body, apikey)
//   }
//   catch (e) {
//     return c.json({ status: 'Cannot get bundle', error: JSON.stringify(e) }, 500)
//   }
// })

// app.delete('/', middlewareKey(['all', 'write']), async (c: Context) => {
//   try {
//     const body = await getBody<GetLatest>(c)
//     const apikey = c.get('apikey')
//     return deleteBundle(c, body, apikey)
//   }
//   catch (e) {
//     return c.json({ status: 'Cannot delete bundle', error: JSON.stringify(e) }, 500)
//   }
// })
