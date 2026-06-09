import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { type } from 'arktype'
import { Hono } from 'hono/tiny'
import { safeParseSchema } from '../utils/ark_validation.ts'
import { shouldSyncChannelSelfOverrideForPluginVersion, syncChannelSelfOverride, syncChannelSelfOverrideDelete } from '../utils/channelSelfStore.ts'
import { BRES, parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { checkPermission } from '../utils/rbac.ts'
import { supabaseWithAuth } from '../utils/supabase.ts'
import { isValidAppId } from '../utils/utils.ts'

const setBodySchema = type({
  app_id: 'string',
  device_id: 'string.uuid',
  channel_id: 'number.integer >= 1',
})

const deleteBodySchema = type({
  app_id: 'string',
  device_id: 'string.uuid',
})

interface SetChannelDeviceBody {
  app_id: string
  device_id: string
  channel_id: number
}

interface DeleteChannelDeviceBody {
  app_id: string
  device_id: string
}

type ChannelRow = Pick<Database['public']['Tables']['channels']['Row'], 'id' | 'app_id' | 'owner_org' | 'public'>
type PrivateDeviceClient = ReturnType<typeof supabaseWithAuth>

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

async function requireManageDevices(c: Context<MiddlewareKeyVariables>, appId: string) {
  if (!isValidAppId(appId)) {
    throw simpleError('invalid_app_id', 'App ID must be a reverse domain string', { app_id: appId })
  }

  if (!(await checkPermission(c, 'app.manage_devices', { appId }))) {
    quickError(403, 'permission_denied', 'Permission denied: app.manage_devices', { appId })
  }
}

async function getWritableChannel(c: Context<MiddlewareKeyVariables>, body: SetChannelDeviceBody): Promise<ChannelRow> {
  const supabase = supabaseWithAuth(c, c.get('auth')!)
  const { data: channel, error } = await supabase
    .from('channels')
    .select('id, app_id, owner_org, public')
    .eq('app_id', body.app_id)
    .eq('id', body.channel_id)
    .single()

  if (error || !channel) {
    quickError(404, 'channel_not_found', 'Cannot find channel', { appId: body.app_id, channelId: body.channel_id, error })
  }

  if (channel.public) {
    throw simpleError('public_channel_override', 'Cannot set channel override for public channel')
  }

  return channel
}

async function getDevicePluginVersion(c: Context<MiddlewareKeyVariables>, supabase: PrivateDeviceClient, appId: string, deviceId: string) {
  const { data, error } = await supabase
    .from('devices')
    .select('plugin_version')
    .eq('app_id', appId)
    .eq('device_id', deviceId.toLowerCase())
    .maybeSingle()

  if (error) {
    quickError(500, 'device_error', 'Error reading device plugin version', { error, app_id: appId, device_id: deviceId })
  }

  return data?.plugin_version ?? null
}

export async function setChannelDeviceOverride(c: Context<MiddlewareKeyVariables>, body: SetChannelDeviceBody) {
  await requireManageDevices(c, body.app_id)

  const channel = await getWritableChannel(c, body)
  const supabase = supabaseWithAuth(c, c.get('auth')!)
  const override = {
    app_id: body.app_id,
    channel_id: channel.id,
    device_id: body.device_id.toLowerCase(),
    owner_org: channel.owner_org,
  }

  const { error } = await supabase
    .from('channel_devices')
    .upsert(override, { onConflict: 'app_id,device_id' })

  if (error) {
    quickError(500, 'channel_device_error', 'Error setting channel override', { error })
  }

  const pluginVersion = await getDevicePluginVersion(c, supabase, body.app_id, body.device_id)
  if (shouldSyncChannelSelfOverrideForPluginVersion(pluginVersion)) {
    if (!(await syncChannelSelfOverride(c, {
      ...override,
      plugin_version: pluginVersion,
    }))) {
      quickError(500, 'channel_self_store_error', 'Error syncing channel override store')
    }
  }

  return c.json(BRES)
}

export async function deleteChannelDeviceOverride(c: Context<MiddlewareKeyVariables>, body: DeleteChannelDeviceBody) {
  await requireManageDevices(c, body.app_id)

  const supabase = supabaseWithAuth(c, c.get('auth')!)
  const pluginVersion = await getDevicePluginVersion(c, supabase, body.app_id, body.device_id)
  const { error } = await supabase
    .from('channel_devices')
    .delete()
    .eq('device_id', body.device_id.toLowerCase())
    .eq('app_id', body.app_id)

  if (error) {
    quickError(500, 'channel_device_error', 'Error deleting channel override', { error })
  }

  if (shouldSyncChannelSelfOverrideForPluginVersion(pluginVersion)) {
    if (!(await syncChannelSelfOverrideDelete(c, body.app_id, body.device_id, pluginVersion))) {
      quickError(500, 'channel_self_store_error', 'Error syncing channel override store')
    }
  }

  return c.json(BRES)
}

app.post('/', middlewareV2(['all', 'write']), async (c) => {
  const body = await parseBody<SetChannelDeviceBody>(c)
  const parsedBodyResult = safeParseSchema(setBodySchema, body)
  if (!parsedBodyResult.success) {
    throw simpleError('invalid_json_body', 'Invalid JSON body', { body, parsedBodyResult })
  }

  return setChannelDeviceOverride(c, parsedBodyResult.data)
})

app.delete('/', middlewareV2(['all', 'write']), async (c) => {
  const body = await parseBody<DeleteChannelDeviceBody>(c)
  const parsedBodyResult = safeParseSchema(deleteBodySchema, body)
  if (!parsedBodyResult.success) {
    throw simpleError('invalid_json_body', 'Invalid JSON body', { body, parsedBodyResult })
  }

  return deleteChannelDeviceOverride(c, parsedBodyResult.data)
})
