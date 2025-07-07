// channel self old function
import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { DeviceLink } from '../utils/plugin_parser.ts'
import type { Database } from '../utils/supabase.types.ts'
import type { DeviceWithoutCreatedAt } from '../utils/types.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod'
import { BRES, parseBody, quickError, simpleError, simpleError200 } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { convertQueryToBody, parsePluginBody } from '../utils/plugin_parser.ts'
import { sendStatsAndDevice } from '../utils/stats.ts'
import { isAllowedActionOrg, supabaseAdmin } from '../utils/supabase.ts'
import { deviceIdRegex, INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, MISSING_STRING_APP_ID, MISSING_STRING_DEVICE_ID, MISSING_STRING_VERSION_BUILD, MISSING_STRING_VERSION_NAME, NON_STRING_APP_ID, NON_STRING_DEVICE_ID, NON_STRING_VERSION_BUILD, NON_STRING_VERSION_NAME, reverseDomainRegex } from '../utils/utils.ts'

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
  channel: z.optional(z.string()),
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

async function post(c: Context, body: DeviceLink): Promise<Response> {
  cloudlog({ requestId: c.get('requestId'), message: 'post channel self body', body })
  const {
    version_name,
    version_build,
    platform,
    app_id,
    channel,
    version_os,
    device_id,
    plugin_version,
    custom_id,
    is_emulator,
    is_prod,
  } = body

  const { data: versions } = await supabaseAdmin(c)
    .from('app_versions')
    .select('id, owner_org, name')
    .eq('app_id', app_id)
    .or(`name.eq.${version_name},name.eq.builtin`)
    .limit(2)

  if (!versions || versions.length === 0) {
    throw simpleError('version_error', `Version ${version_name} doesn't exist, and no builtin version`, { version_name, body })
  }
  const owner_org = versions[0].owner_org

  const version = versions.length === 2
    ? versions.find(v => v.name !== 'builtin')
    : versions[0]
  if (!version) {
    throw simpleError('version_error', `Version ${version_name} doesn't exist, and no builtin version`, { versions })
  }

  if (!(await isAllowedActionOrg(c, owner_org))) {
    throw simpleError200(c, 'action_not_allowed', 'Action not allowed')
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
    .eq('device_id', device_id)
    .single()
  if (!channel || (dataChannelOverride && !(dataChannelOverride?.channel_id as any as Database['public']['Tables']['channels']['Row']).allow_device_self_set)) {
    throw simpleError('cannot_override', 'Cannot change device override current channel don\'t allow it', { channel, dataChannelOverride })
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
    throw quickError(404, 'channel_not_found', `Cannot find channel`, { channel, app_id, dbError, dataChannel })
  }

  if (!dataChannel.allow_device_self_set) {
    throw simpleError('channel_set_from_plugin_not_allowed', `This channel does not allow devices to self associate`, { channel, app_id, dbError, dataChannel })
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
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot find main channel', dbMainChannelError })

  const channelId = dataChannelOverride?.channel_id as any as Database['public']['Tables']['channels']['Row']
  if (mainChannelName && mainChannelName === channel) {
    const { error: dbErrorDev } = await supabaseAdmin(c)
      .from('channel_devices')
      .delete()
      .eq('app_id', app_id)
      .eq('device_id', device_id)
    if (dbErrorDev) {
      throw simpleError('override_not_allowed', `Cannot remove channel override`, { dbErrorDev })
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
      .eq('device_id', device_id)
    if (dbErrorDev) {
      throw simpleError('override_not_allowed', `Cannot remove channel override`, { dbErrorDev })
    }
  }
  const { error: dbErrorDev } = await supabaseAdmin(c)
    .from('channel_devices')
    .upsert({
      device_id,
      channel_id: dataChannel.id,
      app_id,
      owner_org: dataChannel.owner_org,
    }, { onConflict: 'device_id, app_id' })
  if (dbErrorDev) {
    throw simpleError('override_not_allowed', `Cannot do channel override`, { dbErrorDev })
  }
  await sendStatsAndDevice(c, device, [{ action: 'setChannel' }])
  return c.json(BRES)
}

async function put(c: Context, body: DeviceLink): Promise<Response> {
  cloudlog({ requestId: c.get('requestId'), message: 'put channel self body', body })
  const {
    platform,
    app_id,
    device_id,
    plugin_version,
    version_name,
    version_build,
    custom_id,
    is_emulator,
    is_prod,
    version_os,
  } = body

  const { data: versions } = await supabaseAdmin(c)
    .from('app_versions')
    .select('id, owner_org, name')
    .eq('app_id', app_id)
    .or(`name.eq.${version_name},name.eq.builtin`)
    .limit(2)

  if (!versions || versions.length === 0) {
    throw simpleError('version_error', `Version ${version_name} doesn't exist, and no builtin version`, { version_name, body })
  }
  const owner_org = versions[0].owner_org

  const version = versions.length === 2
    ? versions.find(v => v.name !== 'builtin')
    : versions[0]
  if (!version) {
    throw simpleError('version_error', `Version ${version_name} doesn't exist, and no builtin version`, { versions })
  }

  if (!(await isAllowedActionOrg(c, owner_org))) {
    throw simpleError('action_not_allowed', 'Action not allowed')
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
    .eq('device_id', device_id)
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
  if (!dataChannel) {
    throw quickError(404, 'channel_not_found', 'Cannot find channel', { dataChannel, errorChannel })
  }

  const devicePlatform = devicePlatformScheme.safeParse(platform)
  if (!devicePlatform.success) {
    throw simpleError('invalid_platform', 'Invalid device platform', { platform, devicePlatform })
  }

  const finalChannel = body.defaultChannel
    ? dataChannel.find(channel => channel.name === body.defaultChannel)
    : dataChannel.find(channel => channel[devicePlatform.data] === true)

  if (!finalChannel) {
    throw quickError(404, 'channel_not_found', 'Cannot find channel', { dataChannel, errorChannel })
  }
  await sendStatsAndDevice(c, device, [{ action: 'getChannel' }])
  return c.json({
    channel: finalChannel.name,
    status: 'default',
  })
}

async function deleteOverride(c: Context, body: DeviceLink): Promise<Response> {
  cloudlog({ requestId: c.get('requestId'), message: 'delete channel self body', body })
  const {
    app_id,
    device_id,
    version_build,
  } = body
  cloudlog({ requestId: c.get('requestId'), message: 'delete override', version_build })

  const { data: dataChannelOverride, error: channelOverrideError } = await supabaseAdmin(c)
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
    .eq('device_id', device_id)
    .maybeSingle()

  if (channelOverrideError || !dataChannelOverride?.channel_id) {
    throw simpleError('cannot_override', 'Cannot change device override current channel don\t allow it', { dataChannelOverride, error: channelOverrideError })
  }

  const channelOverride = dataChannelOverride.channel_id as any as Database['public']['Tables']['channels']['Row']
  if (!channelOverride.allow_device_self_set) {
    throw simpleError('cannot_override', 'Cannot change device override current channel don\t allow it', { channelOverride })
  }
  const { error } = await supabaseAdmin(c)
    .from('channel_devices')
    .delete()
    .eq('app_id', app_id)
    .eq('device_id', device_id)
  if (error) {
    throw simpleError('override_not_allowed', `Cannot delete channel override`, { error })
  }
  return c.json(BRES)
}

async function listCompatibleChannels(c: Context, body: DeviceLink): Promise<Response> {
  const { app_id, platform, is_emulator, is_prod } = body

  // Check if app exists and get owner_org for permission check
  const { data: appData } = await supabaseAdmin(c)
    .from('apps')
    .select('owner_org')
    .eq('app_id', app_id)
    .single()

  if (!appData) {
    throw quickError(404, 'app_not_found', `App ${app_id} not found`, { app_id })
  }

  if (!(await isAllowedActionOrg(c, appData.owner_org))) {
    throw simpleError('action_not_allowed', 'Action not allowed')
  }

  // Get channels that allow device self set and are compatible with the platform
  const { data: channels, error: channelsError } = await supabaseAdmin(c)
    .from('channels')
    .select('id, name, allow_device_self_set, allow_emulator, allow_dev, ios, android, public')
    .eq('app_id', app_id)
    .eq('allow_device_self_set', true)
    .eq('allow_emulator', is_emulator!)
    .eq('allow_dev', is_prod!)
    .eq(platform as 'ios' | 'android', true)

  if (channelsError) {
    throw simpleError('database_error', 'Cannot fetch channels', {}, channelsError)
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

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', async (c) => {
  const body = await parseBody<DeviceLink>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post body', body })
  return post(c, parsePluginBody<DeviceLink>(c, body, jsonRequestSchema))
})

app.put('/', async (c) => {
  // Used as get, should be refactor with query param instead
  const body = await parseBody<DeviceLink>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'put body', body })
  return put(c, parsePluginBody<DeviceLink>(c, body, jsonRequestSchema))
})

app.delete('/', (c) => {
  const query = convertQueryToBody(c.req.query())
  cloudlog({ requestId: c.get('requestId'), message: 'delete body', query })
  return deleteOverride(c, parsePluginBody<DeviceLink>(c, query, jsonRequestSchema))
})

app.get('/', (c) => {
  const query = convertQueryToBody(c.req.query())
  cloudlog({ requestId: c.get('requestId'), message: 'list compatible channels', query })
  return listCompatibleChannels(c, parsePluginBody<DeviceLink>(c, query, jsonRequestSchema))
})
