import { createRoute, z } from '@hono/zod-openapi'
import { fetchLimit } from '../../../utils/utils.ts'
import { errorResponse_422, error_500, response_400 } from '../../../utils/open_api.ts'

export const requestSchema = z.object({
  app_id: z.string().openapi({ param: { name: 'app_id', in: 'query', description: 'A unique identifier of the application' } }),
  // version: z.string().optional().openapi({ param: { name: 'version', in: 'query' } }),
  page: z.number().nullish().openapi({ param: { name: 'page', in: 'query', description: `This endpoint will return only ${fetchLimit} rows. To get more rows please send multiple requests and use this field.` } }),
})

export const validResponseSchema = z.object({
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

export const route = createRoute({
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
