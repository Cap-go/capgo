import type { Context } from '@hono/hono'
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { hasAppRight, supabaseAdmin } from '../../utils/supabase.ts'
import type { MiddlewareKeyEnv } from '../../utils/hono.ts'
import { BRES, middlewareKey } from '../../utils/hono.ts'
import { errorHook, errorResponse_422, error_500, response_400 } from '../../utils/open_api.ts'

export const app = new OpenAPIHono<MiddlewareKeyEnv>({
  defaultHook: errorHook(),
})

const requestSchema = z.object({
  app_id: z.string().openapi({ param: { name: 'app_id', in: 'query', description: 'A unique identifier of the application' } }),
  version: z.string().openapi({ param: { name: 'version', in: 'query', description: 'A SEMVER compatible version string identifying the bundle to delete' } }),
  // page: z.number().nullish().openapi({ param: { name: 'page', in: 'query' } }),
})

const route = createRoute({
  method: 'delete',
  path: '/',
  summary: 'Delete a specifc bundle from capgo cloud',
  security: [
    {
      apikey: [],
    },
  ],
  request: {
    query: requestSchema,
  },
  responses: {
    200: {
      description: 'Returns a successfull deletion',
      content: {
        'application/json': {
          schema: z.object({
            status: z.string().openapi({
              description: 'A stauts of the request',
              example: 'ok',
            }),
          }),
        },
      },
    },
    500: error_500('Cannot delete version'),
    400: response_400('Cannot delete version'),
    422: errorResponse_422(),
  },
})

app.use(route.getRoutingPath(), middlewareKey(['all', 'write']))
app.openapi(route, async (c: Context) => {
  const body = c.req.query() as any as z.infer<typeof requestSchema>
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
