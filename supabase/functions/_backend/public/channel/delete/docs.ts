import { createRoute, z } from '@hono/zod-openapi'
import { errorResponse_422, error_500, response_400 } from '../../../utils/open_api.ts'
import { fetchLimit } from '../../../utils/utils.ts'

export function getRouteAndSchema(deprecated: boolean) {
  const requestSchema = z.object({
    app_id: z.string().openapi({ param: { name: 'app_id', in: 'query', description: 'A unique identifier of the application' } }),
    channel: z.string().openapi({ param: { name: 'channel', in: 'query', description: 'The channel to get the information from. If not set this endpoint will return a list of channels' } }),
  }).strict()

  const route = createRoute({
    method: 'delete',
    path: '/',
    summary: 'Delete a specific channel',
    deprecated,
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
            schema: z.object({
              status: z.string().openapi({
                description: 'A stauts of the request',
                example: 'ok',
              }),
            }),
          },
        },
      },
      422: errorResponse_422(),
      500: error_500('Cannot delete channel'),
      400: response_400('Cannot find channel', true),
    },
  })

  return { route, requestSchema }
}
