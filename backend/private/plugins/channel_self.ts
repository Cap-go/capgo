// channel self old function
import * as semver from 'https://deno.land/x/semver@v1.4.1/mod.ts'
import { Hono } from 'https://deno.land/x/hono/mod.ts'
import { z } from 'https://deno.land/x/zod@v3.22.2/mod.ts'
import type { Context } from 'https://deno.land/x/hono/mod.ts'
import { sendDevice, sendStats, supabaseAdmin } from '../../_utils/supabase.ts'
import { BRES } from '../../_utils/hono.ts'
import type { AppInfos } from '../../_utils/types.ts'
import { INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, MISSING_STRING_APP_ID, MISSING_STRING_DEVICE_ID, MISSING_STRING_VERSION_BUILD, MISSING_STRING_VERSION_NAME, NON_STRING_APP_ID, NON_STRING_DEVICE_ID, NON_STRING_VERSION_BUILD, NON_STRING_VERSION_NAME, deviceIdRegex, reverseDomainRegex } from '../../_utils/utils.ts'
import { Database } from '~/types/supabase.types.ts'

interface DeviceLink extends AppInfos {
  channel?: string
}

const devicePlatformScheme = z.union([z.literal('ios'), z.literal('android')])

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
  platform: devicePlatformScheme,
}).passthrough().refine(data => reverseDomainRegex.test(data.app_id), {
  message: INVALID_STRING_APP_ID,
}).refine(data => deviceIdRegex.test(data.device_id), {
  message: INVALID_STRING_DEVICE_ID,
}).transform((val) => {
  if (val.version_name === 'builtin')
    val.version_name = val.version_build

  return val
})

async function post(body: DeviceLink, c: Context): Promise<Response> {
  console.log('body', body)
  const parseResult = jsonRequestSchema.safeParse(body)
  if (!parseResult.success) {
    console.error('Cannot parse json', { parseResult })
    return c.send({ error: `Cannot parse json: ${parseResult.error}` }, 400)
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
    return c.send({
      message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number`,
      error: 'semver_error',
    }, 400)
  }
  version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name

  const { data: version } = await supabaseAdmin(c)
    .from('app_versions')
    .select('id')
    .eq('app_id', app_id)
    .or(`name.eq.${version_name},name.eq.builtin`)
    .order('id', { ascending: false })
    .limit(1)
    .single()

  if (!version) {
    console.error('Cannot find version', { version_name })
    return c.send({
      message: `Version ${version_name} doesn't exist`,
      error: 'version_error',
    }, 400)
  }
  // find device

  await sendDevice(c, {
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

  const { data: dataChannelOverride } = await supabaseAdmin(c)
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
  if (!channel || (dataChannelOverride && !(dataChannelOverride?.channel_id as any as Database['public']['Tables']['channels']['Row']).allow_device_self_set)) {
    console.error('Cannot change device override current channel don\t allow it', { channel, dataChannelOverride })
    return c.send({
      message: 'Cannot change device override current channel don\t allow it',
      error: 'cannot_override',
    }, 400)
  }
  // if channel set channel_override to it
  if (channel) {
    // get channel by name
    const { data: dataChannel, error: dbError } = await supabaseAdmin(c)
      .from('channels')
      .select()
      .eq('app_id', app_id)
      .eq('name', channel)
      .eq('allow_device_self_set', true)
      .single()
    if (dbError || !dataChannel) {
      console.log(channel, app_id)
      console.error('Cannot find channel', { dbError, dataChannel })
      return c.send({
        message: `Cannot find channel ${JSON.stringify(dbError)}`,
        error: 'channel_not_found',
      }, 400)
    }

    // Get the main channel
    const { data: mainChannel, error: dbMainChannelError } = await supabaseAdmin(c)
      .from('channels')
      .select(`
        name, 
        ios, 
        android
      `)
      .eq('app_id', app_id)
      .eq('public', true)

    // We DO NOT return if there is no main channel as it's not a critical error
    // We will just set the channel_devices as the user requested
    let mainChannelName = null as string | null
    if (!dbMainChannelError) {
      const devicePlatform = parseResult.data.platform
      const finalChannel = mainChannel.find(channel => channel[devicePlatform] === true)
      mainChannelName = (finalChannel !== undefined) ? finalChannel.name : null
    }

    // const mainChannelName = (!dbMainChannelError && mainChannel) ? mainChannel.name : null
    if (dbMainChannelError || !mainChannel)
      console.error('Cannot find main channel', dbMainChannelError)

    if (mainChannelName && mainChannelName === channel) {
      const { error: dbErrorDev } = await supabaseAdmin(c)
        .from('channel_devices')
        .delete()
        .eq('app_id', app_id)
        .eq('device_id', device_id)
      if (dbErrorDev) {
        console.error('Cannot do channel override', { dbErrorDev })
        return c.send({
          message: `Cannot do channel override ${JSON.stringify(dbErrorDev)}`,
          error: 'override_not_allowed',
        }, 400)
      }
    }
    else {
      const { error: dbErrorDev } = await supabaseAdmin(c)
        .from('channel_devices')
        .upsert({
          device_id,
          channel_id: dataChannel.id,
          app_id,
          created_by: dataChannel.created_by,
        })
      if (dbErrorDev) {
        console.error('Cannot do channel override', { dbErrorDev })
        return c.send({
          message: `Cannot do channel override ${JSON.stringify(dbErrorDev)}`,
          error: 'override_not_allowed',
        }, 400)
      }
    }
  }
  await sendStats([{
    action: 'setChannel',
    platform: platform as Database['public']['Enums']['platform_os'],
    device_id,
    app_id,
    version_build,
    version: version.id,
  }], c)
  return c.send(BRES)
}

async function put(body: DeviceLink, c: Context): Promise<Response> {
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
    return c.send({
      message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number`,
      error: 'semver_error',
    }, 400)
  }
  version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name
  if (!device_id || !app_id) {
    console.error('Cannot find device_id or appi_id', { device_id, app_id, body })
    return c.send({ message: 'Cannot find device_id or appi_id', error: 'missing_info' }, 400)
  }

  const { data: version } = await supabaseAdmin(c)
    .from('app_versions')
    .select('id')
    .eq('app_id', app_id)
    .or(`name.eq.${version_name},name.eq.builtin`)
    .order('id', { ascending: false })
    .limit(1)
    .single()

  if (!version) {
    console.error('Cannot find version', { version_name })
    return c.send({
      message: `Version ${version_name} doesn't exist`,
      error: 'version_error',
    }, 400)
  }
  await sendDevice(c, {
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
  const { data: dataChannel, error: errorChannel } = await supabaseAdmin(c)
    .from('channels')
    .select()
    .eq('app_id', app_id)
    .eq('public', true)

  const { data: dataChannelOverride } = await supabaseAdmin(c)
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
    const channelId = dataChannelOverride.channel_id as any as Database['public']['Tables']['channels']['Row']

    return c.send({
      channel: channelId.name,
      status: 'override',
      allowSet: channelId.allow_device_self_set,
    })
  }
  if (errorChannel)
    console.error('Cannot find channel default', { errorChannel })
  if (dataChannel) {
    await sendStats([{
      action: 'getChannel',
      platform: platform as Database['public']['Enums']['platform_os'],
      device_id,
      app_id,
      version_build,
      version: version.id,
    }], c)

    const devicePlatform = devicePlatformScheme.safeParse(platform)
    if (!devicePlatform.success) {
      return c.send({
        message: 'Invalid device platform',
        error: 'invalid_platform',
      }, 400)
    }

    const finalChannel = dataChannel.find(channel => channel[devicePlatform.data] === true)

    if (!finalChannel) {
      console.error('Cannot find channel', { dataChannel, errorChannel })
      return c.send({
        message: 'Cannot find channel',
        error: 'channel_not_found',
      }, 400)
    }

    return c.send({
      channel: finalChannel.name,
      status: 'default',
    })
  }
  console.error('Cannot find channel', { dataChannel, errorChannel })
  return c.send({
    message: 'Cannot find channel',
    error: 'channel_not_found',
  }, 400)
}

async function deleteOverride(body: DeviceLink, c: Context): Promise<Response> {
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
    return c.send({
      message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number`,
      error: 'semver_error',
    }, 400)
  }

  if (!device_id || !app_id) {
    console.error('Cannot find device_id or appi_id', { device_id, app_id, body })
    return c.send({ message: 'Cannot find device_id or appi_id', error: 'missing_info' }, 400)
  }
  const { data: dataChannelOverride } = await supabaseAdmin(c)
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
  if (!dataChannelOverride || !dataChannelOverride.channel_id || !(dataChannelOverride?.channel_id as any as Database['public']['Tables']['channels']['Row']).allow_device_self_set) {
    console.error('Cannot change device override current channel don\t allow it', { dataChannelOverride })
    return c.send({
      message: 'Cannot change device override current channel don\t allow it',
      error: 'cannot_override',
    }, 400)
  }
  const { error } = await supabaseAdmin(c)
    .from('channel_devices')
    .delete()
    .eq('app_id', app_id)
    .eq('device_id', device_id)
  if (error) {
    console.error('Cannot delete channel override', { error })
    return c.send({
      message: `Cannot delete channel override ${JSON.stringify(error)}`,
      error: 'override_not_allowed',
    }, 400)
  }
  return c.send(BRES)
}

export const app = new Hono()

app.post('/', async (c: Context) => {
  try {
    const body = await c.req.json<DeviceLink>()
    console.log('body', body)
    return post(body, c)
  } catch (e) {
    return c.send({ status: 'Cannot post bundle', error: JSON.stringify(e) }, 500)
  }
})

app.put('/', async (c: Context) => {
  try {
    const body = await c.req.json<DeviceLink>()
    console.log('body', body)
    return put(body, c)
  } catch (e) {
    return c.send({ status: 'Cannot get bundle', error: JSON.stringify(e) }, 500) 
  }
})

app.delete('/', async (c: Context) => {
  try {
    const body = await c.req.json<DeviceLink>()
    console.log('body', body)
    return deleteOverride(body, c)
  } catch (e) {
    return c.send({ status: 'Cannot delete bundle', error: JSON.stringify(e) }, 500)
  }
})
