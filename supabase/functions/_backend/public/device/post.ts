import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import type { DeviceLink } from './delete.ts'
import { shouldSyncChannelSelfOverrideForPluginVersion, syncChannelSelfOverride } from '../../utils/channelSelfStore.ts'
import { BRES, quickError, simpleError } from '../../utils/hono.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseApikey, updateOrCreateChannelDevice } from '../../utils/supabase.ts'
import { isValidAppId } from '../../utils/utils.ts'

type PublicDeviceClient = ReturnType<typeof supabaseApikey>

async function getDevicePluginVersion(c: Context, supabase: PublicDeviceClient, appId: string, deviceId: string) {
  const { data, error } = await supabase
    .from('devices')
    .select('plugin_version')
    .eq('app_id', appId)
    .eq('device_id', deviceId.toLowerCase())
    .maybeSingle()

  if (error) {
    throw quickError(500, 'device_error', 'Error reading device plugin version', { error, app_id: appId, device_id: deviceId })
  }

  return data?.plugin_version ?? null
}

export async function post(c: Context<MiddlewareKeyVariables, any, object>, body: DeviceLink, apikey: Database['public']['Tables']['apikeys']['Row']) {
  if (!body.device_id || !body.app_id) {
    throw simpleError('missing_device_id_or_app_id', 'Missing device_id or app_id', { body })
  }

  if (!isValidAppId(body.app_id)) {
    throw simpleError('invalid_app_id', 'App ID must be a reverse domain string', { app_id: body.app_id })
  }

  // Auth context is already set by middlewareKey
  if (!(await checkPermission(c, 'app.manage_devices', { appId: body.app_id }))) {
    throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id })
  }

  if ((body as any).version_id) {
    throw simpleError('invalid_version_id', 'Cannot set version to device, use channel instead')
  }

  // if channel set channel_override to it
  if (body.channel) {
    const supabase = supabaseApikey(c, apikey.key)
    // get channel by name
    const { data: dataChannel, error: dbError } = await supabase
      .from('channels')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
      .single()
    if (dbError || !dataChannel) {
      throw quickError(404, 'channel_not_found', 'Cannot find channel', { dbError })
    }

    if (dataChannel.public) {
      throw simpleError('public_channel_override', 'Cannot set channel override for public channel')
    }
    const { error: channelDeviceError } = await updateOrCreateChannelDevice(c, {
      device_id: body.device_id,
      channel_id: dataChannel.id,
      app_id: body.app_id,
      owner_org: dataChannel.owner_org,
    })
    if (channelDeviceError) {
      throw quickError(500, 'channel_device_error', 'Error setting channel override', { channelDeviceError })
    }
    const pluginVersion = await getDevicePluginVersion(c, supabase, body.app_id, body.device_id)
    if (shouldSyncChannelSelfOverrideForPluginVersion(pluginVersion)) {
      if (!(await syncChannelSelfOverride(c, {
        device_id: body.device_id,
        channel_id: dataChannel.id,
        app_id: body.app_id,
        plugin_version: pluginVersion,
      }))) {
        throw quickError(500, 'channel_self_store_error', 'Error syncing channel override store')
      }
    }
  }
  return c.json(BRES)
}
