import { createRoute, z } from '@hono/zod-openapi'
import { errorResponse_422, error_500, response_400 } from '../../../utils/open_api.ts'

export const requestSchema = z.object({
  app_id: z.string().openapi({ param: { name: 'app_id', in: 'query', description: 'A unique identifier of the application' } }),
  version: z.string().openapi({ param: { name: 'version', in: 'query', description: 'A SEMVER compatible version string identifying the bundle to delete' } }),
  // page: z.number().nullish().openapi({ param: { name: 'page', in: 'query' } }),
})

export const route = createRoute({
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
