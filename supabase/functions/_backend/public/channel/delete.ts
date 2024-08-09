import type { Context } from '@hono/hono'
import type { z } from '@hono/zod-openapi'
import { OpenAPIHono } from '@hono/zod-openapi'
import { hasAppRight, supabaseAdmin } from '../../utils/supabase.ts'
import type { MiddlewareKeyEnv } from '../../utils/hono.ts'
import { BRES, middlewareKey } from '../../utils/hono.ts'
import { errorHook } from '../../utils/open_api.ts'
import { deleteRouteAndSchema } from './docs.ts'

export function deleteApp(deprecated: boolean) {
  const app = new OpenAPIHono<MiddlewareKeyEnv>({
    defaultHook: errorHook(),
  })

  // eslint-disable-next-line unused-imports/no-unused-vars
  const { route, requestSchema } = deleteRouteAndSchema(deprecated)

  app.use(route.getRoutingPath(), middlewareKey(['all', 'write']))

  app.openapi(route, async (c: Context) => {
    const body = c.req.query() as any as z.infer<typeof requestSchema>
    const apikey = c.get('apikey')

    if (!(await hasAppRight(c, body.app_id, apikey.user_id, 'admin'))) {
      console.log('You can\'t access this app', body.app_id)
      return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
    }
    if (!body.channel) {
      console.log('You must provide a channel name')
      return c.json({ status: 'You must provide a channel name' }, 400)
    }

    try {
      // search if that exist first
      const { data: dataChannel, error: dbError } = await supabaseAdmin(c)
        .from('channels')
        .select('id')
        .eq('app_id', body.app_id)
        .eq('name', body.channel)
        .single()
      if (dbError || !dataChannel) {
        console.log('Cannot find channel', dbError)
        return c.json({ status: 'Cannot find channel', error: JSON.stringify(dbError) }, 400)
      }
      await supabaseAdmin(c)
        .from('channels')
        .delete()
        .eq('app_id', body.app_id)
        .eq('name', body.channel)
    }
    catch (e) {
      console.log('Cannot delete channels', e)
      return c.json({ status: 'Cannot delete channels', error: JSON.stringify(e) }, 500)
    }
    return c.json(BRES, 200)
  })

  return app
}
