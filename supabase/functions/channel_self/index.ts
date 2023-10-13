import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'
import * as semver from 'https://deno.land/x/semver@v1.4.1/mod.ts'
import z from 'https://deno.land/x/zod@v3.22.2/index.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { sendDevice, sendStats, supabaseAdmin } from '../_utils/supabase.ts'
import type { AppInfos, BaseHeaders } from '../_utils/types.ts'
import { INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, MISSING_STRING_APP_ID, MISSING_STRING_DEVICE_ID, MISSING_STRING_VERSION_BUILD, MISSING_STRING_VERSION_NAME, NON_STRING_APP_ID, NON_STRING_DEVICE_ID, NON_STRING_VERSION_BUILD, NON_STRING_VERSION_NAME, deviceIdRegex, methodJson, reverseDomainRegex, sendRes } from '../_utils/utils.ts'
import { redisDeviceInvalidate } from '../_utils/redis.ts'

interface DeviceLink extends AppInfos {
  channel?: string
}

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
  is_prod: z.boolean().default(true),
}).refine(data => reverseDomainRegex.test(data.app_id), {
  message: INVALID_STRING_APP_ID,
}).refine(data => deviceIdRegex.test(data.device_id), {
  message: INVALID_STRING_DEVICE_ID,
}).transform((val) => {
  if (val.version_name === 'builtin')
    val.version_name = val.version_build

  return val
})

async function post(body: DeviceLink): Promise<Response> {
  console.log('body', body)
  const parseResult: any = jsonRequestSchema.safeParse(body)
  if (!parseResult.success) {
    console.error('Cannot parse json', { parseResult })
    return sendRes({ error: `Cannot parse json: ${parseResult.error}` }, 400)
  }

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
    console.error('Cannot find version', { version_build })
    return sendRes({
      message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number`,
      error: 'semver_error',
    }, 400)
  }
  version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name

  if (!device_id || !app_id) {
    console.error('Cannot find device_id or appi_id', { device_id, app_id, body })
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
    console.error('Cannot find version', { version_name })
    return sendRes({
      message: `Version ${version_name} doesn't exist`,
      error: 'version_error',
    }, 400)
  }
  // find device

  await sendDevice({
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
  })

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
    console.error('Cannot change device override current channel don\t allow it', { channel, dataChannelOverride })
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
    if (dbError || !dataChannel) {
      console.error('Cannot find channel', { dbError, dataChannel })
      return sendRes({
        message: `Cannot find channel ${JSON.stringify(dbError)}`,
        error: 'channel_not_found',
      }, 400)
    }

    const { error: dbErrorDev } = await supabaseAdmin()
      .from('channel_devices')
      .upsert({
        device_id,
        channel_id: dataChannel.id,
        app_id,
        created_by: dataChannel.created_by,
      })
    if (dbErrorDev) {
      console.error('Cannot do channel override', { dbErrorDev })
      return sendRes({
        message: `Cannot do channel override ${JSON.stringify(dbErrorDev)}`,
        error: 'override_not_allowed',
      }, 400)
    }
  }
  await sendStats([{
    action: 'setChannel',
    platform: platform as Database['public']['Enums']['platform_os'],
    device_id,
    app_id,
    version_build,
    version: version.id,
  }])
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
  if (coerce) {
    version_build = coerce.version
  }
  else {
    console.error('Cannot find version', { version_build })
    return sendRes({ message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number` }, 400)
  }
  version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name
  if (!device_id || !app_id) {
    console.error('Cannot find device_id or appi_id', { device_id, app_id, body })
    return sendRes({ message: 'Cannot find device_id or appi_id', error: 'missing_info' }, 400)
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
    console.error('Cannot find version', { version_name })
    return sendRes({
      message: `Version ${version_name} doesn't exist`,
      error: 'version_error',
    }, 400)
  }
  await sendDevice({
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
  })
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

    await redisDeviceInvalidate(app_id, device_id)
    return sendRes({
      channel: channelId.name,
      status: 'override',
      allowSet: channelId.allow_device_self_set,
    })
  }
  if (errorChannel) {
    console.error('Cannot find channel', { errorChannel })
    return sendRes({
      message: `Cannot find channel ${JSON.stringify(errorChannel)}`,
      error: 'channel_not_found',
    }, 400)
  }
  else if (dataChannel) {
    await sendStats([{
      action: 'getChannel',
      platform: platform as Database['public']['Enums']['platform_os'],
      device_id,
      app_id,
      version_build,
      version: version.id,
    }])
    return sendRes({
      channel: dataChannel.name,
      status: 'default',
    })
  }
  console.error('Cannot find channel', { dataChannel, errorChannel })
  return sendRes({
    message: 'Cannot find channel',
    error: 'channel_not_found',
  }, 400)
}

async function deleteOverride(body: DeviceLink): Promise<Response> {
  console.log('body', body)
  let {
    version_build,
  } = body
  const {
    app_id,
    device_id,
  } = body
  const coerce = semver.coerce(version_build)
  if (coerce) {
    version_build = coerce.version
  }
  else {
    console.error('Cannot find version', { version_build })
    return sendRes({
      message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number`,
      error: 'semver_error',
    }, 400)
  }

  if (!device_id || !app_id) {
    console.error('Cannot find device_id or appi_id', { device_id, app_id, body })
    return sendRes({
      message: 'Cannot find device_id or appi_id',
      error: 'missing_info',
    }, 400)
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
  if (!dataChannelOverride || !dataChannelOverride.channel_id || !(dataChannelOverride?.channel_id as Database['public']['Tables']['channels']['Row']).allow_device_self_set) {
    console.error('Cannot change device override current channel don\t allow it', { dataChannelOverride })
    return sendRes({
      message: 'Cannot change device override current channel don\t allow it',
      error: 'cannot_override',
    }, 400)
  }
  const { error } = await supabaseAdmin()
    .from('channel_devices')
    .delete()
    .eq('app_id', app_id)
    .eq('device_id', device_id)
  if (error) {
    console.error('Cannot delete channel override', { error })
    return sendRes({
      message: `Cannot delete channel override ${JSON.stringify(error)}`,
      error: 'override_not_allowed',
    }, 400)
  }
  await redisDeviceInvalidate(app_id, device_id)
  return sendRes()
}
function main(url: URL, headers: BaseHeaders, method: string, body: any) {
  try {
    if (method === 'POST')
      return post(body)
    else if (method === 'PUT')
      return put(body)
    else if (method === 'DELETE')
      return deleteOverride(body)
  }
  catch (error) {
    console.error('Error', { error })
    return sendRes({ message: `Error ${JSON.stringify(error)}`, error: 'general_error' }, 400)
  }
  console.error('Method now allowed', { method })
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
