import { createRoute, z } from '@hono/zod-openapi'
import { errorResponse_422, error_500, response_400 } from '../../../utils/open_api.ts'

export function getRouteAndSchema(deprecated: boolean) {
  const requestSchema = z.object({
    app_id: z.string().openapi({ param: { name: 'app_id', in: 'query', description: 'A unique identifier of the application' } }),
    device_id: z.string().uuid().openapi({ param: { name: 'device_id', in: 'query', description: 'A unique identifier for a device' } }),
  }).strict()

  const route = createRoute({
    method: 'delete',
    path: '/',
    summary: 'Delete every device overwrite for a specific device. It does not delete the device from capgo cloud. You cannot delete a device from capgo cloud',
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
      400: response_400('Cannot find channel'),
    },
  })

  return { route, requestSchema }
}
