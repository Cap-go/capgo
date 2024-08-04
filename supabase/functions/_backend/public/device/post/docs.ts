import { createRoute, z } from '@hono/zod-openapi'
import { errorResponse_422, error_500, plainError, response_400 } from '../../../utils/open_api.ts'

export function getRouteAndSchema(deprecated: boolean) {
  const requestSchema = z.object({
    app_id: z.string().openapi({ description: 'A unique identifier of the application', example: 'com.demo.app' }),
    device_id: z.string().uuid().openapi({ param: { name: 'device_id', in: 'query', description: 'A unique identifier for a device' } }),
    channel: z.string().nullish().openapi({ description: 'The channel to use for this device overwrite', example: 'production' }),
    version_id: z.string().nullish().openapi({ description: 'A SEMVER compatible version string to use for this device overwrite', example: '1.0.0' }),
  }).strict()

  const route = createRoute({
    method: 'post',
    path: '/',
    summary: 'Update the device overwrites for a specific device',
    deprecated,
    security: [
      {
        apikey: [],
      },
    ],
    request: {
      body: {
        content: {
          'application/json': {
            schema: requestSchema,
          },
        },
      },
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
      500: error_500('Cannot update channel'),
      400: {
        description: 'Returns a problem with the request',
        content: {
          'application/json': {
            schema: z.object({
              status: z.string().openapi({
                example: 'Cannot save channel override',
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
            ).or(
              z.object({
                status: z.string().openapi({
                  description: 'Cannot set channel override for public channel',
                  example: 'ok',
                }),
              }),
            ),
          },
          'text/plain': plainError(),
        },
      },
    },
  })

  return { route, requestSchema }
}
