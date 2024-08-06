import type { Context } from '@hono/hono'
import type { z } from '@hono/zod-openapi'
import { OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareKeyEnv } from '../../utils/hono.ts'
import { BRES, middlewareKey } from '../../utils/hono.ts'
import { errorHook } from '../../utils/open_api.ts'
import { hasAppRight, supabaseAdmin } from '../../utils/supabase.ts'
import type { deleteRequestSchema } from './docs.ts'
import { deleteRoute } from './docs.ts'

export const deleteApp = new OpenAPIHono<MiddlewareKeyEnv>({
  defaultHook: errorHook(),
})

deleteApp.use(deleteRoute.getRoutingPath(), middlewareKey(['all', 'write']))
deleteApp.openapi(deleteRoute, async (c: Context) => {
  const body = c.req.query() as any as z.infer<typeof deleteRequestSchema>
  const apikey = c.get('apikey')

  if (!body.app_id)
    return c.json({ status: 'Missing app_id' }, 400)

  if (!(await hasAppRight(c, body.app_id, apikey.user_id, 'write')))
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  try {
    if (body.version) {
      const { data, error: dbError } = await supabaseAdmin(c)
        .from('app_versions')
        .update({
          deleted: true,
        })
        .eq('app_id', body.app_id)
        .eq('name', body.version)
        .select()
        .single()
      if (dbError || !data)
        return c.json({ status: 'Cannot delete version', error: JSON.stringify(dbError) }, 400)
    }
    else {
      const { error: dbError } = await supabaseAdmin(c)
        .from('app_versions')
        .update({
          deleted: true,
        })
        .eq('app_id', body.app_id)
      if (dbError)
        return c.json({ status: 'Cannot delete all version', error: JSON.stringify(dbError) }, 400)
    }
  }
  catch (e) {
    return c.json({ status: 'Cannot delete version', error: JSON.stringify(e) }, 500)
  }
  return c.json(BRES, 200)
})
