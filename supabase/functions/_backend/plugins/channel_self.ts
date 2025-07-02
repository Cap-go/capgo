// channel self old function
import type { Context } from 'hono'
import type { DeviceWithoutCreatedAt } from '../utils/stats.ts'
import type { Database } from '../utils/supabase.types.ts'
import type { AppInfos } from '../utils/types.ts'
import { format, tryParse } from '@std/semver'
import { honoFactory } from '../utils/hono.ts'
import { z } from 'zod'
import { BRES, getBody } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/loggin.ts'
import { sendStatsAndDevice } from '../utils/stats.ts'
import { isAllowedActionOrg, supabaseAdmin } from '../utils/supabase.ts'
import { deviceIdRegex, fixSemver, INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, MISSING_STRING_APP_ID, MISSING_STRING_DEVICE_ID, MISSING_STRING_VERSION_BUILD, MISSING_STRING_VERSION_NAME, NON_STRING_APP_ID, NON_STRING_DEVICE_ID, NON_STRING_VERSION_BUILD, NON_STRING_VERSION_NAME, reverseDomainRegex } from '../utils/utils.ts'

interface DeviceLink extends AppInfos {
  channel?: string
}

const devicePlatformScheme = z.union([z.literal('ios'), z.literal('android')])

export const jsonRequestSchema = z.object({
  app_id: z.string({
    required_error: MISSING_STRING_APP_ID,
    invalid_type_error: NON_STRING_APP_ID,
  }),
  device_id: z.string({
    required_error: MISSING_STRING_DEVICE_ID,
    invalid_type_error: NON_STRING_DEVICE_ID,
  }).max(36),
  version_name: z.string({
    required_error: MISSING_STRING_VERSION_NAME,
    invalid_type_error: NON_STRING_VERSION_NAME,
  }),
  version_build: z.string({
    required_error: MISSING_STRING_VERSION_BUILD,
    invalid_type_error: NON_STRING_VERSION_BUILD,
  }),
  is_emulator: z.boolean().default(false),
  defaultChannel: z.optional(z.string()),
  is_prod: z.boolean().default(true),
  platform: devicePlatformScheme,
}).passthrough().refine(data => reverseDomainRegex.test(data.app_id), {
  message: INVALID_STRING_APP_ID,
}).refine(data => deviceIdRegex.test(data.device_id), {
  message: INVALID_STRING_DEVICE_ID,
}).transform((val) => {
  if (val.version_name === 'builtin')
    val.version_name = val.version_build

  return val
})

export const listChannelsQuerySchema = z.object({
  app_id: z.string({
    required_error: MISSING_STRING_APP_ID,
    invalid_type_error: NON_STRING_APP_ID,
  }).refine(data => reverseDomainRegex.test(data), {
    message: INVALID_STRING_APP_ID,
  }),
  platform: devicePlatformScheme,
  is_emulator: z.boolean().default(false),
  is_prod: z.boolean().default(true),
})

async function post(c: Context, body: DeviceLink): Promise<Response> {
  cloudlog({ requestId: c.get('requestId'), message: 'post channel self body', body })
  let {
    version_name,
    version_build,
  } = body
  const {
    platform,
    app_id,
    channel,
    version_os,
    device_id,
    plugin_version,
    custom_id,
    is_emulator = false,
    is_prod = true,
  } = body
  const coerce = tryParse(fixSemver(version_build))
  if (!coerce) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', version_build })
    return c.json({
      message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number`,
      error: 'semver_error',
    }, 400)
  }
  version_build = format(coerce)
  version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name

  const { data: versions } = await supabaseAdmin(c)
    .from('app_versions')
    .select('id, owner_org, name')
    .eq('app_id', app_id)
    .or(`name.eq.${version_name},name.eq.builtin`)
    .limit(2)

  if (!versions || versions.length === 0) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', version_name, body })
    return c.json({
      message: `Version ${version_name} doesn't exist, and no builtin version`,
      error: 'version_error',
    }, 400)
  }
  const owner_org = versions[0].owner_org

  const version = versions.length === 2
    ? versions.find(v => v.name !== 'builtin')
    : versions[0]
  if (!version) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', versions })
    return c.json({
      message: `Version ${version_name} doesn't exist, and no builtin version`,
      error: 'version_error',
    }, 400)
  }

  if (!(await isAllowedActionOrg(c, owner_org))) {
    return c.json({
      message: 'Action not allowed',
      error: 'action_not_allowed',
    }, 200)
  }
  // find device

  const device: DeviceWithoutCreatedAt = {
    app_id,
    device_id,
    plugin_version,
    version: version.id,
    custom_id,
    is_emulator,
    is_prod,
    version_build,
    os_version: version_os,
    platform: platform as Database['public']['Enums']['platform_os'],
    updated_at: new Date().toISOString(),
  }

  const { data: dataChannelOverride } = await supabaseAdmin(c)
    .from('channel_devices')
    .select(`
    app_id,
    device_id,
    channel_id (
      id,
      allow_device_self_set,
      name
    )
  `)
    .eq('app_id', app_id)
    .eq('device_id', device_id.toLowerCase())
    .single()
  if (!channel || (dataChannelOverride && !(dataChannelOverride?.channel_id as any as Database['public']['Tables']['channels']['Row']).allow_device_self_set)) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot change device override current channel don\t allow it', channel, dataChannelOverride })
    return c.json({
      message: 'Cannot change device override current channel don\t allow it',
      error: 'cannot_override',
    }, 400)
  }
  if (!channel) {
    await sendStatsAndDevice(c, device, [{ action: 'setChannel' }])
    return c.json(BRES)
  }
  // if channel set channel_override to it
  // get channel by name
  const { data: dataChannel, error: dbError } = await supabaseAdmin(c)
    .from('channels')
    .select('*')
    .eq('app_id', app_id)
    .eq('name', channel)
    .single()
  if (dbError || !dataChannel) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot find channel', channel, app_id })
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find channel', dbError, dataChannel })
    return c.json({
      message: `Cannot find channel ${JSON.stringify(dbError)}`,
      error: 'channel_not_found',
    }, 400)
  }

  if (!dataChannel.allow_device_self_set) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Channel does not permit self set', dbError, dataChannel })
    return c.json({
      message: `This channel does not allow devices to self associate ${JSON.stringify(dbError)}`,
      error: 'channel_set_from_plugin_not_allowed',
    }, 400)
  }

  // Get the main channel
  const { data: mainChannel, error: dbMainChannelError } = await supabaseAdmin(c)
    .from('channels')
    .select(`
        name, 
        ios, 
        android
      `)
    .eq('app_id', app_id)
    .eq('public', true)

  // We DO NOT return if there is no main channel as it's not a critical error
  // We will just set the channel_devices as the user requested
  let mainChannelName = null as string | null
  if (!dbMainChannelError) {
    const devicePlatform = body.platform as Database['public']['Enums']['platform_os']
    const finalChannel = mainChannel.find(channel => channel[devicePlatform] === true)
    mainChannelName = (finalChannel !== undefined) ? finalChannel.name : null
  }

  // const mainChannelName = (!dbMainChannelError && mainChannel) ? mainChannel.name : null
  if (dbMainChannelError || !mainChannel)
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find main channel', dbMainChannelError })

  const channelId = dataChannelOverride?.channel_id as any as Database['public']['Tables']['channels']['Row']
  if (mainChannelName && mainChannelName === channel) {
    const { error: dbErrorDev } = await supabaseAdmin(c)
      .from('channel_devices')
      .delete()
      .eq('app_id', app_id)
      .eq('device_id', device_id.toLowerCase())
    if (dbErrorDev) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot do channel override', dbErrorDev })
      return c.json({
        message: `Cannot remove channel override ${JSON.stringify(dbErrorDev)}`,
        error: 'override_not_allowed',
      }, 400)
    }
    cloudlog({ requestId: c.get('requestId'), message: 'main channel set, removing override' })
    await sendStatsAndDevice(c, device, [{ action: 'setChannel' }])
    return c.json(BRES)
  }
  // if dataChannelOverride is same from dataChannel and exist then do nothing
  if (channelId && channelId.id === dataChannel.id) {
    // already set
    cloudlog({ requestId: c.get('requestId'), message: 'channel already set' })
    return c.json(BRES)
  }

  cloudlog({ requestId: c.get('requestId'), message: 'setting channel' })
  if (dataChannelOverride) {
    const { error: dbErrorDev } = await supabaseAdmin(c)
      .from('channel_devices')
      .delete()
      .eq('app_id', app_id)
      .eq('device_id', device_id.toLowerCase())
    if (dbErrorDev) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot do channel override', dbErrorDev })
      return c.json({
        message: `Cannot remove channel override ${JSON.stringify(dbErrorDev)}`,
        error: 'override_not_allowed',
      }, 400)
    }
  }
  const { error: dbErrorDev } = await supabaseAdmin(c)
    .from('channel_devices')
    .upsert({
      device_id: device_id.toLowerCase(),
      channel_id: dataChannel.id,
      app_id,
      owner_org: dataChannel.owner_org,
    }, { onConflict: 'device_id, app_id' })
  if (dbErrorDev) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot do channel override', dbErrorDev })
    return c.json({
      message: `Cannot do channel override ${JSON.stringify(dbErrorDev)}`,
      error: 'override_not_allowed',
    }, 400)
  }
  await sendStatsAndDevice(c, device, [{ action: 'setChannel' }])
  return c.json(BRES)
}

async function put(c: Context, body: DeviceLink): Promise<Response> {
  cloudlog({ requestId: c.get('requestId'), message: 'put channel self body', body })
  let {
    version_name,
    version_build,
  } = body
  const {
    platform,
    app_id,
    device_id,
    plugin_version,
    custom_id,
    is_emulator = false,
    is_prod = true,
    version_os,
  } = body
  const coerce = tryParse(fixSemver(version_build))
  if (!coerce) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', version_build })
    return c.json({
      message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number`,
      error: 'semver_error',
    }, 400)
  }
  version_build = format(coerce)
  version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name
  if (!device_id || !app_id) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find device_id or appi_id', device_id, app_id, body })
    return c.json({ message: 'Cannot find device_id or appi_id', error: 'missing_info' }, 400)
  }

  const { data: versions } = await supabaseAdmin(c)
    .from('app_versions')
    .select('id, owner_org, name')
    .eq('app_id', app_id)
    .or(`name.eq.${version_name},name.eq.builtin`)
    .limit(2)

  if (!versions || versions.length === 0) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', version_name, body })
    return c.json({
      message: `Version ${version_name} doesn't exist, and no builtin version`,
      error: 'version_error',
    }, 400)
  }
  const owner_org = versions[0].owner_org

  const version = versions.length === 2
    ? versions.find(v => v.name !== 'builtin')
    : versions[0]
  if (!version) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', versions })
    return c.json({
      message: `Version ${version_name} doesn't exist, and no builtin version`,
      error: 'version_error',
    }, 400)
  }

  if (!(await isAllowedActionOrg(c, owner_org))) {
    return c.json({
      message: 'Action not allowed',
      error: 'action_not_allowed',
    }, 200)
  }
  const device: DeviceWithoutCreatedAt = {
    app_id,
    device_id,
    plugin_version,
    version: version.id,
    custom_id,
    is_emulator,
    is_prod,
    version_build,
    os_version: version_os,
    platform: platform as Database['public']['Enums']['platform_os'],
    updated_at: new Date().toISOString(),
  }
  const { data: dataChannel, error: errorChannel } = await supabaseAdmin(c)
    .from('channels')
    .select()
    .eq('app_id', app_id)
    .eq(body.defaultChannel ? 'name' : 'public', body.defaultChannel || true)

  const { data: dataChannelOverride } = await supabaseAdmin(c)
    .from('channel_devices')
    .select(`
      app_id,
      device_id,
      channel_id (
        id,
        allow_device_self_set,
        name
      )
    `)
    .eq('app_id', app_id)
    .eq('device_id', device_id.toLowerCase())
    .single()
  if (dataChannelOverride?.channel_id) {
    const channelId = dataChannelOverride.channel_id as any as Database['public']['Tables']['channels']['Row']
    await sendStatsAndDevice(c, device, [{ action: 'getChannel' }])
    return c.json({
      channel: channelId.name,
      status: 'override',
      allowSet: channelId.allow_device_self_set,
    })
  }
  if (errorChannel)
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find channel default', errorChannel })
  if (!dataChannel) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find channel', dataChannel, errorChannel })
    return c.json({
      message: 'Cannot find channel',
      error: 'channel_not_found',
    }, 400)
  }

  const devicePlatform = devicePlatformScheme.safeParse(platform)
  if (!devicePlatform.success) {
    return c.json({
      message: 'Invalid device platform',
      error: 'invalid_platform',
    }, 400)
  }

  const finalChannel = body.defaultChannel
    ? dataChannel.find(channel => channel.name === body.defaultChannel)
    : dataChannel.find(channel => channel[devicePlatform.data] === true)

  if (!finalChannel) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find channel', dataChannel, errorChannel })
    return c.json({
      message: 'Cannot find channel',
      error: 'channel_not_found',
    }, 400)
  }
  await sendStatsAndDevice(c, device, [{ action: 'getChannel' }])
  return c.json({
    channel: finalChannel.name,
    status: 'default',
  })
}

async function deleteOverride(c: Context, body: DeviceLink): Promise<Response> {
  cloudlog({ requestId: c.get('requestId'), message: 'delete channel self body', body })
  let {
    version_build,
  } = body
  const {
    app_id,
    device_id,
  } = body
  const coerce = tryParse(fixSemver(version_build))
  if (!coerce) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', version_build })
    return c.json({
      message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number`,
      error: 'semver_error',
    }, 400)
  }
  version_build = format(coerce)
  cloudlog({ requestId: c.get('requestId'), message: 'delete override', version_build })
  if (!device_id || !app_id) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find device_id or appi_id', device_id, app_id, body })
    return c.json({ message: 'Cannot find device_id or appi_id', error: 'missing_info' }, 400)
  }
  const { data: dataChannelOverride } = await supabaseAdmin(c)
    .from('channel_devices')
    .select(`
    app_id,
    device_id,
    channel_id (
      id,
      allow_device_self_set,
      name
    )
  `)
    .eq('app_id', app_id)
    .eq('device_id', device_id.toLowerCase())
    .single()
  if (!(dataChannelOverride?.channel_id as any as Database['public']['Tables']['channels']['Row']).allow_device_self_set) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot change device override current channel don\t allow it', dataChannelOverride })
    return c.json({
      message: 'Cannot change device override current channel don\t allow it',
      error: 'cannot_override',
    }, 400)
  }
  const { error } = await supabaseAdmin(c)
    .from('channel_devices')
    .delete()
    .eq('app_id', app_id)
    .eq('device_id', device_id.toLowerCase())
  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete channel override', error })
    return c.json({
      message: `Cannot delete channel override ${JSON.stringify(error)}`,
      error: 'override_not_allowed',
    }, 400)
  }
  return c.json(BRES)
}

async function listCompatibleChannels(c: Context, queryParams: { app_id: string, platform: string, is_emulator: boolean, is_prod: boolean }): Promise<Response> {
  cloudlog({ requestId: c.get('requestId'), message: 'list compatible channels', query: queryParams })

  const { app_id, platform, is_emulator, is_prod } = queryParams

  // Check if app exists and get owner_org for permission check
  const { data: appData } = await supabaseAdmin(c)
    .from('apps')
    .select('owner_org')
    .eq('app_id', app_id)
    .single()

  if (!appData) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find app', app_id })
    return c.json({
      message: `App ${app_id} not found`,
      error: 'app_not_found',
    }, 400)
  }

  if (!(await isAllowedActionOrg(c, appData.owner_org))) {
    return c.json({
      message: 'Action not allowed',
      error: 'action_not_allowed',
    }, 200)
  }

  // Get channels that allow device self set and are compatible with the platform
  let dbQuery = supabaseAdmin(c)
    .from('channels')
    .select('id, name, allow_device_self_set, allow_emulator, allow_dev, ios, android, public')
    .eq('app_id', app_id)
    .eq('allow_device_self_set', true)
    .eq(platform as 'ios' | 'android', true)

  // Filter by emulator compatibility
  if (is_emulator) {
    dbQuery = dbQuery.eq('allow_emulator', true)
  }

  // Filter by dev/prod compatibility
  if (!is_prod) {
    dbQuery = dbQuery.eq('allow_dev', true)
  }

  const { data: channels, error: channelsError } = await dbQuery

  if (channelsError) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot fetch channels', channelsError })
    return c.json({
      message: 'Cannot fetch channels',
      error: 'database_error',
    }, 500)
  }

  if (!channels || channels.length === 0) {
    return c.json([])
  }

  // Return the compatible channels
  const compatibleChannels = channels.map(channel => ({
    id: channel.id,
    name: channel.name,
    public: channel.public,
    allow_self_set: channel.allow_device_self_set,
  }))

  cloudlog({ requestId: c.get('requestId'), message: 'Found compatible channels', count: compatibleChannels.length })

  return c.json(compatibleChannels)
}

export const app = honoFactory.createApp()

app.post('/', async (c) => {
  try {
    const body = await c.req.json<DeviceLink>()
    const parseResult = jsonRequestSchema.safeParse(body)
    if (!parseResult.success) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'post channel self', error: parseResult.error })
      return c.json({ error: `Cannot parse json: ${parseResult.error}` }, 400)
    }
    cloudlog({ requestId: c.get('requestId'), message: 'post body', body })
    return post(c, body)
  }
  catch (e) {
    return c.json({ status: 'Cannot self set channel', error: JSON.stringify(e) }, 500)
  }
})

app.put('/', async (c) => {
  // Used as get, should be refactor with query param instead
  try {
    const body = await c.req.json<DeviceLink>()
    cloudlog({ requestId: c.get('requestId'), message: 'put body', body })
    return put(c, body)
  }
  catch (e) {
    return c.json({ status: 'Cannot self get channel', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/', async (c) => {
  try {
    const body = await getBody<DeviceLink>(c)
    // const body = await c.req.json<DeviceLink>()
    cloudlog({ requestId: c.get('requestId'), message: 'delete body', body })
    return deleteOverride(c, body)
  }
  catch (e) {
    return c.json({ status: 'Cannot self delete channel', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', (c) => {
  try {
    const query = c.req.query()

    // If no query parameters, return status
    if (!query.app_id) {
      return c.json({ status: 'ok' })
    }

    // Parse and validate query parameters
    const parseResult = listChannelsQuerySchema.safeParse({
      app_id: query.app_id,
      platform: query.platform,
      is_emulator: query.is_emulator === 'true',
      is_prod: query.is_prod !== 'false', // default to true unless explicitly false
    })

    if (!parseResult.success) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'list channels query validation failed', error: parseResult.error })
      return c.json({ error: `Invalid query parameters: ${parseResult.error}` }, 400)
    }

    cloudlog({ requestId: c.get('requestId'), message: 'list channels query', query: parseResult.data })
    return listCompatibleChannels(c, parseResult.data)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'list channels error', error: e })
    return c.json({ status: 'Cannot list channels', error: JSON.stringify(e) }, 500)
  }
})
