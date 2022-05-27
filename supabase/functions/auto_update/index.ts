import { serve } from 'https://deno.land/std@0.139.0/http/server.ts'
import * as semver from 'https://deno.land/x/semver/mod.ts'
import { supabaseAdmin, updateOrCreateDevice } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'

interface Channel {
  version: definitions['app_versions']
}
interface ChannelDev {
  channel_id: Channel
}

serve(async(event: Request) => {
  const supabase = supabaseAdmin
  let cap_version_name = event.headers.get('cap_version_name')
  let cap_plugin_version = event.headers.get('cap_plugin_version')
  const cap_platform = event.headers.get('cap_version_name')
  const cap_app_id = event.headers.get('cap_version_name')
  const cap_device_id = event.headers.get('cap_version_name')
  const cap_version_build = event.headers.get('cap_version_name')

  cap_version_name = cap_version_name === 'builtin' ? cap_version_build : cap_version_name
  cap_plugin_version = cap_plugin_version || '2.3.3'

  try {
    if (!cap_app_id || !cap_device_id || !cap_version_build || !cap_version_name || !cap_platform) {
      console.error('Cannot get all headers', cap_platform,
        cap_app_id,
        cap_device_id,
        cap_version_build,
        cap_version_name)
      return sendRes({ message: 'missing appid' }, 400)
    }
    // eslint-disable-next-line no-console
    console.log('Headers', cap_platform,
      cap_app_id,
      cap_device_id,
      cap_version_build,
      cap_plugin_version,
      cap_version_name)

    const { data: channels, error: dbError } = await supabase
      .from<definitions['channels'] & Channel>('channels')
      .select(`
            id,
            created_at,
            name,
            app_id,
            beta,
            disableAutoUpdateUnderNative,
            disableAutoUpdateToMajor,
            version (
              id,
              name,
              user_id,
              bucket_id,
              external_url
            )
          `)
      .eq('app_id', cap_app_id)
      .eq('public', true)
    const { data: channelsBeta, error: dbBetaError } = await supabase
      .from<definitions['channels'] & Channel>('channels')
      .select(`
            id,
            created_at,
            name,
            app_id,
            beta,
            disableAutoUpdateUnderNative,
            disableAutoUpdateToMajor,
            version (
              id,
              name,
              user_id,
              bucket_id,
              external_url
            )
          `)
      .eq('app_id', cap_app_id)
      .eq('beta', true)
    const { data: channelOverride } = await supabase
      .from<definitions['channel_devices'] & ChannelDev>('channel_devices')
      .select(`
            device_id,
            app_id,
            channel_id (
              name,
              version (
                id,
                name,
                user_id,
                bucket_id,
                external_url
              )
            ),
            created_at,
            updated_at
          `)
      .eq('device_id', cap_device_id)
      .eq('app_id', cap_app_id)
    const { data: devicesOverride } = await supabase
      .from<definitions['devices_override'] & Channel>('devices_override')
      .select(`
            device_id,
            app_id,
            created_at,
            updated_at,
            version (
              id,
              name,
              user_id,
              bucket_id,
              external_url
            )
          `)
      .eq('device_id', cap_device_id)
      .eq('app_id', cap_app_id)
    if (dbError || dbBetaError || !channels || !channels.length) {
      console.error('Cannot get channel', dbError || dbBetaError || 'no channel')
      return sendRes({
        message: 'Cannot get channel',
        err: JSON.stringify(dbError),
      }, 200)
    }
    const channel = channels[0]
    let version: definitions['app_versions'] = channel.version as definitions['app_versions']
    if (channelsBeta && channelsBeta.length && semver.prerelease(cap_version_build)) {
      // eslint-disable-next-line no-console
      console.log('Set Beta channel', channelsBeta[0].version.name)
      version = channelsBeta[0].version as definitions['app_versions']
    }
    if (channelOverride && channelOverride.length) {
      // eslint-disable-next-line no-console
      console.log('Set channel override', channelOverride[0].channel_id.version.name)
      version = channelOverride[0].channel_id.version as definitions['app_versions']
    }
    if (devicesOverride && devicesOverride.length) {
      // eslint-disable-next-line no-console
      console.log('Set device override', devicesOverride[0].version.name)
      version = devicesOverride[0].version as definitions['app_versions']
    }

    if (!version.bucket_id && !version.external_url) {
      console.error('Cannot get zip file')
      return sendRes({
        message: 'Cannot get zip file',
      }, 200)
    }
    await updateOrCreateDevice({
      app_id: cap_app_id,
      device_id: cap_device_id,
      platform: cap_platform as definitions['devices']['platform'],
      plugin_version: cap_plugin_version,
      version: version.id,
    })
    let signedURL = version.external_url || ''
    if (version.bucket_id && !version.external_url) {
      const res = await supabase
        .storage
        .from(`apps/${version.user_id}/${cap_app_id}/versions`)
        .createSignedUrl(version.bucket_id, 60)
      if (res && res.signedURL)
        signedURL = res.signedURL
    }

    if (cap_version_name === version.name) {
      return sendRes({
        message: 'No new version available',
      }, 200)
    }
    if (channel.disableAutoUpdateToMajor && semver.major(version.name) > semver.major(cap_version_name)) {
      return sendRes({
        major: true,
        message: 'Cannot upgrade major version',
        version: version.name,
        old: cap_version_name,
      }, 200)
    }
    if (channel.disableAutoUpdateUnderNative && semver.lt(version.name, cap_version_build)) {
      return sendRes({
        message: 'Cannot revert under native version',
        version: version.name,
        old: cap_version_name,
      }, 200)
    }
    // eslint-disable-next-line no-console
    console.log('New version available', version.name, signedURL)
    return sendRes({
      version: version.name,
      url: signedURL,
    })
  }
  catch (e) {
    console.error('error', e)
    return sendRes({
      message: 'Cannot get latest version',
      err: `${e}!`,
    }, 500)
  }
})
