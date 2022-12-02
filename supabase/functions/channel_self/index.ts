import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import { sendStats, supabaseAdmin } from '../_utils/supabase.ts'
import type { AppInfos } from '../_utils/types.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'

interface DeviceLink extends AppInfos {
  channel?: string
}

interface DeviceChannel {
  channel_id: definitions['channels']
}

const post = async (event: Request): Promise<Response> => {
  const body = await event.json() as DeviceLink
  if (!body.device_id || !body.app_id) {
    console.log('Cannot find device_id or appi_id')
    return sendRes({ status: 'Cannot find device_id or appi_id' }, 400)
  }
  // find device
  const { data: dataDevice, error: dbError } = await supabaseAdmin()
    .from<definitions['devices']>('devices')
    .select()
    .eq('app_id', body.app_id)
    .eq('device_id', body.device_id)
    .single()
  const { data: dataChannelOverride } = await supabaseAdmin()
    .from<definitions['channel_devices'] & DeviceChannel>('channel_devices')
    .select(`
      channel_id (
        allow_device_self_set,
        name
      ),
    `)
    .eq('app_id', body.app_id)
    .eq('device_id', body.device_id)
    .single()
  if (dbError || !dataDevice) {
    console.log('Cannot find device', body, dbError)
    return sendRes({ status: 'Cannot find device', error: dbError }, 400)
  }
  if (!body.channel || (dataChannelOverride && !dataChannelOverride?.channel_id.allow_device_self_set))
    return sendRes({ status: 'Nothing to update' }, 400)
  // if channel set channel_override to it
  if (body.channel) {
    // get channel by name
    const { data: dataChannel, error: dbError } = await supabaseAdmin()
      .from<definitions['channels']>('channels')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
      .eq('allow_device_self_set', true)
      .single()
    if (dbError || !dataChannel) {
      console.log('Cannot find channel', dbError)
      return sendRes({ status: 'Cannot find channel', error: dbError }, 400)
    }
    const { data: dataChannelDev, error: dbErrorDev } = await supabaseAdmin()
      .from<definitions['channel_devices']>('channel_devices')
      .upsert({
        device_id: body.device_id,
        channel_id: dataChannel.id,
        app_id: body.app_id,
        created_by: dataChannel.created_by,
      })
    if (dbErrorDev || !dataChannelDev) {
      console.log('Cannot do channel override', dbErrorDev)
      return sendRes({ status: 'Cannot do channel override', error: dbErrorDev }, 400)
    }
  }
  const { data: dataVersion, error: errorVersion } = await supabaseAdmin()
    .from<definitions['app_versions']>('app_versions')
    .select()
    .eq('app_id', body.app_id)
    .eq('name', body.version_name || 'unknown')
    .single()
  if (dataVersion && !errorVersion)
    await sendStats('setChannel', body.platform, body.device_id, body.app_id, body.version_build, dataVersion.id)
  else
    console.log('Cannot find app version', errorVersion)
  return sendRes()
}

const put = async (event: Request): Promise<Response> => {
  const body = await event.json() as DeviceLink
  if (!body.device_id || !body.app_id) {
    console.log('Cannot find device or appi_id')
    return sendRes({ status: 'Cannot find device' }, 400)
  }
  const { data: dataChannel, error: errorChannel } = await supabaseAdmin()
    .from<definitions['channels'] & DeviceChannel>('channels')
    .select()
    .eq('app_id', body.app_id)
    .eq('public', true)
    .single()
  const { data: dataChannelOverride, error } = await supabaseAdmin()
    .from<definitions['channel_devices'] & DeviceChannel>('channel_devices')
    .select(`
      channel_id (
        allow_device_self_set,
        name
      ),
    `)
    .eq('app_id', body.app_id)
    .eq('device_id', body.device_id)
    .single()
  if (error) {
    return sendRes({
      error,
    }, 400)
  }
  else if (dataChannelOverride && dataChannelOverride.channel_id) {
    return sendRes({
      channel: dataChannelOverride.channel_id.name,
      status: 'override',
      allowSet: dataChannelOverride.channel_id.allow_device_self_set,
    })
  }
  if (errorChannel) {
    return sendRes({
      error,
    }, 400)
  }
  else if (dataChannel) {
    const { data: dataVersion, error: errorVersion } = await supabaseAdmin()
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.version_name || 'unknown')
      .single()
    if (dataVersion && !errorVersion)
      await sendStats('getChannel', body.platform, body.device_id, body.app_id, body.version_build, dataVersion.id)
    else
      console.log('Cannot find app version', errorVersion)
    return sendRes({
      channel: dataChannel.name,
      status: 'default',
    })
  }
  return sendRes({
    error: 'no channel',
  }, 400)
}

serve((event: Request) => {
  const api_mode_string = event.headers.get('api_mode')

  if (api_mode_string === 'POST' || (!api_mode_string && event.method === 'POST'))
    return post(event)
  else if (api_mode_string === 'PUT' || (!api_mode_string && event.method === 'PUT'))
    return put(event)
  console.log('Method not allowed')
  return sendRes({ status: 'Method now allowed' }, 400)
})
