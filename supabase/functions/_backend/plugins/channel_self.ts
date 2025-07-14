// channel self old function
import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { DeviceLink } from '../utils/plugin_parser.ts'
import type { Database } from '../utils/supabase.types.ts'
import type { DeviceWithoutCreatedAt } from '../utils/types.ts'
import { getRuntimeKey } from 'hono/adapter'
import { Hono } from 'hono/tiny'
import { z } from 'zod/v4-mini'
import { BRES, parseBody, quickError, simpleError, simpleError200 } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { closeClient, deleteChannelDevicePg, getAppByIdPg, getAppVersionsByAppIdPg, getChannelByNamePg, getChannelDeviceOverridePg, getChannelsPg, getCompatibleChannelsPg, getDrizzleClient, getMainChannelsPg, getPgClient, isAllowedActionOrgPg, upsertChannelDevicePg } from '../utils/pg.ts'
import { getAppByIdD1, getAppVersionsByAppIdD1, getChannelByNameD1, getChannelDeviceOverrideD1, getChannelsD1, getCompatibleChannelsD1, getDrizzleClientD1Session, getMainChannelsD1, isAllowedActionOrgActionD1 } from '../utils/pg_d1.ts'
import { convertQueryToBody, parsePluginBody } from '../utils/plugin_parser.ts'
import { sendStatsAndDevice } from '../utils/stats.ts'
import { deviceIdRegex, getEnv, INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, MISSING_STRING_APP_ID, MISSING_STRING_DEVICE_ID, MISSING_STRING_VERSION_BUILD, MISSING_STRING_VERSION_NAME, NON_STRING_APP_ID, NON_STRING_DEVICE_ID, NON_STRING_VERSION_BUILD, NON_STRING_VERSION_NAME, reverseDomainRegex } from '../utils/utils.ts'

z.config(z.locales.en())
const devicePlatformScheme = z.literal(['ios', 'android'])

export const jsonRequestSchema = z.looseObject({
  app_id: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_APP_ID : NON_STRING_APP_ID,
  }).check(z.regex(reverseDomainRegex, { message: INVALID_STRING_APP_ID })),
  device_id: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_DEVICE_ID : NON_STRING_DEVICE_ID,
  }).check(z.maxLength(36), z.regex(deviceIdRegex, { message: INVALID_STRING_DEVICE_ID })),
  version_name: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_VERSION_NAME : NON_STRING_VERSION_NAME,
  }),
  version_build: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_VERSION_BUILD : NON_STRING_VERSION_BUILD,
  }),
  is_emulator: z.boolean(),
  defaultChannel: z.optional(z.string()),
  channel: z.optional(z.string()),
  is_prod: z.boolean(),
  platform: devicePlatformScheme,
})

async function post(c: Context, drizzleClient: ReturnType<typeof getDrizzleClient> | ReturnType<typeof getDrizzleClientD1Session>, isV2: boolean, body: DeviceLink): Promise<Response> {
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

  // Read operations can use v2 flag
  const versions = isV2
    ? await getAppVersionsByAppIdD1(c, app_id, version_name, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>)
    : await getAppVersionsByAppIdPg(c, app_id, version_name, drizzleClient as ReturnType<typeof getDrizzleClient>)

  if (!versions || versions.length === 0) {
    throw simpleError('version_error', `Version ${version_name} doesn't exist, and no builtin version`, { version_name, body })
  }
  const owner_org = versions[0].owner_org

  const version = versions.length === 2
    ? versions.find((v: { name: string }) => v.name !== 'builtin')
    : versions[0]
  if (!version) {
    throw simpleError('version_error', `Version ${version_name} doesn't exist, and no builtin version`, { versions })
  }

  const planValid = isV2
    ? await isAllowedActionOrgActionD1(c, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>, owner_org, ['mau'])
    : await isAllowedActionOrgPg(c, drizzleClient as ReturnType<typeof getDrizzleClient>, owner_org)
  if (!planValid) {
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

  // Read operations can use v2 flag
  const dataChannelOverride = isV2
    ? await getChannelDeviceOverrideD1(c, app_id, device_id, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>)
    : await getChannelDeviceOverridePg(c, app_id, device_id, drizzleClient as ReturnType<typeof getDrizzleClient>)

  if (!channel) {
    throw simpleError('cannot_override', 'Missing channel')
  }
  if (dataChannelOverride && !dataChannelOverride.channel_id.allow_device_self_set) {
    throw simpleError('cannot_override', 'Cannot change device override current channel don\'t allow it')
  }
  // if channel set channel_override to it
  // get channel by name - Read operation can use v2 flag
  const dataChannel = isV2
    ? await getChannelByNameD1(c, app_id, channel, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>)
    : await getChannelByNamePg(c, app_id, channel, drizzleClient as ReturnType<typeof getDrizzleClient>)

  if (!dataChannel) {
    throw quickError(404, 'channel_not_found', `Cannot find channel`, { channel, app_id })
  }

  if (!dataChannel.allow_device_self_set) {
    throw simpleError('channel_set_from_plugin_not_allowed', `This channel does not allow devices to self associate`, { channel, app_id, dataChannel })
  }

  // Get the main channel - Read operation can use v2 flag
  const mainChannel = isV2
    ? await getMainChannelsD1(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>)
    : await getMainChannelsPg(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>)

  // We DO NOT return if there is no main channel as it's not a critical error
  // We will just set the channel_devices as the user requested
  let mainChannelName = null as string | null
  if (mainChannel && mainChannel.length > 0) {
    const devicePlatform = body.platform as Database['public']['Enums']['platform_os']
    const finalChannel = mainChannel.find((channel: { name: string, ios: boolean, android: boolean }) => channel[devicePlatform] === true)
    mainChannelName = (finalChannel !== undefined) ? finalChannel.name : null
  }

  // const mainChannelName = (!dbMainChannelError && mainChannel) ? mainChannel.name : null
  if (!mainChannel || mainChannel.length === 0)
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot find main channel' })

  if (mainChannelName && mainChannelName === channel) {
    // Write operation - ALWAYS use PostgreSQL
    const pgClientForWrite = isV2 ? getPgClient(c) : null
    const pgDrizzleClient = pgClientForWrite ? getDrizzleClient(pgClientForWrite) : drizzleClient as ReturnType<typeof getDrizzleClient>

    const success = await deleteChannelDevicePg(c, app_id, device_id, pgDrizzleClient)
    if (!success) {
      throw simpleError('override_not_allowed', `Cannot remove channel override`, {})
    }

    if (pgClientForWrite) {
      await closeClient(c, pgClientForWrite)
    }

    cloudlog({ requestId: c.get('requestId'), message: 'main channel set, removing override' })
    await sendStatsAndDevice(c, device, [{ action: 'setChannel' }])
    return c.json(BRES)
  }
  // if dataChannelOverride is same from dataChannel and exist then do nothing
  if (dataChannelOverride && dataChannelOverride.channel_id.id === dataChannel.id) {
    // already set
    cloudlog({ requestId: c.get('requestId'), message: 'channel already set' })
    return c.json(BRES)
  }

  cloudlog({ requestId: c.get('requestId'), message: 'setting channel' })

  // Write operations - ALWAYS use PostgreSQL
  const pgClientForWrite = isV2 ? getPgClient(c) : null
  const pgDrizzleClient = pgClientForWrite ? getDrizzleClient(pgClientForWrite) : drizzleClient as ReturnType<typeof getDrizzleClient>

  if (dataChannelOverride) {
    const success = await deleteChannelDevicePg(c, app_id, device_id, pgDrizzleClient)
    if (!success) {
      throw simpleError('override_not_allowed', `Cannot remove channel override`, {})
    }
  }
  const success = await upsertChannelDevicePg(c, {
    device_id,
    channel_id: dataChannel.id,
    app_id,
    owner_org: dataChannel.owner_org,
  }, pgDrizzleClient)
  if (!success) {
    throw simpleError('override_not_allowed', `Cannot do channel override`, {})
  }

  if (pgClientForWrite) {
    await closeClient(c, pgClientForWrite)
  }

  await sendStatsAndDevice(c, device, [{ action: 'setChannel' }])
  return c.json(BRES)
}

async function put(c: Context, drizzleClient: ReturnType<typeof getDrizzleClient> | ReturnType<typeof getDrizzleClientD1Session>, isV2: boolean, body: DeviceLink): Promise<Response> {
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

  // Read operations can use v2 flag
  const versions = isV2
    ? await getAppVersionsByAppIdD1(c, app_id, version_name, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>)
    : await getAppVersionsByAppIdPg(c, app_id, version_name, drizzleClient as ReturnType<typeof getDrizzleClient>)

  if (!versions || versions.length === 0) {
    throw simpleError('version_error', `Version ${version_name} doesn't exist, and no builtin version`, { version_name, body })
  }
  const owner_org = versions[0].owner_org

  const version = versions.length === 2
    ? versions.find((v: { name: string }) => v.name !== 'builtin')
    : versions[0]
  if (!version) {
    throw simpleError('version_error', `Version ${version_name} doesn't exist, and no builtin version`, { versions })
  }

  const planValid = isV2
    ? await isAllowedActionOrgActionD1(c, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>, owner_org, ['mau'])
    : await isAllowedActionOrgPg(c, drizzleClient as ReturnType<typeof getDrizzleClient>, owner_org)
  if (!planValid) {
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
  // Read operations can use v2 flag
  const dataChannel = isV2
    ? await getChannelsD1(c, app_id, body.defaultChannel ? { defaultChannel: body.defaultChannel } : { public: true }, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>)
    : await getChannelsPg(c, app_id, body.defaultChannel ? { defaultChannel: body.defaultChannel } : { public: true }, drizzleClient as ReturnType<typeof getDrizzleClient>)

  const dataChannelOverride = isV2
    ? await getChannelDeviceOverrideD1(c, app_id, device_id, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>)
    : await getChannelDeviceOverridePg(c, app_id, device_id, drizzleClient as ReturnType<typeof getDrizzleClient>)

  if (dataChannelOverride?.channel_id) {
    await sendStatsAndDevice(c, device, [{ action: 'getChannel' }])
    return c.json({
      channel: dataChannelOverride.channel_id.name,
      status: 'override',
      allowSet: dataChannelOverride.channel_id.allow_device_self_set,
    })
  }
  if (!dataChannel || dataChannel.length === 0) {
    throw quickError(404, 'channel_not_found', 'Cannot find channel', { dataChannel })
  }

  const devicePlatform = devicePlatformScheme.safeParse(platform)
  if (!devicePlatform.success) {
    throw simpleError('invalid_platform', 'Invalid device platform', { platform, devicePlatform })
  }

  const finalChannel = body.defaultChannel
    ? dataChannel.find((channel: { name: string }) => channel.name === body.defaultChannel)
    : dataChannel.find((channel: { ios: boolean, android: boolean }) => channel[devicePlatform.data] === true)

  if (!finalChannel) {
    throw quickError(404, 'channel_not_found', 'Cannot find channel', { dataChannel })
  }
  await sendStatsAndDevice(c, device, [{ action: 'getChannel' }])
  return c.json({
    channel: finalChannel.name,
    status: 'default',
  })
}

async function deleteOverride(c: Context, drizzleClient: ReturnType<typeof getDrizzleClient> | ReturnType<typeof getDrizzleClientD1Session>, isV2: boolean, body: DeviceLink): Promise<Response> {
  cloudlog({ requestId: c.get('requestId'), message: 'delete channel self body', body })
  const {
    app_id,
    device_id,
    version_build,
  } = body
  cloudlog({ requestId: c.get('requestId'), message: 'delete override', version_build })

  // Read operation can use v2 flag
  const dataChannelOverride = isV2
    ? await getChannelDeviceOverrideD1(c, app_id, device_id, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>)
    : await getChannelDeviceOverridePg(c, app_id, device_id, drizzleClient as ReturnType<typeof getDrizzleClient>)

  if (!dataChannelOverride?.channel_id) {
    throw simpleError('cannot_override', 'Cannot change device override current channel don\t allow it', { dataChannelOverride })
  }

  if (!dataChannelOverride.channel_id.allow_device_self_set) {
    throw simpleError('cannot_override', 'Cannot change device override current channel don\t allow it', { channelOverride: dataChannelOverride.channel_id })
  }

  // Write operation - ALWAYS use PostgreSQL
  const pgClientForWrite = isV2 ? getPgClient(c) : null
  const pgDrizzleClient = pgClientForWrite ? getDrizzleClient(pgClientForWrite) : drizzleClient as ReturnType<typeof getDrizzleClient>

  const success = await deleteChannelDevicePg(c, app_id, device_id, pgDrizzleClient)
  if (!success) {
    throw simpleError('override_not_allowed', `Cannot delete channel override`, {})
  }

  if (pgClientForWrite) {
    await closeClient(c, pgClientForWrite)
  }

  return c.json(BRES)
}

async function listCompatibleChannels(c: Context, drizzleClient: ReturnType<typeof getDrizzleClient> | ReturnType<typeof getDrizzleClientD1Session>, isV2: boolean, body: DeviceLink): Promise<Response> {
  const { app_id, platform, is_emulator, is_prod } = body

  // Check if app exists and get owner_org for permission check - Read operation can use v2 flag
  const appData = isV2
    ? await getAppByIdD1(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>)
    : await getAppByIdPg(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>)

  if (!appData) {
    throw quickError(404, 'app_not_found', `App ${app_id} not found`, { app_id })
  }

  const planValid = isV2
    ? await isAllowedActionOrgActionD1(c, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>, appData.owner_org, ['mau'])
    : await isAllowedActionOrgPg(c, drizzleClient as ReturnType<typeof getDrizzleClient>, appData.owner_org)
  if (!planValid) {
    throw simpleError('action_not_allowed', 'Action not allowed')
  }

  // Get channels that allow device self set and are compatible with the platform - Read operation can use v2 flag
  const channels = isV2
    ? await getCompatibleChannelsD1(c, app_id, platform as 'ios' | 'android', is_emulator!, is_prod!, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>)
    : await getCompatibleChannelsPg(c, app_id, platform as 'ios' | 'android', is_emulator!, is_prod!, drizzleClient as ReturnType<typeof getDrizzleClient>)

  if (!channels || channels.length === 0) {
    return c.json([])
  }

  // Return the compatible channels
  const compatibleChannels = channels.map((channel: { id: number, name: string, public: boolean, allow_device_self_set: boolean }) => ({
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

  let pgClient
  const isV2 = getRuntimeKey() === 'workerd' ? Number.parseFloat(getEnv(c, 'IS_V2') ?? '0') : 0.0
  if (isV2 && Math.random() < isV2) {
    cloudlog({ requestId: c.get('requestId'), message: 'update2', isV2 })
    pgClient = null
  }
  else {
    pgClient = getPgClient(c)
  }

  const bodyParsed = parsePluginBody<DeviceLink>(c, body, jsonRequestSchema)
  let res
  try {
    res = await post(c, isV2 ? getDrizzleClientD1Session(c) : getDrizzleClient(pgClient as any), !!isV2, bodyParsed)
  }
  finally {
    if (isV2 && pgClient)
      await closeClient(c, pgClient)
  }
  return res
})

app.put('/', async (c) => {
  // Used as get, should be refactor with query param instead
  const body = await parseBody<DeviceLink>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'put body', body })

  let pgClient
  const isV2 = getRuntimeKey() === 'workerd' ? Number.parseFloat(getEnv(c, 'IS_V2') ?? '0') : 0.0
  if (isV2 && Math.random() < isV2) {
    cloudlog({ requestId: c.get('requestId'), message: 'update2', isV2 })
    pgClient = null
  }
  else {
    pgClient = getPgClient(c)
  }

  const bodyParsed = parsePluginBody<DeviceLink>(c, body, jsonRequestSchema)
  let res
  try {
    res = await put(c, isV2 ? getDrizzleClientD1Session(c) : getDrizzleClient(pgClient as any), !!isV2, bodyParsed)
  }
  finally {
    if (isV2 && pgClient)
      await closeClient(c, pgClient)
  }
  return res
})

app.delete('/', async (c) => {
  const query = convertQueryToBody(c.req.query())
  cloudlog({ requestId: c.get('requestId'), message: 'delete body', query })

  let pgClient
  const isV2 = getRuntimeKey() === 'workerd' ? Number.parseFloat(getEnv(c, 'IS_V2') ?? '0') : 0.0
  if (isV2 && Math.random() < isV2) {
    cloudlog({ requestId: c.get('requestId'), message: 'update2', isV2 })
    pgClient = null
  }
  else {
    pgClient = getPgClient(c)
  }

  const bodyParsed = parsePluginBody<DeviceLink>(c, query, jsonRequestSchema)
  let res
  try {
    res = await deleteOverride(c, isV2 ? getDrizzleClientD1Session(c) : getDrizzleClient(pgClient as any), !!isV2, bodyParsed)
  }
  finally {
    if (isV2 && pgClient)
      await closeClient(c, pgClient)
  }
  return res
})

app.get('/', async (c) => {
  const query = convertQueryToBody(c.req.query())
  cloudlog({ requestId: c.get('requestId'), message: 'list compatible channels', query })

  let pgClient
  const isV2 = getRuntimeKey() === 'workerd' ? Number.parseFloat(getEnv(c, 'IS_V2') ?? '0') : 0.0
  if (isV2 && Math.random() < isV2) {
    cloudlog({ requestId: c.get('requestId'), message: 'update2', isV2 })
    pgClient = null
  }
  else {
    pgClient = getPgClient(c)
  }

  const bodyParsed = parsePluginBody<DeviceLink>(c, query, jsonRequestSchema)
  let res
  try {
    res = await listCompatibleChannels(c, isV2 ? getDrizzleClientD1Session(c) : getDrizzleClient(pgClient as any), !!isV2, bodyParsed)
  }
  finally {
    if (isV2 && pgClient)
      await closeClient(c, pgClient)
  }
  return res
})
