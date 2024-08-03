import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { hasAppRight, supabaseAdmin } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'
import type { Database } from '../../utils/supabase.types.ts'
import type { MiddlewareKeyEnv } from '../../utils/hono.ts'
import { BRES, middlewareKey } from '../../utils/hono.ts'
import { errorHook, errorResponse_422, error_500, response_400 } from '../../utils/open_api.ts'

export const app = new OpenAPIHono<MiddlewareKeyEnv>({
  defaultHook: errorHook(),
})

const requestSchema = z.object({
  app_id: z.string().openapi({ param: { name: 'app_id', in: 'query', description: 'A unique identifier of the application' } }),
  // version: z.string().optional().openapi({ param: { name: 'version', in: 'query' } }),
  page: z.number().nullish().openapi({ param: { name: 'page', in: 'query', description: `This endpoint will return only ${fetchLimit} rows. To get more rows please send multiple requests and use this field.` } }),
})

const validResponseSchema = z.object({
  id: z.number().openapi({
    example: 1234,
    description: 'A unique number identifying a bundle',
  }),
  created_at: z.coerce.date().nullish().openapi({
    example: '2024-08-02 15:08:39.567186+00',
    description: 'A time when the bundle was created',
  }),
  app_id: z.string().openapi({
    example: 'com.demo.app',
    description: 'A unique identifier of the application that this bundle belongs to',
  }),
  name: z.string().openapi({
    example: '1.0.0',
    description: 'A SEMVER compatible version string',
  }),
  updated_at: z.coerce.date().nullish().openapi({
    example: '2024-08-02 15:08:39.567186+00',
    description: 'A time when the bundle was last updated',
  }),
  external_url: z.string().nullish().openapi({
    example: 'https://example.com',
    description: 'An optional link to an external CDN. If not null then It\'s used to download the bundle',
  }),
  checksum: z.string().nullish().openapi({
    example: `3885ee49`,
    description: 'A hexadecimal CRC32 hash of the bundle file',
  }),
  session_key: z.string().nullish().openapi({
    description: 'Data used for decrypting the bundle on the client. It contains IV as well as an encoded AES key. Please refer to the encryption documentation for more information.',
  }),
  storage_provider: z.enum(['r2', 'r2-direct', 'supabase', 'external']).openapi({
    example: 'r2',
    description: 'An enum representing where the bundle is stored. The "supabase" variant is deprecated and obsolete',
  }),
  min_update_version: z.string().nullish().openapi({
    example: '1.0.0',
    description: 'A SEMVER compatible string representing a minimal version required for an update bo be allowed to update to this bundle. Used only when channel disable auto update strategy "metadata" is used.',
  }),
}).array()

const route = createRoute({
  method: 'get',
  path: '/',
  summary: 'Get a detailed bundle informations for bundles that have not been deleted',
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
      description: 'Returns a bundle (version) from supabase',
      content: {
        'application/json': {
          schema: validResponseSchema,
        },
      },
    },
    500: error_500('Cannot get bundle'),
    400: response_400('Cannot get bundle'),
    422: errorResponse_422(),
  },
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
