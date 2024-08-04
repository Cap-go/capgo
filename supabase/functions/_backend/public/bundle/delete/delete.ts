import type { Context } from '@hono/hono'
import type { z } from '@hono/zod-openapi'
import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { hasAppRight, supabaseAdmin } from '../../../utils/supabase.ts'
import type { MiddlewareKeyEnv } from '../../../utils/hono.ts'
import { BRES, middlewareKey } from '../../../utils/hono.ts'
import { errorHook, errorResponse_422, error_500, response_400 } from '../../../utils/open_api.ts'
import type { requestSchema } from './docs.ts'
import { route } from './docs.ts'

export const app = new OpenAPIHono<MiddlewareKeyEnv>({
  defaultHook: errorHook(),
})

app.use(route.getRoutingPath(), middlewareKey(['all', 'write']))
app.openapi(route, async (c: Context) => {
  const body = c.req.query() as any as z.infer<typeof requestSchema>
  const apikey = c.get('apikey')

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
