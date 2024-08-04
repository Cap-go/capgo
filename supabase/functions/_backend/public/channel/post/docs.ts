import { createRoute, z } from '@hono/zod-openapi'
import { errorResponse_422, error_500, response_400 } from '../../../utils/open_api.ts'

export function getRouteAndSchema(deprecated: boolean) {
  const requestSchema = z.object({
    app_id: z.string().openapi({ description: 'A unique identifier of the application', example: 'com.demo.app' }),
    channel: z.string().openapi({ description: 'The channel to get the information from. If not set this endpoint will return a list of channels', example: 'production' }),
    version: z.string().nullish().openapi({ description: 'A SEMVER compatible version string', example: '1.0.0' }),
    public: z.boolean().nullish().openapi({ example: true, description: 'Wheater or not the channel can be used to deliver updates to devices without overwrites. If this is set to false the only way to recive an update from this channel is to overwrite a specific device.' }),
    disableAutoUpdateUnderNative: z.boolean().openapi({
      example: true,
      description: 'Wheater or not this channel allows for a update under native. This is defined as having an app with a native build 1.1 trying to update to 1.0 using capgo.',
    }),
    // disableAutoUpdate is deprecated in the database
    // new version: disable_auto_update
    disableAutoUpdate: z.enum(['major', 'minor', 'patch', 'version_number', 'none']).nullish().openapi({
      example: 'major',
      description: 'The strategy responsible for disallowing an update. More information: https://capgo.app/docs/tooling/cli/#disable-updates-strategy',
    }),
    ios: z.boolean().nullish().openapi({
      description: 'Wheather or not allow ios devices to use this channel',
      example: true,
    }),
    android: z.boolean().nullish().openapi({
      description: 'Wheather or not allow ios devices to use this channel',
      example: true,
    }),
    allow_device_self_set: z.boolean().nullish().openapi({
      description: 'Wheather or not allow devices to assign themselves to this channel. See: https://capgo.app/docs/plugin/channel-system/#channel-options',
      example: true,
    }),
    allow_emulator: z.boolean().nullish().openapi({
      description: 'Wheather or not allow emulators to use this channel',
      example: true,
    }),
    allow_dev: z.boolean().nullish().openapi({
      description: 'Wheather or not allow development builds to receive updates from this channel',
      example: true,
    }),
  }).strict()

  const route = createRoute({
    method: 'post',
    path: '/',
    summary: 'Update a channel with the information provided in this request',
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
      400: response_400('Cannot find channel'),
    },
  })

  return { route, requestSchema }
}
