import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'
import * as semver from 'https://deno.land/x/semver@v1.4.1/mod.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { sendStats, supabaseAdmin, updateOrCreateDevice } from '../_utils/supabase.ts'
import type { AppInfos, BaseHeaders } from '../_utils/types.ts'
import { methodJson, sendRes } from '../_utils/utils.ts'

interface DeviceLink extends AppInfos {
  channel?: string
}

async function post(body: DeviceLink): Promise<Response> {
  console.log('body', body)
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
  const coerce = semver.coerce(version_build)
  if (coerce) {
    version_build = coerce.version
  }
  else {
    return sendRes({
      message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number`,
      error: 'semver_error',
    }, 400)
  }
  version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name

  if (!device_id || !app_id) {
    return sendRes({
      message: 'Cannot find device_id or appi_id',
      error: 'missing_info',
    }, 400)
  }
  const { data: version } = await supabaseAdmin()
    .from('app_versions')
    .select('id')
    .eq('app_id', app_id)
    .or(`name.eq.${version_name},name.eq.builtin`)
    .order('id', { ascending: false })
    .limit(1)
    .single()

  if (!version) {
    return sendRes({
      message: `Version ${version_name} doesn't exist`,
      error: 'version_error',
    }, 400)
  }
  // find device
  const { data: dataDevice } = await supabaseAdmin()
    .from('devices')
    .select()
    .eq('app_id', app_id)
    .eq('device_id', device_id)
    .single()
  if (!dataDevice) {
    if (!dataDevice) {
      await updateOrCreateDevice({
        app_id,
        device_id,
        plugin_version,
        version: version.id,
        ...(custom_id != null ? { custom_id } : {}),
        ...(is_emulator != null ? { is_emulator } : {}),
        ...(is_prod != null ? { is_prod } : {}),
        version_build,
        os_version: version_os,
        platform: platform as Database['public']['Enums']['platform_os'],
        updated_at: new Date().toISOString(),
      })
    }
  }
  const { data: dataChannelOverride } = await supabaseAdmin()
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
  if (!channel || (dataChannelOverride && !(dataChannelOverride?.channel_id as Database['public']['Tables']['channels']['Row']).allow_device_self_set)) {
    return sendRes({
      message: 'Cannot change device override current channel don\t allow it',
      error: 'cannot_override',
    }, 400)
  }
  // if channel set channel_override to it
  if (channel) {
    // get channel by name
    const { data: dataChannel, error: dbError } = await supabaseAdmin()
      .from('channels')
      .select()
      .eq('app_id', app_id)
      .eq('name', channel)
      .eq('allow_device_self_set', true)
      .single()
    if (dbError || !dataChannel)
      return sendRes({ message: `Cannot find channel ${JSON.stringify(dbError)}`, error: 'channel_not_found' }, 400)

    const { error: dbErrorDev } = await supabaseAdmin()
      .from('channel_devices')
      .upsert({
        device_id,
        channel_id: dataChannel.id,
        app_id,
        created_by: dataChannel.created_by,
      })
    if (dbErrorDev)
      return sendRes({ message: `Cannot do channel override ${JSON.stringify(dbErrorDev)}`, error: 'override_not_allowed' }, 400)
  }
  await sendStats('setChannel', platform, device_id, app_id, version_build, version.id)
  return sendRes()
}

async function put(body: DeviceLink): Promise<Response> {
  console.log('body', body)
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
  const coerce = semver.coerce(version_build)
  if (coerce)
    version_build = coerce.version
  else
    return sendRes({ message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number` }, 400)
  version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name
  if (!device_id || !app_id)
    return sendRes({ message: 'Cannot find device_id or appi_id', error: 'missing_info' }, 400)

  const { data: version } = await supabaseAdmin()
    .from('app_versions')
    .select('id')
    .eq('app_id', app_id)
    .or(`name.eq.${version_name},name.eq.builtin`)
    .order('id', { ascending: false })
    .limit(1)
    .single()

  if (!version) {
    return sendRes({
      message: `Version ${version_name} doesn't exist`,
      error: 'version_error',
    }, 400)
  }
  // find device
  const { data: dataDevice } = await supabaseAdmin()
    .from('devices')
    .select()
    .eq('app_id', app_id)
    .eq('device_id', device_id)
    .single()
  if (!dataDevice) {
    if (!dataDevice) {
      await updateOrCreateDevice({
        app_id,
        device_id,
        plugin_version,
        version: version.id,
        ...(custom_id != null ? { custom_id } : {}),
        ...(is_emulator != null ? { is_emulator } : {}),
        ...(is_prod != null ? { is_prod } : {}),
        version_build,
        os_version: version_os,
        platform: platform as Database['public']['Enums']['platform_os'],
        updated_at: new Date().toISOString(),
      })
    }
  }
  const { data: dataChannel, error: errorChannel } = await supabaseAdmin()
    .from('channels')
    .select()
    .eq('app_id', app_id)
    .eq('public', true)
    .single()
  const { data: dataChannelOverride } = await supabaseAdmin()
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
  if (dataChannelOverride && dataChannelOverride.channel_id) {
    const channelId = dataChannelOverride.channel_id as Database['public']['Tables']['channels']['Row']

    return sendRes({
      channel: channelId.name,
      status: 'override',
      allowSet: channelId.allow_device_self_set,
    })
  }
  if (errorChannel) {
    return sendRes({
      message: `Cannot find channel ${JSON.stringify(errorChannel)}`,
      error: 'channel_not_found',
    }, 400)
  }
  else if (dataChannel) {
    await sendStats('getChannel', platform, device_id, app_id, version_build, version.id)
    return sendRes({
      channel: dataChannel.name,
      status: 'default',
    })
  }
  return sendRes({
    message: 'Cannot find channel',
    error: 'channel_not_found',
  }, 400)
}

function main(url: URL, headers: BaseHeaders, method: string, body: any) {
  try {
    if (method === 'POST')
      return post(body)
    else if (method === 'PUT')
      return put(body)
  }
  catch (error) {
    return sendRes({ message: `Error ${JSON.stringify(error)}`, error: 'general_error' }, 400)
  }
  return sendRes({ message: 'Method now allowed', error: 'not_allowed' }, 400)
}

serve(async (event: Request) => {
  try {
    const url: URL = new URL(event.url)
    const headers: BaseHeaders = Object.fromEntries(event.headers.entries())
    const method: string = event.method
    const body: any = methodJson.includes(method) ? await event.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})
