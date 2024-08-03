import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { hasAppRight, supabaseAdmin } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'
import type { Database } from '../../utils/supabase.types.ts'
import type { MiddlewareKeyEnv } from '../../utils/hono.ts'
import { BRES, middlewareKey } from '../../utils/hono.ts'
import { errorHook, errorResponse_422, error_500, response_400 } from '../../utils/open_api.ts'

export function getApp(deprecated: boolean) {
  const app = new OpenAPIHono<MiddlewareKeyEnv>({
    defaultHook: errorHook(),
  })

  const requestSchema = z.object({
    app_id: z.string().openapi({ param: { name: 'app_id', in: 'query', description: 'A unique identifier of the application' } }),
    channel: z.string().optional().openapi({ param: { name: 'channel', in: 'query', description: 'The channel to get the information from. If not set this endpoint will return a list of channels' } }),
    page: z.number().nullish().openapi({ param: { name: 'page', in: 'query', description: `This endpoint will return only ${fetchLimit} rows. To get more rows please send multiple requests and use this field.` } }),
  })

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
    disable_auto_update_under_native: z.boolean().openapi({
      example: true,
      description: 'Wheater or not this channel allows for a update under native. This is defined as having an app with a native build 1.1 trying to update to 1.0 using capgo.',
    }),
    disable_auto_update: z.enum(['major', 'minor', 'patch', 'version_number', 'none']).openapi({
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
    enable_ab_testing: z.boolean().openapi({
      description: 'Wheather or not A/B testing is enabled on this channel',
      example: false,
    }),
    enable_progressive_deploy: z.boolean().openapi({
      description: 'Wheather or not progressive deploy is enabled on this channel',
      example: false,
    }),
    secondary_version_percentage: z.number().openapi({
      description: 'A number from 0 to 1 representing the % of devices reciving the secondary version. 0.4 represents 40% and so on. Used ONLY if enable_progressive_deploy or enable_ab_testing are on',
      minimum: 0,
      maximum: 1,
      example: 0.5,
    }),
    ios: z.boolean().openapi({
      description: 'Wheather or not allow ios devices to use this channel',
      example: true,
    }),
    android: z.boolean().openapi({
      description: 'Wheather or not allow ios devices to use this channel',
      example: true,
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
    second_version: z.object({
      name: z.string().openapi({
        example: '1.0.0',
        description: 'A SEMVER compatible version string',
      }),
      id: z.number().openapi({
        example: 1234,
        description: 'A unique number identifying a bundle',
      }),
    }).nullish().openapi({
      description: 'A second version currently assigned to this channel. Used ONLY if enable_progressive_deploy or enable_ab_testing are on',
      example: {
        name: '1.0.0',
        id: 9653,
      },
    }),
  })

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
      400: response_400('Cannot find channel'),
    },
  })

  app.use(route.getRoutingPath(), middlewareKey(['all', 'write', 'read', 'upload']))
  app.openapi(route, async (c: Context) => {
    const body = c.req.query() as any as z.infer<typeof requestSchema>
    const apikey = c.get('apikey')

    try {
      if (!body.app_id || !(await hasAppRight(c, body.app_id, apikey.user_id, 'read'))) {
        console.log('You can\'t access this app', body.app_id)
        return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
      }

      // get one channel or all channels
      if (body.channel) {
        const { data: dataChannel, error: dbError } = await supabaseAdmin(c)
          .from('channels')
          .select(`
            id,
            created_at,
            name,
            app_id,
            updated_at,
            public,
            disable_auto_update_under_native,
            disable_auto_update,
            allow_device_self_set,
            allow_emulator,
            enable_ab_testing,
            secondary_version_percentage,
            enable_progressive_deploy,
            ios,
            android,
            version (
              name,
              id
            ),
            second_version (
              name,
              id
            )
          `)
          .eq('app_id', body.app_id)
          .eq('name', body.channel)
          .single()
        if (dbError || !dataChannel) {
          console.log('Cannot find version', dbError)
          return c.json({ status: 'Cannot find channel', error: JSON.stringify(dbError) }, 400)
        }

        const parsedResponse = singleChannelSchema.safeParse(dataChannel)
        if (!parsedResponse.success) {
          console.error('Database response does not match schema', parsedResponse.error)
          return c.json({ status: 'Database response does not match schema', error: parsedResponse.error }, 500)
        }

        return c.json(parsedResponse.data, 200)
      }
      else {
        const fetchOffset = body.page == null ? 0 : body.page
        const from = fetchOffset * fetchLimit
        const to = (fetchOffset + 1) * fetchLimit - 1
        const { data: dataChannels, error: dbError } = await supabaseAdmin(c)
          .from('channels')
          .select(`
          id,
          created_at,
          name,
          app_id,
          updated_at,
          public,
          disable_auto_update_under_native,
          disable_auto_update,
          allow_device_self_set,
          allow_emulator,
          enable_ab_testing,
          secondary_version_percentage,
          enable_progressive_deploy,
          ios,
          android,
          version (
            name,
            id
          ),
          second_version (
            name,
            id
          )
        `)
          .eq('app_id', body.app_id)
          .range(from, to)
          .order('created_at', { ascending: true })
        if (dbError || !dataChannels) {
          console.log('Cannot find channels', dbError)
          return c.json({ status: 'Cannot find channels', error: JSON.stringify(dbError) }, 400)
        }
        const parsedResponse = singleChannelSchema.safeParse(dataChannel)
        if (!parsedResponse.success) {
          console.error('Database response does not match schema', parsedResponse.error)
          return c.json({ status: 'Database response does not match schema', error: parsedResponse.error }, 500)
        }

        return c.json(parsedResponse.data, 200)
      }
    }
    catch (e) {
      return c.json({ status: 'Cannot get channel', error: JSON.stringify(e) }, 500)
    }
  })

  return app
}
