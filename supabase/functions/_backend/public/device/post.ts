import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import type { DeviceLink } from './delete.ts'
import { BRES, quickError, simpleError } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseAdmin, updateOrCreateChannelDevice } from '../../utils/supabase.ts'

export async function post(c: Context<MiddlewareKeyVariables, any, object>, body: DeviceLink, apikey: Database['public']['Tables']['apikeys']['Row']) {
  if (!body.device_id || !body.app_id) {
    throw simpleError('missing_device_id_or_app_id', 'Missing device_id or app_id', { body })
  }

  if (!(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'write', apikey.key))) {
    throw simpleError('invalid_app_id', 'You can\'t access this app', { app_id: body.app_id })
  }

  if ((body as any).version_id) {
    throw simpleError('invalid_version_id', 'Cannot set version to device, use channel instead')
  }

  // if channel set channel_override to it
  if (body.channel) {
    // get channel by name
    const { data: dataChannel, error: dbError } = await supabaseAdmin(c)
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
    await updateOrCreateChannelDevice(c, {
      device_id: body.device_id,
      channel_id: dataChannel.id,
      app_id: body.app_id,
      owner_org: dataChannel.owner_org,
    })
  }
  return c.json(BRES)
}
