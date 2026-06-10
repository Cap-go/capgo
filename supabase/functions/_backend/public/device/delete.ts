import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { syncLegacyChannelSelfOverrideDeleteForDevice } from '../../utils/channelSelfStore.ts'
import { BRES, quickError, simpleError } from '../../utils/hono.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseApikey } from '../../utils/supabase.ts'
import { isValidAppId } from '../../utils/utils.ts'

export interface DeviceLink {
  app_id: string
  device_id: string
  channel?: string
}

export async function deleteOverride(c: Context, body: DeviceLink, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id) {
    throw simpleError('missing_app_id', 'Missing app_id', { body })
  }
  if (!body.device_id) {
    throw simpleError('missing_device_id', 'Missing device_id', { body })
  }
  if (!isValidAppId(body.app_id)) {
    throw simpleError('invalid_app_id', 'App ID must be a reverse domain string', { app_id: body.app_id })
  }
  // Auth context is already set by middlewareKey
  if (!(await checkPermission(c, 'app.manage_devices', { appId: body.app_id }))) {
    throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id })
  }

  const supabase = supabaseApikey(c, apikey.key)
  const { error: errorChannel } = await supabase
    .from('channel_devices')
    .delete()
    .eq('app_id', body.app_id)
    .eq('device_id', body.device_id)
  if (errorChannel) {
    throw simpleError('invalid_app_id', 'You can\'t access this app', { app_id: body.app_id })
  }
  if (!(await syncLegacyChannelSelfOverrideDeleteForDevice(c, supabase, body.app_id, body.device_id))) {
    throw quickError(500, 'channel_self_store_error', 'Error syncing channel override store', { app_id: body.app_id, device_id: body.device_id })
  }
  return c.json(BRES)
}
