import { createRoute, z } from '@hono/zod-openapi'
import { errorResponse_422, error_500, response_400 } from '../../utils/open_api.ts'
import { fetchLimit } from '../../utils/utils.ts'

export const deleteRequestSchema = z.object({
  app_id: z.string().openapi({ param: { name: 'app_id', in: 'query', description: 'A unique identifier of the application' } }),
  version: z.string().openapi({ param: { name: 'version', in: 'query', description: 'A SEMVER compatible version string identifying the bundle to delete' } }),
  // page: z.number().nullish().openapi({ param: { name: 'page', in: 'query' } }),
})

export const deleteRoute = createRoute({
  method: 'delete',
  path: '/',
  summary: 'Delete a specifc bundle from capgo cloud',
  security: [
    {
      apikey: [],
    },
  ],
  request: {
    query: deleteRequestSchema,
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

// -----------------------------------------------------------------

export const getRequestSchema = z.object({
  app_id: z.string().openapi({ param: { name: 'app_id', in: 'query', description: 'A unique identifier of the application' } }),
  // version: z.string().optional().openapi({ param: { name: 'version', in: 'query' } }),
  page: z.number().nullish().openapi({ param: { name: 'page', in: 'query', description: `This endpoint will return only ${fetchLimit} rows. To get more rows please send multiple requests and use this field.` } }),
})

export const getValidResponseSchema = z.object({
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

export const getRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'Get a detailed bundle informations for bundles that have not been deleted',
  security: [
    {
      apikey: [],
    },
  ],
  request: {
    query: getRequestSchema,
  },
  responses: {
    200: {
      description: 'Returns a bundle (version) from supabase',
      content: {
        'application/json': {
          schema: getValidResponseSchema,
        },
      },
    },
    500: error_500('Cannot get bundle'),
    400: response_400('Cannot get bundle'),
    422: errorResponse_422(),
  },
})
