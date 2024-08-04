import type { Context } from '@hono/hono'
import type { z } from '@hono/zod-openapi'
import { OpenAPIHono } from '@hono/zod-openapi'
import { hasAppRight, supabaseAdmin } from '../../../utils/supabase.ts'
import type { MiddlewareKeyEnv } from '../../../utils/hono.ts'
import { BRES, middlewareKey } from '../../../utils/hono.ts'
import { errorHook } from '../../../utils/open_api.ts'
import { getRouteAndSchema } from './docs.ts'

export function deleteApp(deprecated: boolean) {
  const app = new OpenAPIHono<MiddlewareKeyEnv>({
    defaultHook: errorHook(),
  })

  // eslint-disable-next-line unused-imports/no-unused-vars
  const { route, requestSchema } = getRouteAndSchema(deprecated)

  app.use(route.getRoutingPath(), middlewareKey(['all', 'write']))
  app.openapi(route, async (c: Context) => {
    const body = c.req.query() as any as z.infer<typeof requestSchema>
    const apikey = c.get('apikey')

    try {
      if (!(await hasAppRight(c, body.app_id, apikey.user_id, 'write')))
        return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

      const { error } = await supabaseAdmin(c)
        .from('devices_override')
        .delete()
        .eq('app_id', body.app_id)
        .eq('device_id', body.device_id)
      if (error)
        return c.json({ status: 'Cannot delete override', error: JSON.stringify(error) }, 400)

      const { error: errorChannel } = await supabaseAdmin(c)
        .from('channel_devices')
        .delete()
        .eq('app_id', body.app_id)
        .eq('device_id', body.device_id)
      if (errorChannel)
        return c.json({ status: 'Cannot delete channel override', error: JSON.stringify(errorChannel) }, 400)
      return c.json(BRES, 200)
    }
    catch (e) {
      console.error('Cannot delete channel', e)
      return c.json({ status: 'Cannot delete channel', error: JSON.stringify(e) }, 500)
    }
  })

  return app
}
