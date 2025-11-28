// channel self old function
import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { DeviceLink } from '../utils/plugin_parser.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { getAppStatus, setAppStatus } from '../utils/appStatus.ts'
import { BRES, getIsV2Channel, parseBody, simpleError200, simpleRateLimit } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { closeClient, deleteChannelDevicePg, getAppByIdPg, getAppOwnerPostgres, getAppVersionsByAppIdPg, getChannelByNamePg, getChannelDeviceOverridePg, getChannelsPg, getCompatibleChannelsPg, getDrizzleClient, getMainChannelsPg, getPgClient, upsertChannelDevicePg } from '../utils/pg.ts'
import { getAppByIdD1, getAppOwnerPostgresV2, getAppVersionsByAppIdD1, getChannelByNameD1, getChannelDeviceOverrideD1, getChannelsD1, getCompatibleChannelsD1, getDrizzleClientD1Session, getMainChannelsD1 } from '../utils/pg_d1.ts'
import { convertQueryToBody, makeDevice, parsePluginBody } from '../utils/plugin_parser.ts'
import { sendStatsAndDevice } from '../utils/stats.ts'
import { deviceIdRegex, INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, isLimited, MISSING_STRING_APP_ID, MISSING_STRING_DEVICE_ID, MISSING_STRING_VERSION_BUILD, MISSING_STRING_VERSION_NAME, NON_STRING_APP_ID, NON_STRING_DEVICE_ID, NON_STRING_VERSION_BUILD, NON_STRING_VERSION_NAME, reverseDomainRegex } from '../utils/utils.ts'

z.config(z.locales.en())
const devicePlatformScheme = z.literal(['ios', 'android'])
const PLAN_MAU_ACTIONS: Array<'mau'> = ['mau']
const PLAN_ERROR = 'Cannot set channel, upgrade plan to continue to update'

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

// TODO: delete when all mirgrated to jsonRequestSchema
export const jsonRequestSchemaGet = z.looseObject({
  app_id: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_APP_ID : NON_STRING_APP_ID,
  }).check(z.regex(reverseDomainRegex, { message: INVALID_STRING_APP_ID })),
  is_emulator: z.boolean(),
  is_prod: z.boolean(),
  platform: devicePlatformScheme,
})

async function post(c: Context, drizzleClient: ReturnType<typeof getDrizzleClient>, isV2: boolean, body: DeviceLink): Promise<Response> {
  cloudlog({ requestId: c.get('requestId'), message: 'post channel self body', body })
  const device = makeDevice(body)
  const { app_id, version_name, device_id, channel } = body

  const drizzleClientD1 = (isV2 ? getDrizzleClientD1Session(c) : undefined) as ReturnType<typeof getDrizzleClientD1Session>
  const cachedStatus = await getAppStatus(c, app_id)
  if (cachedStatus === 'onprem') {
    cloudlog({ requestId: c.get('requestId'), message: 'Channel_self cache hit, app marked onprem', app_id })
    return c.json({ error: 'on_premise_app', message: 'On-premise app detected' }, 429)
  }
  if (cachedStatus === 'cancelled') {
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    return simpleError200(c, 'need_plan_upgrade', PLAN_ERROR)
  }
  // Check if app exists first - Read operation can use v2 flag
  const appOwner = isV2
    ? await getAppOwnerPostgresV2(c, app_id, drizzleClientD1, PLAN_MAU_ACTIONS)
    : await getAppOwnerPostgres(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>, PLAN_MAU_ACTIONS)

  if (!appOwner) {
    // On-premise app detected - return 429 to prevent DDOS
    cloudlog({ requestId: c.get('requestId'), message: 'On-premise app detected in channel_self POST, returning 429', app_id })
    await setAppStatus(c, app_id, 'onprem')
    return c.json({ error: 'on_premise_app', message: 'On-premise app detected' }, 429)
  }
  if (!appOwner.plan_valid) {
    await setAppStatus(c, app_id, 'cancelled')
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot update, upgrade plan to continue to update', id: app_id })
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    return simpleError200(c, 'need_plan_upgrade', PLAN_ERROR)
  }

  await setAppStatus(c, app_id, 'cloud')

  // Read operations can use v2 flag
  const versions = isV2
    ? await getAppVersionsByAppIdD1(c, app_id, version_name, drizzleClientD1, PLAN_MAU_ACTIONS)
    : await getAppVersionsByAppIdPg(c, app_id, version_name, drizzleClient as ReturnType<typeof getDrizzleClient>, PLAN_MAU_ACTIONS)

  if (!versions || versions.length === 0) {
    return simpleError200(c, 'version_error', `Version ${version_name} doesn't exist, and no builtin version`, { version_name })
  }
  if (!versions[0].plan_valid) {
    return simpleError200(c, 'action_not_allowed', 'Action not allowed')
  }
  const version = versions.length === 2
    ? versions.find((v: { name: string }) => v.name !== 'builtin')
    : versions[0]
  if (!version) {
    return simpleError200(c, 'version_error', `Version ${version_name} doesn't exist, and no builtin version`)
  }

  // Read operations can use v2 flag
  const dataChannelOverride = isV2
    ? await getChannelDeviceOverrideD1(c, app_id, device_id, drizzleClientD1)
    : await getChannelDeviceOverridePg(c, app_id, device_id, drizzleClient as ReturnType<typeof getDrizzleClient>)

  if (!channel) {
    return simpleError200(c, 'cannot_override', 'Missing channel')
  }
  if (dataChannelOverride && !dataChannelOverride.channel_id.allow_device_self_set) {
    return simpleError200(c, 'cannot_override', 'Cannot change device override current channel don\'t allow it')
  }
  // if channel set channel_override to it
  // get channel by name - Read operation can use v2 flag
  const dataChannel = isV2
    ? await getChannelByNameD1(c, app_id, channel, drizzleClientD1)
    : await getChannelByNamePg(c, app_id, channel, drizzleClient as ReturnType<typeof getDrizzleClient>)

  if (!dataChannel) {
    return simpleError200(c, 'channel_not_found', `Cannot find channel`, { channel, app_id })
  }

  if (!dataChannel.allow_device_self_set) {
    return simpleError200(c, 'channel_set_from_plugin_not_allowed', `This channel does not allow devices to self associate`, { channel, app_id })
  }

  // Get the main channel - Read operation can use v2 flag
  const mainChannel = isV2
    ? await getMainChannelsD1(c, app_id, drizzleClientD1)
    : await getMainChannelsPg(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>)

  // We DO NOT return if there is no main channel as it's not a critical error
  // We will just set the channel_devices as the user requested
  let mainChannelName = null as string | null
  if (mainChannel && mainChannel.length > 0) {
    const devicePlatform = body.platform as Database['public']['Enums']['platform_os']
    const finalChannel = mainChannel.find((channel: { name: string, ios: boolean, android: boolean }) => channel[devicePlatform])
    mainChannelName = (finalChannel !== undefined) ? finalChannel.name : null
  }

  // const mainChannelName = (!dbMainChannelError && mainChannel) ? mainChannel.name : null
  if (!mainChannel || mainChannel.length === 0)
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot find main channel' })

  if (mainChannelName && mainChannelName === channel) {
    // Write operation - use the PG client created by the route handler

    const success = await deleteChannelDevicePg(c, app_id, device_id, drizzleClient)
    if (!success) {
      return simpleError200(c, 'override_not_allowed', `Cannot remove channel override`)
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

  // Write operations - use the PG client created by the route handler

  if (dataChannelOverride) {
    const success = await deleteChannelDevicePg(c, app_id, device_id, drizzleClient)
    if (!success) {
      return simpleError200(c, 'override_not_allowed', `Cannot remove channel override`)
    }
  }
  const success = await upsertChannelDevicePg(c, {
    device_id,
    channel_id: dataChannel.id,
    app_id,
    owner_org: dataChannel.owner_org,
  }, drizzleClient)
  if (!success) {
    return simpleError200(c, 'override_not_allowed', `Cannot do channel override`)
  }

  await sendStatsAndDevice(c, device, [{ action: 'setChannel' }])
  return c.json(BRES)
}

async function put(c: Context, drizzleClient: ReturnType<typeof getDrizzleClient> | ReturnType<typeof getDrizzleClientD1Session>, isV2: boolean, body: DeviceLink): Promise<Response> {
  cloudlog({ requestId: c.get('requestId'), message: 'put channel self body', body })
  const device = makeDevice(body)
  const { app_id, version_name, defaultChannel, device_id } = body

  // Check if app exists first - Read operation can use v2 flag
  const cachedStatus = await getAppStatus(c, app_id)
  if (cachedStatus === 'onprem') {
    cloudlog({ requestId: c.get('requestId'), message: 'Channel_self cache hit (put), app marked onprem', app_id })
    return c.json({ error: 'on_premise_app', message: 'On-premise app detected' }, 429)
  }
  if (cachedStatus === 'cancelled') {
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    return simpleError200(c, 'need_plan_upgrade', PLAN_ERROR)
  }
  const appOwner = isV2
    ? await getAppOwnerPostgresV2(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>, PLAN_MAU_ACTIONS)
    : await getAppOwnerPostgres(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>, PLAN_MAU_ACTIONS)

  if (!appOwner) {
    cloudlog({ requestId: c.get('requestId'), message: 'On-premise app detected in channel_self PUT, returning 429', app_id })
    await setAppStatus(c, app_id, 'onprem')
    return c.json({ error: 'on_premise_app', message: 'On-premise app detected' }, 429)
  }
  if (!appOwner.plan_valid) {
    await setAppStatus(c, app_id, 'cancelled')
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot update, upgrade plan to continue to update', id: app_id })
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    return simpleError200(c, 'need_plan_upgrade', PLAN_ERROR)
  }
  await setAppStatus(c, app_id, 'cloud')

  // Read operations can use v2 flag
  const versions = isV2
    ? await getAppVersionsByAppIdD1(c, app_id, version_name, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>, PLAN_MAU_ACTIONS)
    : await getAppVersionsByAppIdPg(c, app_id, version_name, drizzleClient as ReturnType<typeof getDrizzleClient>, PLAN_MAU_ACTIONS)

  if (!versions || versions.length === 0) {
    return simpleError200(c, 'version_error', `Version ${version_name} doesn't exist, and no builtin version`, { version_name })
  }
  if (!versions[0].plan_valid) {
    return simpleError200(c, 'action_not_allowed', 'Action not allowed')
  }
  const version = versions.length === 2
    ? versions.find((v: { name: string }) => v.name !== 'builtin')
    : versions[0]
  if (!version) {
    return simpleError200(c, 'version_error', `Version ${version_name} doesn't exist, and no builtin version`)
  }

  // Read operations can use v2 flag
  const dataChannel = isV2
    ? await getChannelsD1(c, app_id, defaultChannel ? { defaultChannel } : { public: true }, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>)
    : await getChannelsPg(c, app_id, defaultChannel ? { defaultChannel } : { public: true }, drizzleClient as ReturnType<typeof getDrizzleClient>)

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
    return simpleError200(c, 'channel_not_found', 'Cannot find channel')
  }

  const devicePlatform = devicePlatformScheme.safeParse(body.platform)
  if (!devicePlatform.success) {
    return simpleError200(c, 'invalid_platform', 'Invalid device platform', { platform: body.platform })
  }

  const finalChannel = defaultChannel
    ? dataChannel.find((channel: { name: string }) => channel.name === defaultChannel)
    : dataChannel.find((channel: { ios: boolean, android: boolean }) => channel[devicePlatform.data])

  if (!finalChannel) {
    return simpleError200(c, 'channel_not_found', 'Cannot find channel')
  }
  await sendStatsAndDevice(c, device, [{ action: 'getChannel' }])
  return c.json({
    channel: finalChannel.name,
    status: 'default',
  })
}

async function deleteOverride(c: Context, drizzleClient: ReturnType<typeof getDrizzleClient>, isV2: boolean, body: DeviceLink): Promise<Response> {
  cloudlog({ requestId: c.get('requestId'), message: 'delete channel self body', body })
  const {
    app_id,
    device_id,
    version_build,
  } = body
  const device = makeDevice(body)
  const drizzleClientD1 = (isV2 ? getDrizzleClientD1Session(c) : undefined) as ReturnType<typeof getDrizzleClientD1Session>
  cloudlog({ requestId: c.get('requestId'), message: 'delete override', version_build })

  // Check if app exists first - Read operation can use v2 flag
  const cachedStatus = await getAppStatus(c, app_id)
  if (cachedStatus === 'onprem') {
    cloudlog({ requestId: c.get('requestId'), message: 'Channel_self cache hit (delete), app marked onprem', app_id })
    return c.json({ error: 'on_premise_app', message: 'On-premise app detected' }, 429)
  }
  if (cachedStatus === 'cancelled') {
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    return simpleError200(c, 'need_plan_upgrade', PLAN_ERROR)
  }
  const appOwner = isV2
    ? await getAppOwnerPostgresV2(c, app_id, drizzleClientD1, PLAN_MAU_ACTIONS)
    : await getAppOwnerPostgres(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>, PLAN_MAU_ACTIONS)

  if (!appOwner) {
    cloudlog({ requestId: c.get('requestId'), message: 'On-premise app detected in channel_self DELETE, returning 429', app_id })
    await setAppStatus(c, app_id, 'onprem')
    return c.json({ error: 'on_premise_app', message: 'On-premise app detected' }, 429)
  }
  if (!appOwner.plan_valid) {
    await setAppStatus(c, app_id, 'cancelled')
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot update, upgrade plan to continue to update', id: app_id })
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    return simpleError200(c, 'need_plan_upgrade', PLAN_ERROR)
  }
  await setAppStatus(c, app_id, 'cloud')

  // Read operation can use v2 flag
  const dataChannelOverride = isV2
    ? await getChannelDeviceOverrideD1(c, app_id, device_id, drizzleClientD1)
    : await getChannelDeviceOverridePg(c, app_id, device_id, drizzleClient as ReturnType<typeof getDrizzleClient>)

  if (!dataChannelOverride?.channel_id) {
    return simpleError200(c, 'cannot_override', 'Cannot change device override current channel don\'t allow it')
  }

  if (!dataChannelOverride.channel_id.allow_device_self_set) {
    return simpleError200(c, 'cannot_override', 'Cannot change device override current channel don\'t allow it')
  }

  // Write operation - use the PG client created by the route handler

  const success = await deleteChannelDevicePg(c, app_id, device_id, drizzleClient)
  if (!success) {
    return simpleError200(c, 'override_not_allowed', `Cannot delete channel override`)
  }

  return c.json(BRES)
}

async function listCompatibleChannels(c: Context, drizzleClient: ReturnType<typeof getDrizzleClient> | ReturnType<typeof getDrizzleClientD1Session>, isV2: boolean, body: DeviceLink): Promise<Response> {
  const { app_id, platform, is_emulator, is_prod } = body
  const device = makeDevice(body)

  // First check if app exists - Read operation can use v2 flag
  const appExists = isV2
    ? await getAppByIdD1(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>, PLAN_MAU_ACTIONS)
    : await getAppByIdPg(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>, PLAN_MAU_ACTIONS)

  if (!appExists) {
    // App doesn't exist in database
    return simpleError200(c, 'app_not_found', 'App not found', { app_id })
  }

  // Check if app has valid org association (not on-premise) - Read operation can use v2 flag
  const cachedStatus = await getAppStatus(c, app_id)
  if (cachedStatus === 'onprem') {
    cloudlog({ requestId: c.get('requestId'), message: 'Channel_self cache hit (list), app marked onprem', app_id })
    return c.json({ error: 'on_premise_app', message: 'On-premise app detected' }, 429)
  }
  if (cachedStatus === 'cancelled') {
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    return simpleError200(c, 'need_plan_upgrade', PLAN_ERROR)
  }
  const appOwner = isV2
    ? await getAppOwnerPostgresV2(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClientD1Session>, PLAN_MAU_ACTIONS)
    : await getAppOwnerPostgres(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>, PLAN_MAU_ACTIONS)

  if (!appOwner) {
    cloudlog({ requestId: c.get('requestId'), message: 'On-premise app detected in channel_self GET, returning 429', app_id })
    await setAppStatus(c, app_id, 'onprem')
    return c.json({ error: 'on_premise_app', message: 'On-premise app detected' }, 429)
  }
  if (!appOwner.plan_valid) {
    await setAppStatus(c, app_id, 'cancelled')
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot update, upgrade plan to continue to update', id: app_id })
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    return simpleError200(c, 'need_plan_upgrade', PLAN_ERROR)
  }
  await setAppStatus(c, app_id, 'cloud')

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

  if (isLimited(c, body.app_id)) {
    return simpleRateLimit(body)
  }

  const isV2 = getIsV2Channel(c)
  // POST has writes, so always create PG client (even if using D1 for reads)
  const pgClient = getPgClient(c)

  const bodyParsed = parsePluginBody<DeviceLink>(c, body, jsonRequestSchema)
  if (!bodyParsed.channel) {
    return simpleError200(c, 'missing_channel', 'Cannot find channel in body')
  }
  let res
  try {
    res = await post(c, getDrizzleClient(pgClient), !!isV2, bodyParsed)
  }
  finally {
    await closeClient(c, pgClient)
  }
  return res
})

app.put('/', async (c) => {
  // TODO: Used as get, should be refactor with query param instead
  const body = await parseBody<DeviceLink>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'put body', body })

  if (isLimited(c, body.app_id)) {
    return simpleRateLimit(body)
  }

  const isV2 = getIsV2Channel(c)
  const pgClient = isV2 ? null : getPgClient(c)

  const bodyParsed = parsePluginBody<DeviceLink>(c, body, jsonRequestSchema)
  let res
  try {
    res = await put(c, isV2 ? getDrizzleClientD1Session(c) : getDrizzleClient(pgClient as any), !!isV2, bodyParsed)
  }
  finally {
    if (!isV2 && pgClient)
      await closeClient(c, pgClient)
  }
  return res
})

app.delete('/', async (c) => {
  const body = convertQueryToBody(c.req.query())
  cloudlog({ requestId: c.get('requestId'), message: 'delete body', body })

  if (isLimited(c, body.app_id)) {
    return simpleRateLimit(body)
  }

  const isV2 = getIsV2Channel(c)
  // DELETE has writes, so always create PG client (even if using D1 for reads)
  const pgClient = getPgClient(c)

  const bodyParsed = parsePluginBody<DeviceLink>(c, body, jsonRequestSchema)
  let res
  try {
    res = await deleteOverride(c, getDrizzleClient(pgClient), !!isV2, bodyParsed)
  }
  finally {
    await closeClient(c, pgClient)
  }
  return res
})

app.get('/', async (c) => {
  const body = convertQueryToBody(c.req.query())
  cloudlog({ requestId: c.get('requestId'), message: 'list compatible channels', body })

  if (isLimited(c, body.app_id)) {
    return simpleRateLimit(body)
  }

  const isV2 = getIsV2Channel(c)
  const pgClient = isV2 ? null : getPgClient(c, true) // READ-ONLY: only queries channels

  const bodyParsed = parsePluginBody<DeviceLink>(c, body, jsonRequestSchemaGet)
  let res
  try {
    res = await listCompatibleChannels(c, isV2 ? getDrizzleClientD1Session(c) : getDrizzleClient(pgClient as any), !!isV2, bodyParsed)
  }
  finally {
    if (!isV2 && pgClient)
      await closeClient(c, pgClient)
  }
  return res
})
