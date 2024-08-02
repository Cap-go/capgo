import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { hasAppRight, supabaseAdmin } from '../utils/supabase.ts'
import { fetchLimit } from '../utils/utils.ts'
import type { Database } from '../utils/supabase.types.ts'
import type { MiddlewareKeyEnv } from '../utils/hono.ts'
import { BRES, getBody, middlewareKey } from '../utils/hono.ts'

interface GetLatest {
  app_id?: string
  version?: string
  page?: number
}

async function deleteBundle(c: Context, body: GetLatest, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
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
  return c.json(BRES)
}

async function get(c: Context, body: GetLatest, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {

}

export const app = new OpenAPIHono<MiddlewareKeyEnv>()

app.openAPIRegistry.registerComponent('securitySchemes', 'apikey', {
  type: 'apiKey',
  in: 'header',
  name: 'authorization',
})

const getBundleQuerySchema = z.object({
  app_id: z.string().openapi({ param: { name: 'app_id', in: 'query' } }),
  // version: z.string().optional().openapi({ param: { name: 'version', in: 'query' } }),
  page: z.number().optional().openapi({ param: { name: 'page', in: 'query' } }),
})

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
    query: getBundleQuerySchema,
  },
  responses: {
    200: {
      description: 'Returns a bundle (version) from supabase',
      content: {
        'application/json': {
          schema: z.object({
            id: z.number().openapi({
              example: 1234,
              description: 'A unique number identifying a bundle',
            }),
            created_at: z.date().optional().openapi({
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
            updated_at: z.date().optional().openapi({
              example: '2024-08-02 15:08:39.567186+00',
              description: 'A time when the bundle was last updated',
            }),
            external_url: z.string().optional().openapi({
              example: 'https://example.com',
              description: 'An optional link to an external CDN. If not null then It\'s used to download the bundle',
            }),
            checksum: z.string().optional().openapi({
              example: `3885ee49`,
              description: 'A hexadecimal CRC32 hash of the bundle file',
            }),
            session_key: z.string().optional().openapi({
              description: 'Data used for decrypting the bundle on the client. It contains IV as well as an encoded AES key. Please refer to the encryption documentation for more information.',
            }),
            storage_provider: z.enum(['r2', 'r2-direct', 'supabase', 'external', '\'r2\'::text']).openapi({
              example: 'r2',
              description: 'An enum representing where the bundle is stored. Both "supabase" and "\'r2\'::text" are deprecated and obsolete',
            }),
            min_update_version: z.string().optional().openapi({
              example: '1.0.0',
              description: 'A SEMVER compatible string representing a minimal version required for an update bo be allowed to update to this bundle. Used only when channel disable auto update strategy "metadata" is used.',
            }),
          }).array(),
        },
      },
    },
    500: {
      description: 'Returns an internal error',
      content: {
        'application/json': {
          schema: z.object({
            status: z.string().openapi({
              example: 'Cannot get bundle',
              description: 'A short description explaining the error',
            }),
            error: z.any().optional().openapi({
              description: 'A detailed fail information',
            }),
          }),
        },
      },
    },
    400: {
      description: 'Returns an internal error',
      content: {
        'application/json': {
          schema: z.object({
            status: z.string().openapi({
              example: 'Cannot get bundle',
              description: 'A short description explaining the error',
            }),
            error: z.any().optional().openapi({
              description: 'A detailed fail information',
            }),
          }).or(
            z.object({
              status: z.string().openapi({
                example: 'You can\'t access this app',
                description: 'A short description explaining the error',
              }),
              app_id: z.string(),
            }),
          ),
        },
      },
    },
  },
})

app.use(route.getRoutingPath(), middlewareKey(['all', 'write']))
app.openapi(route, async (c: Context) => {
  try {
    const body = c.req.query() as any as z.infer<typeof getBundleQuerySchema>
    const apikey = c.get('apikey')
    // return get(c, body, apikey)

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
      return c.json({ status: 'Cannot get bundle', error: dbError }, 500)

    return c.json(dataBundles, 200)
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
