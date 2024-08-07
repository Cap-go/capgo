import { createRoute, z } from '@hono/zod-openapi'
import { errorResponse_422, error_500, response_400 } from '../../utils/open_api.ts'
import { fetchLimit } from '../../utils/utils.ts'

export const getRequestSchema = z.object({
  app_id: z.string().openapi({ param: { name: 'app_id', in: 'query', description: 'A unique identifier of the application' } }),
  device_id: z.string().uuid().nullish().openapi({ param: { name: 'device_id', in: 'query', description: 'A unique identifier for a device' } }),
  page: z.number().nullish().openapi({ param: { name: 'page', in: 'query', description: `This endpoint will return only ${fetchLimit} rows. To get more rows please send multiple requests and use this field.` } }),
}).strict()

export const getSingleDeviceSchema = z.object({
  created_at: z.coerce.date().nullish().openapi({
    example: '2024-08-02 15:08:39.567186+00',
    description: 'A time when the bundle was created',
  }),
  updated_at: z.coerce.date().nullish().openapi({
    example: '2024-08-02 15:08:39.567186+00',
    description: 'A time when the bundle was last updated',
  }),
  device_id: z.string().uuid().openapi({
    description: 'A unique identifier for a device',
  }),
  custom_id: z.string().openapi({
    description: 'A custom ID identifying a given device',
  }),
  app_id: z.string().openapi({
    example: 'com.demo.app',
    description: 'A unique identifier of the application that this bundle belongs to',
  }),
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
  platform: z.enum(['ios', 'android']).nullish().openapi({
    description: 'An enum for the platform of the device',
    example: 'ios',
  }),
  plugin_version: z.string().openapi({
    description: 'A version of the capacitor updator plugin',
    example: '6.0.8',
  }),
  os_version: z.string().nullish().openapi({
    description: 'A string identifying a OS version of the given device',
  }),
  version_build: z.string().openapi({
    description: 'A string identifying the native build of the application. It does not change after a capgo update and it is set in android -> app -> build.gradle -> android -> default config -> versionName and in ios/App/App.xcodeproj/project.pbxproj -> buildSettings -> MARKETING_VERSION',
  }),
  is_prod: z.coerce.boolean().openapi({
    description: 'It identyfies if a given device is running a production build',
  }),
  is_emulator: z.coerce.boolean().openapi({
    description: 'It identyfies if a given device is an emulator',
  }),
}).strict()

export const getValidResponseSchema = getRequestSchema.array().or(getRequestSchema)

export const getRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'Get detailed informations for a specific channel or a detailed list of channels',
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
    422: errorResponse_422(),
    500: error_500('Cannot get device'),
    400: response_400('Cannot find device'),
  },
})

// --------------

export const postRequestSchema = z.object({
  app_id: z.string().openapi({ description: 'A unique identifier of the application', example: 'com.demo.app' }),
  device_id: z.string().uuid().openapi({ param: { name: 'device_id', in: 'query', description: 'A unique identifier for a device' } }),
  channel: z.string().nullish().openapi({ description: 'The channel to use for this device overwrite', example: 'production' }),
  version_id: z.string().nullish().openapi({ description: 'A SEMVER compatible version string to use for this device overwrite', example: '1.0.0' }),
}).strict()

export const postRoute = createRoute({
  method: 'post',
  path: '/',
  summary: 'Update the device overwrites for a specific device',
  security: [
    {
      apikey: [],
    },
  ],
  request: {
    body: {
      content: {
        'application/json': {
          schema: postRequestSchema,
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
    500: error_500('Uncaught error'),
    400: response_400('Cannot save device override', true),
  },
})

// -------------------

export const deleteRequestSchema = z.object({
  app_id: z.string().openapi({ param: { name: 'app_id', in: 'query', description: 'A unique identifier of the application' } }),
  device_id: z.string().uuid().openapi({ param: { name: 'device_id', in: 'query', description: 'A unique identifier for a device' } }),
}).strict()

export const deleteRoute = createRoute({
  method: 'delete',
  path: '/',
  summary: 'Delete every device overwrite for a specific device. It does not delete the device from capgo cloud. You cannot delete a device from capgo cloud',
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
