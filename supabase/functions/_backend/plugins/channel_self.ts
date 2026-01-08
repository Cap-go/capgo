// channel self old function
import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { DeviceLink } from '../utils/plugin_parser.ts'
import type { Database } from '../utils/supabase.types.ts'
import { parse } from '@std/semver'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { getAppStatus, setAppStatus } from '../utils/appStatus.ts'
import { BRES, parseBody, simpleError200, simpleRateLimit } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { sendNotifOrg } from '../utils/notifications.ts'
import { sendNotifToOrgMembers } from '../utils/org_email_notifications.ts'
import { closeClient, deleteChannelDevicePg, getAppByIdPg, getAppOwnerPostgres, getAppVersionsByAppIdPg, getChannelByNamePg, getChannelDeviceOverridePg, getChannelsPg, getCompatibleChannelsPg, getDrizzleClient, getMainChannelsPg, getPgClient, upsertChannelDevicePg } from '../utils/pg.ts'
import { convertQueryToBody, makeDevice, parsePluginBody } from '../utils/plugin_parser.ts'
import { sendStatsAndDevice } from '../utils/stats.ts'
import { backgroundTask, deviceIdRegex, INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, isDeprecatedPluginVersion, isLimited, MISSING_STRING_APP_ID, MISSING_STRING_DEVICE_ID, MISSING_STRING_VERSION_BUILD, MISSING_STRING_VERSION_NAME, NON_STRING_APP_ID, NON_STRING_DEVICE_ID, NON_STRING_VERSION_BUILD, NON_STRING_VERSION_NAME, reverseDomainRegex } from '../utils/utils.ts'

// Minimum versions for local channel storage behavior
const CHANNEL_SELF_MIN_V5 = '5.34.0'
const CHANNEL_SELF_MIN_V6 = '6.34.0'
const CHANNEL_SELF_MIN_V7 = '7.34.0'
const CHANNEL_SELF_MIN_V8 = '8.0.0'

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
  plugin_version: z.optional(z.string()),
  is_prod: z.boolean(),
  platform: devicePlatformScheme,
  key_id: z.optional(z.string().check(z.maxLength(20))),
})

// TODO: delete when all mirgrated to jsonRequestSchema
export const jsonRequestSchemaGet = z.looseObject({
  app_id: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_APP_ID : NON_STRING_APP_ID,
  }).check(z.regex(reverseDomainRegex, { message: INVALID_STRING_APP_ID })),
  is_emulator: z.boolean(),
  is_prod: z.boolean(),
  platform: devicePlatformScheme,
  key_id: z.optional(z.string().check(z.maxLength(20))),
})

async function post(c: Context, drizzleClient: ReturnType<typeof getDrizzleClient>, body: DeviceLink): Promise<Response> {
  cloudlog({ requestId: c.get('requestId'), message: 'post channel self body', body })
  const device = makeDevice(body)
  const { app_id, version_name, device_id, channel } = body

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
  const appOwner = await getAppOwnerPostgres(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>, PLAN_MAU_ACTIONS)

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
    // Send weekly notification about missing payment (not configurable - payment related)
    backgroundTask(c, sendNotifOrg(c, 'org:missing_payment', {
      app_id,
      device_id,
      app_id_url: app_id,
    }, appOwner.owner_org, app_id, '0 0 * * 1')) // Weekly on Monday
    return simpleError200(c, 'need_plan_upgrade', PLAN_ERROR)
  }

  await setAppStatus(c, app_id, 'cloud')

  // Read operations can use v2 flag
  const versions = await getAppVersionsByAppIdPg(c, app_id, version_name, drizzleClient as ReturnType<typeof getDrizzleClient>, PLAN_MAU_ACTIONS)

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
  const dataChannelOverride = await getChannelDeviceOverridePg(c, app_id, device_id, drizzleClient as ReturnType<typeof getDrizzleClient>)

  if (!channel) {
    return simpleError200(c, 'cannot_override', 'Missing channel')
  }
  if (dataChannelOverride && !dataChannelOverride.channel_id.allow_device_self_set) {
    // Send weekly notification to org about self-assignment rejection
    backgroundTask(c, sendNotifToOrgMembers(
      c,
      'device:channel_self_set_rejected',
      'channel_self_rejected',
      {
        channel_name: dataChannelOverride.channel_id.name,
        channel_id: dataChannelOverride.channel_id.id,
        device_id: dataChannelOverride.device_id,
        app_id,
      },
      appOwner.owner_org,
      `${app_id}`,
      '0 0 * * 0', // Weekly on Sunday at midnight
    ))
    return simpleError200(c, 'cannot_override', 'Cannot change device override current channel don\'t allow it')
  }
  // if channel set channel_override to it
  // get channel by name - Read operation can use v2 flag
  const dataChannel = await getChannelByNamePg(c, app_id, channel, drizzleClient as ReturnType<typeof getDrizzleClient>)

  if (!dataChannel) {
    return simpleError200(c, 'channel_not_found', `Cannot find channel`, { channel, app_id })
  }

  if (!dataChannel.allow_device_self_set) {
    // Send weekly notification to org about self-assignment rejection
    backgroundTask(c, sendNotifToOrgMembers(
      c,
      'device:channel_self_set_rejected',
      'channel_self_rejected',
      {
        channel_name: dataChannel.name,
        app_id,
      },
      appOwner.owner_org,
      `${app_id}`,
      '0 0 * * 0', // Weekly on Sunday at midnight
    ))
    if (dataChannel.public) {
      return simpleError200(
        c,
        'public_channel_self_set_not_allowed',
        'This channel is public and does not allow device self-assignment. Unset the channel and the device will automatically use the public channel.',
        { channel, app_id },
      )
    }
    return simpleError200(c, 'channel_self_set_not_allowed', 'This channel does not allow devices to self associate', { channel, app_id })
  }

  // Check if plugin version supports local channel storage (5.34.0+, 6.34.0+, 7.34.0+)
  const pluginVersion = body.plugin_version || '0.0.0'
  let isNewVersion = false
  try {
    const parsed = parse(pluginVersion)
    isNewVersion = !isDeprecatedPluginVersion(parsed, CHANNEL_SELF_MIN_V5, CHANNEL_SELF_MIN_V6, CHANNEL_SELF_MIN_V7, CHANNEL_SELF_MIN_V8)
  }
  catch (error) {
    // If version parsing fails, assume old version
    cloudlog({ requestId: c.get('requestId'), message: 'Failed to parse plugin version, assuming old version', plugin_version: pluginVersion, error })
  }

  // For vX.34.0+: Only validate, don't store in channel_devices
  if (isNewVersion) {
    cloudlog({ requestId: c.get('requestId'), message: 'Plugin vX.34.0+ detected, cleaning up old channel_devices entry if exists' })

    // Clean up any existing channel_devices entry (migration)
    if (dataChannelOverride) {
      const success = await deleteChannelDevicePg(c, app_id, device_id, drizzleClient)
      if (!success) {
        cloudlog({ requestId: c.get('requestId'), message: 'Failed to delete old channel_devices entry during migration' })
      }
    }

    // Return validation result only (plugin will store locally)
    await sendStatsAndDevice(c, device, [{ action: 'setChannel' }])
    return c.json({
      status: 'ok',
      allowSet: dataChannel.allow_device_self_set,
    })
  }

  // Old behavior (< v7.34.0): Store in channel_devices table
  // Get the main channel - Read operation can use v2 flag
  const mainChannel = await getMainChannelsPg(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>)

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

async function put(c: Context, drizzleClient: ReturnType<typeof getDrizzleClient>, body: DeviceLink): Promise<Response> {
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
  const appOwner = await getAppOwnerPostgres(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>, PLAN_MAU_ACTIONS)

  if (!appOwner) {
    cloudlog({ requestId: c.get('requestId'), message: 'On-premise app detected in channel_self PUT, returning 429', app_id })
    await setAppStatus(c, app_id, 'onprem')
    return c.json({ error: 'on_premise_app', message: 'On-premise app detected' }, 429)
  }
  if (!appOwner.plan_valid) {
    await setAppStatus(c, app_id, 'cancelled')
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot update, upgrade plan to continue to update', id: app_id })
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    // Send weekly notification about missing payment (not configurable - payment related)
    backgroundTask(c, sendNotifOrg(c, 'org:missing_payment', {
      app_id,
      device_id,
      app_id_url: app_id,
    }, appOwner.owner_org, app_id, '0 0 * * 1')) // Weekly on Monday
    return simpleError200(c, 'need_plan_upgrade', PLAN_ERROR)
  }
  await setAppStatus(c, app_id, 'cloud')

  // Check if plugin version supports local channel storage (5.34.0+, 6.34.0+, 7.34.0+)
  const pluginVersion = body.plugin_version || '0.0.0'
  let isNewVersion = false
  try {
    const parsed = parse(pluginVersion)
    isNewVersion = !isDeprecatedPluginVersion(parsed, CHANNEL_SELF_MIN_V5, CHANNEL_SELF_MIN_V6, CHANNEL_SELF_MIN_V7, CHANNEL_SELF_MIN_V8)
  }
  catch (error) {
    // If version parsing fails, assume old version
    cloudlog({ requestId: c.get('requestId'), message: 'Failed to parse plugin version in PUT, assuming old version', plugin_version: pluginVersion, error })
  }

  // For vX.34.0+: Use channel from request body (plugin sends its local channelOverride)
  if (isNewVersion) {
    cloudlog({ requestId: c.get('requestId'), message: 'Plugin vX.34.0+ detected in getChannel, using channel from request body' })
    const channelOverride = body.channel

    if (channelOverride) {
      // Return the channel they sent (it's stored locally)
      await sendStatsAndDevice(c, device, [{ action: 'getChannel' }])
      return c.json({
        channel: channelOverride,
        status: 'override',
        allowSet: true, // Already validated when they set it
      })
    }
    else {
      // No override, use defaultChannel logic
      const channelName = defaultChannel || 'production' // Fallback to production if no defaultChannel
      await sendStatsAndDevice(c, device, [{ action: 'getChannel' }])
      return c.json({
        channel: channelName,
        status: 'default',
      })
    }
  }

  // Old behavior (< v7.34.0): Query channel_devices table
  // Read operations can use v2 flag
  const versions = await getAppVersionsByAppIdPg(c, app_id, version_name, drizzleClient as ReturnType<typeof getDrizzleClient>, PLAN_MAU_ACTIONS)

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
  const dataChannel = await getChannelsPg(c, app_id, defaultChannel ? { defaultChannel } : { public: true }, drizzleClient as ReturnType<typeof getDrizzleClient>)

  const dataChannelOverride = await getChannelDeviceOverridePg(c, app_id, device_id, drizzleClient as ReturnType<typeof getDrizzleClient>)
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

async function deleteOverride(c: Context, drizzleClient: ReturnType<typeof getDrizzleClient>, body: DeviceLink): Promise<Response> {
  cloudlog({ requestId: c.get('requestId'), message: 'delete channel self body', body })
  const {
    app_id,
    device_id,
    version_build,
  } = body
  const device = makeDevice(body)
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
  const appOwner = await getAppOwnerPostgres(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>, PLAN_MAU_ACTIONS)

  if (!appOwner) {
    cloudlog({ requestId: c.get('requestId'), message: 'On-premise app detected in channel_self DELETE, returning 429', app_id })
    await setAppStatus(c, app_id, 'onprem')
    return c.json({ error: 'on_premise_app', message: 'On-premise app detected' }, 429)
  }
  if (!appOwner.plan_valid) {
    await setAppStatus(c, app_id, 'cancelled')
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot update, upgrade plan to continue to update', id: app_id })
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    // Send weekly notification about missing payment (not configurable - payment related)
    backgroundTask(c, sendNotifOrg(c, 'org:missing_payment', {
      app_id,
      device_id,
      app_id_url: app_id,
    }, appOwner.owner_org, app_id, '0 0 * * 1')) // Weekly on Monday
    return simpleError200(c, 'need_plan_upgrade', PLAN_ERROR)
  }
  await setAppStatus(c, app_id, 'cloud')

  // Check if plugin version supports local channel storage (5.34.0+, 6.34.0+, 7.34.0+)
  const pluginVersion = body.plugin_version || '0.0.0'
  let isNewVersion = false
  try {
    const parsed = parse(pluginVersion)
    isNewVersion = !isDeprecatedPluginVersion(parsed, CHANNEL_SELF_MIN_V5, CHANNEL_SELF_MIN_V6, CHANNEL_SELF_MIN_V7, CHANNEL_SELF_MIN_V8)
  }
  catch (error) {
    // If version parsing fails, assume old version
    cloudlog({ requestId: c.get('requestId'), message: 'Failed to parse plugin version in DELETE, assuming old version', plugin_version: pluginVersion, error })
  }

  // For vX.34.0+: Still check and clean up old channel_devices entries (migration cleanup)
  // Read operation can use v2 flag
  const dataChannelOverride = await getChannelDeviceOverridePg(c, app_id, device_id, drizzleClient as ReturnType<typeof getDrizzleClient>)

  if (isNewVersion) {
    // For vX.34.0+: Clean up old entry if it exists from previous versions
    if (dataChannelOverride?.channel_id) {
      cloudlog({ requestId: c.get('requestId'), message: 'Plugin vX.34.0+ detected in unsetChannel, cleaning up old channel_devices entry' })
      await deleteChannelDevicePg(c, app_id, device_id, drizzleClient)
    }
    await sendStatsAndDevice(c, device, [{ action: 'setChannel' }])
    return c.json(BRES)
  }

  // Old behavior (< v7.34.0): Validate and delete from channel_devices table

  if (!dataChannelOverride?.channel_id) {
    return simpleError200(c, 'cannot_override', 'Cannot change device override current channel don\'t allow it')
  }

  if (!dataChannelOverride.channel_id.allow_device_self_set) {
    // Send weekly notification to org about self-assignment rejection
    backgroundTask(c, sendNotifToOrgMembers(
      c,
      'device:channel_self_set_rejected',
      'channel_self_rejected',
      {
        channel_name: dataChannelOverride.channel_id.name,
        app_id,
      },
      appOwner.owner_org,
      `${app_id}`,
      '0 0 * * 0', // Weekly on Sunday at midnight
    ))
    return simpleError200(c, 'cannot_override', 'Cannot change device override current channel don\'t allow it')
  }

  // Write operation - use the PG client created by the route handler

  const success = await deleteChannelDevicePg(c, app_id, device_id, drizzleClient)
  if (!success) {
    return simpleError200(c, 'override_not_allowed', `Cannot delete channel override`)
  }

  return c.json(BRES)
}

async function listCompatibleChannels(c: Context, drizzleClient: ReturnType<typeof getDrizzleClient>, body: DeviceLink): Promise<Response> {
  const { app_id, platform, is_emulator, is_prod } = body
  const device = makeDevice(body)

  // First check if app exists - Read operation can use v2 flag
  const appExists = await getAppByIdPg(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>, PLAN_MAU_ACTIONS)

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
  const appOwner = await getAppOwnerPostgres(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>, PLAN_MAU_ACTIONS)

  if (!appOwner) {
    cloudlog({ requestId: c.get('requestId'), message: 'On-premise app detected in channel_self GET, returning 429', app_id })
    await setAppStatus(c, app_id, 'onprem')
    return c.json({ error: 'on_premise_app', message: 'On-premise app detected' }, 429)
  }
  if (!appOwner.plan_valid) {
    await setAppStatus(c, app_id, 'cancelled')
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot update, upgrade plan to continue to update', id: app_id })
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    // Send weekly notification about missing payment (not configurable - payment related)
    // Note: We don't have device_id in GET request for listing compatible channels
    backgroundTask(c, sendNotifOrg(c, 'org:missing_payment', {
      app_id,
      app_id_url: app_id,
    }, appOwner.owner_org, app_id, '0 0 * * 1')) // Weekly on Monday
    return simpleError200(c, 'need_plan_upgrade', PLAN_ERROR)
  }
  await setAppStatus(c, app_id, 'cloud')

  // Channels compatible with platform/device/build AND (public OR allow_device_self_set)
  const channels = await getCompatibleChannelsPg(c, app_id, platform as 'ios' | 'android', is_emulator!, is_prod!, drizzleClient as ReturnType<typeof getDrizzleClient>)

  if (!channels || channels.length === 0) {
    return c.json([])
  }

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

  // POST has writes, so always create PG client (even if using D1 for reads)
  const pgClient = getPgClient(c)

  const bodyParsed = parsePluginBody<DeviceLink>(c, body, jsonRequestSchema)
  if (!bodyParsed.channel) {
    return simpleError200(c, 'missing_channel', 'Cannot find channel in body')
  }
  let res
  try {
    res = await post(c, getDrizzleClient(pgClient), bodyParsed)
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

  const pgClient = getPgClient(c)

  const bodyParsed = parsePluginBody<DeviceLink>(c, body, jsonRequestSchema)
  let res
  try {
    res = await put(c, getDrizzleClient(pgClient as any), bodyParsed)
  }
  finally {
    if (!pgClient)
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

  // DELETE has writes, so always create PG client (even if using D1 for reads)
  const pgClient = getPgClient(c)

  const bodyParsed = parsePluginBody<DeviceLink>(c, body, jsonRequestSchema)
  let res
  try {
    res = await deleteOverride(c, getDrizzleClient(pgClient), bodyParsed)
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

  const pgClient = getPgClient(c, true)

  const bodyParsed = parsePluginBody<DeviceLink>(c, body, jsonRequestSchemaGet, false)
  let res
  try {
    res = await listCompatibleChannels(c, getDrizzleClient(pgClient as any), bodyParsed)
  }
  finally {
    if (!pgClient)
      await closeClient(c, pgClient)
  }
  return res
})
