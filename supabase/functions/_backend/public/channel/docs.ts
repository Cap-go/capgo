import { createRoute, z } from '@hono/zod-openapi'
import { errorResponse_422, error_500, response_400 } from '../../utils/open_api.ts'
import { fetchLimit } from '../../utils/utils.ts'

export function deleteRouteAndSchema(deprecated: boolean) {
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

export function getRouteAndSchema(deprecated: boolean) {
  const requestSchema = z.object({
    app_id: z.string().openapi({ param: { name: 'app_id', in: 'query', description: 'A unique identifier of the application' } }),
    channel: z.string().nullish().openapi({ param: { name: 'channel', in: 'query', description: 'The channel to get the information from. If not set this endpoint will return a list of channels' } }),
    page: z.number().nullish().openapi({ param: { name: 'page', in: 'query', description: `This endpoint will return only ${fetchLimit} rows. To get more rows please send multiple requests and use this field.` } }),
  }).strict()

  const singleChannelSchema = z.object({
    id: z.number().openapi({
      example: 1234,
      description: 'A unique number identifying a bundle',
    }),
    created_at: z.coerce.date().nullish().openapi({
      example: '2024-08-02 15:08:39.567186+00',
      description: 'A time when the bundle was created',
    }),
    name: z.string().openapi({
      example: 'production',
      description: 'The name of the channel',
    }),
    app_id: z.string().openapi({
      example: 'com.demo.app',
      description: 'A unique identifier of the application that this bundle belongs to',
    }),
    updated_at: z.coerce.date().nullish().openapi({
      example: '2024-08-02 15:08:39.567186+00',
      description: 'A time when the bundle was last updated',
    }),
    public: z.boolean().openapi({
      example: true,
      description: 'Wheater or not the channel can be used to deliver updates to devices without overwrites. If this is set to false the only way to recive an update from this channel is to overwrite a specific device.',
    }),
    // New version: disable_auto_update_under_native
    // disableAutoUpdateUnderNative is deprecated in the DB
    disableAutoUpdateUnderNative: z.boolean().openapi({
      example: true,
      description: 'Wheater or not this channel allows for a update under native. This is defined as having an app with a native build 1.1 trying to update to 1.0 using capgo.',
    }),
    // disableAutoUpdate is deprecated in the database
    // new version: disable_auto_update
    disableAutoUpdate: z.enum(['major', 'minor', 'patch', 'version_number', 'none']).openapi({
      example: 'major',
      description: 'The strategy responsible for disallowing an update. More information: https://capgo.app/docs/tooling/cli/#disable-updates-strategy',
    }),
    allow_device_self_set: z.boolean().openapi({
      description: 'Wheather or not allow devices to assign themselves to this channel. See: https://capgo.app/docs/plugin/channel-system/#channel-options',
      example: true,
    }),
    allow_emulator: z.boolean().openapi({
      description: 'Wheather or not allow emulators to use this channel',
      example: true,
    }),
    created_by: z.string().uuid().nullish().openapi({
      deprecated: true,
      description: 'Deprecated UUID representing the user who created this channel',
    }),
    allow_dev: z.boolean().nullish().openapi({
      description: 'Wheather or not allow development builds to receive updates from this channel',
      example: true,
    }),
    // disabled as per Martin's request
    // enable_ab_testing: z.boolean().openapi({
    //   description: 'Wheather or not A/B testing is enabled on this channel',
    //   example: false,
    // }),
    // enable_progressive_deploy: z.boolean().openapi({
    //   description: 'Wheather or not progressive deploy is enabled on this channel',
    //   example: false,
    // }),
    // secondary_version_percentage: z.number().openapi({
    //   description: 'A number from 0 to 1 representing the % of devices reciving the secondary version. 0.4 represents 40% and so on. Used ONLY if enable_progressive_deploy or enable_ab_testing are on',
    //   minimum: 0,
    //   maximum: 1,
    //   example: 0.5,
    // }),
    // ios: z.boolean().openapi({
    //   description: 'Wheather or not allow ios devices to use this channel',
    //   example: true,
    // }),
    // android: z.boolean().openapi({
    //   description: 'Wheather or not allow ios devices to use this channel',
    //   example: true,
    // }),
    version: z.object({
      name: z.string().openapi({
        example: '1.0.0',
        description: 'A SEMVER compatible version string',
      }),
      id: z.number().openapi({
        example: 1234,
        description: 'A unique number identifying a bundle',
      }),
    }).openapi({
      description: 'A version currently assigned to this channel',
      example: {
        name: '1.0.0',
        id: 9653,
      },
    }),
    // second_version: z.object({
    //   name: z.string().openapi({
    //     example: '1.0.0',
    //     description: 'A SEMVER compatible version string',
    //   }),
    //   id: z.number().openapi({
    //     example: 1234,
    //     description: 'A unique number identifying a bundle',
    //   }),
    // }).nullish().openapi({
    //   description: 'A second version currently assigned to this channel. Used ONLY if enable_progressive_deploy or enable_ab_testing are on',
    //   example: {
    //     name: '1.0.0',
    //     id: 9653,
    //   },
    // }),
  }).strict()

  const validResponseSchema = singleChannelSchema.array().or(singleChannelSchema)

  const route = createRoute({
    method: 'get',
    path: '/',
    summary: 'Get detailed informations for a specific channel or a detailed list of channels',
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
            schema: validResponseSchema,
          },
        },
      },
      422: errorResponse_422(),
      500: error_500('Cannot get channel'),
      400: response_400('Cannot find channel', false),
    },
  })

  return { route, requestSchema, validResponseSchema }
}

export function postRouteAndSchema(deprecated: boolean) {
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
