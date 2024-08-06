/* eslint-disable unused-imports/no-unused-vars */
import type { Context } from '@hono/hono'
import { OpenAPIHono } from '@hono/zod-openapi'
import type { z } from '@hono/zod-openapi'
import { hasAppRight, supabaseAdmin } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'
import { type MiddlewareKeyEnv, middlewareKey } from '../../utils/hono.ts'
import { errorHook } from '../../utils/open_api.ts'
import { getRouteAndSchema } from './docs.ts'

export function getApp(deprecated: boolean) {
  const app = new OpenAPIHono<MiddlewareKeyEnv>({
    defaultHook: errorHook(),
  })

  const { route, requestSchema, validResponseSchema } = getRouteAndSchema(deprecated)

  app.use(route.getRoutingPath(), middlewareKey(['all', 'write', 'read', 'upload']))
  app.openapi(route, async (c: Context) => {
    try {
      const body = c.req.query() as any as z.infer<typeof requestSchema>
      const apikey = c.get('apikey')

      if (!body.app_id || !(await hasAppRight(c, body.app_id, apikey.user_id, 'read'))) {
        console.log('You can\'t access this app', body.app_id)
        return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
      }

      // get one channel or all channels
      if (body.channel) {
        const { data: dataChannel, error: dbError } = await supabaseAdmin(c)
          .from('channels')
          .select(`
            id,
            created_at,
            name,
            app_id,
            created_by,
            updated_at,
            public,
            disable_auto_update_under_native,
            disable_auto_update,
            allow_device_self_set,
            allow_emulator,
            public,
            version (
              name,
              id
            )
          `)
          .eq('app_id', body.app_id)
          .eq('name', body.channel)
          .single()
        if (dbError || !dataChannel) {
          console.log('Cannot find version', dbError)
          return c.json({ status: 'Cannot find version', error: JSON.stringify(dbError) }, 400)
        }

        const newObject = dataChannel as any
        delete Object.assign(newObject, { disableAutoUpdateUnderNative: dataChannel.disable_auto_update_under_native }).disable_auto_update_under_native
        delete Object.assign(newObject, { disableAutoUpdate: dataChannel.disable_auto_update }).disable_auto_update

        return c.json(newObject)
      }
      else {
        const fetchOffset = body.page == null ? 0 : body.page
        const from = fetchOffset * fetchLimit
        const to = (fetchOffset + 1) * fetchLimit - 1
        const { data: dataChannels, error: dbError } = await supabaseAdmin(c)
          .from('channels')
          .select(`
            id,
            created_at,
            name,
            app_id,
            created_by,
            updated_at,
            public,
            disable_auto_update_under_native,
            disable_auto_update,
            allow_device_self_set,
            allow_emulator,
            allow_dev,
            version (
              name,
              id
            )
        `)
          .eq('app_id', body.app_id)
          .range(from, to)
          .order('created_at', { ascending: true })
        if (dbError || !dataChannels) {
          console.log('Cannot find channels', dbError)
          return c.json({ status: 'Cannot find channels', error: JSON.stringify(dbError) }, 400)
        }
        const response = c.json(dataChannels.map((o) => {
          const newObject = o as any
          delete Object.assign(newObject, { disableAutoUpdateUnderNative: o.disable_auto_update_under_native }).disable_auto_update_under_native
          delete Object.assign(newObject, { disableAutoUpdate: o.disable_auto_update }).disable_auto_update
          return newObject
        }))

        const parsedResponse = validResponseSchema.safeParse(response)
        if (!parsedResponse.success) {
          console.error('Database response does not match schema', parsedResponse.error)
          return c.json({ status: 'Database response does not match schema', error: parsedResponse.error }, 500)
        }

        return c.json(parsedResponse, 200)
      }
    }
    catch (e) {
      return c.json({ status: 'Cannot get channel', error: JSON.stringify(e) }, 500)
    }
  })

  return app
}
