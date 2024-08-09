import type { Context } from '@hono/hono'
import type { z } from '@hono/zod-openapi'
import { OpenAPIHono } from '@hono/zod-openapi'
import { type MiddlewareKeyEnv, middlewareKey } from '../../utils/hono.ts'
import { errorHook } from '../../utils/open_api.ts'
import { hasAppRight, supabaseAdmin } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'
import type { getRequestSchema } from './docs.ts'
import { getRoute, getValidResponseSchema } from './docs.ts'

export const getApp = new OpenAPIHono<MiddlewareKeyEnv>({
  defaultHook: errorHook(),
})

getApp.use(getRoute.getRoutingPath(), middlewareKey(['all', 'write', 'read', 'upload']))
getApp.openapi(getRoute, async (c: Context) => {
  try {
    const body = c.req.query() as any as z.infer<typeof getRequestSchema>
    const apikey = c.get('apikey')

    if (!body.app_id)
      return c.json({ status: 'Missing app_id' }, 400)

    if (!(await hasAppRight(c, body.app_id, apikey.user_id, 'read')))
      return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

    const fetchOffset = body.page == null ? 0 : body.page
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1
    const { data: dataBundles, error: dbError } = await supabaseAdmin(c)
      .from('app_versions')
      .select()
      .eq('app_id', body.app_id)
      .eq('deleted', false)
      .range(from, to)
      .order('created_at', { ascending: false })
    if (dbError || !dataBundles || !dataBundles.length)
      return c.json({ status: 'Cannot get bundle', error: dbError }, 400)

    const parsedResponse = getValidResponseSchema.safeParse(dataBundles)
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
