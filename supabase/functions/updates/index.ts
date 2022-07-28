import { serve } from 'https://deno.land/std@0.149.0/http/server.ts'
import * as semver from 'https://deno.land/x/semver/mod.ts'
import { sendRes } from '../_utils/utils.ts'
import { isGoodPlan, isTrial, sendStats, supabaseAdmin, updateOrCreateDevice } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'

interface Channel {
  version: definitions['app_versions']
}
interface ChannelDev {
  channel_id: Channel
}
interface AppInfos {
  version_name: string
  version_build: string
  plugin_version: string
  platform: string
  app_id: string
  device_id: string
}

serve(async (event: Request) => {
  try {
    const body = (await event.json()) as AppInfos
    console.log('body', body)
    let {
      version_name,
      version_build,
      plugin_version,
    } = body
    const {
      platform,
      app_id,
      device_id,
    } = body
    // if version_build is not semver, then make it semver
    const coerce = semver.coerce(version_build)
    if (coerce)
      version_build = coerce.version
    else
      return sendRes({ message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number` }, 400)
    version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name
    plugin_version = plugin_version || '2.3.3'
    if (!app_id || !device_id || !version_build || !version_name || !platform) {
      console.log('Cannot get all vars', platform,
        app_id,
        device_id,
        version_build,
        version_name)
      return sendRes({ message: 'missing appid' }, 400)
    }

    console.log('Headers', platform,
      app_id,
      device_id,
      version_build,
      plugin_version,
      version_name)

    const supabase = supabaseAdmin

    const { data: channel, error: dbError } = await supabase
      .from<definitions['channels'] & Channel>('channels')
      .select(`
          id,
          created_at,
          created_by,
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
      .eq('app_id', app_id)
      .eq('public', true)
      .single()
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
      .eq('device_id', device_id)
      .eq('app_id', app_id)
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
      .eq('device_id', device_id)
      .eq('app_id', app_id)
    if (dbError || !channel) {
      console.log('Cannot get channel', app_id, `no public channel ${JSON.stringify(dbError)}`)
      return sendRes({
        message: 'Cannot get channel',
        err: `no public channel ${JSON.stringify(dbError)}`,
      }, 200)
    }
    const trial = await isTrial(channel.created_by)
    const paying = await isGoodPlan(channel.created_by)
    let version: definitions['app_versions'] = channel.version as definitions['app_versions']
    if (!paying && !trial) {
      console.log('Cannot update, upgrade plan to continue to update', app_id)
      await sendStats('needUpgrade', platform, device_id, app_id, version_build, version.id)
      return sendRes({
        message: 'Cannot update, upgrade plan to continue to update',
        err: 'not good plan',
      }, 200)
    }
    if (channelOverride && channelOverride.length) {
      console.log('Set channel override', app_id, channelOverride[0].channel_id.version.name)
      version = channelOverride[0].channel_id.version as definitions['app_versions']
    }
    if (devicesOverride && devicesOverride.length) {
      console.log('Set device override', app_id, devicesOverride[0].version.name)
      version = devicesOverride[0].version as definitions['app_versions']
    }

    if (!version.bucket_id && !version.external_url) {
      console.log('Cannot get zip file', app_id)
      return sendRes({
        message: 'Cannot get zip file',
      }, 200)
    }
    await updateOrCreateDevice({
      app_id,
      device_id,
      platform: platform as definitions['devices']['platform'],
      plugin_version,
      version: version.id,
    })

    // console.log('updateOrCreateDevice done')
    let signedURL = version.external_url || ''
    if (version.bucket_id && !version.external_url) {
      const res = await supabase
        .storage
        .from(`apps/${version.user_id}/${app_id}/versions`)
        .createSignedUrl(version.bucket_id, 60)
      if (res && res.signedURL)
        signedURL = res.signedURL
    }

    // console.log('signedURL', device_id, signedURL, version_name, version.name)
    if (version_name === version.name) {
      console.log('No new version available', device_id, version_name, version.name)
      await sendStats('noNew', platform, device_id, app_id, version_build, version.id)
      return sendRes({
        message: 'No new version available',
      }, 200)
    }

    // console.log('check disableAutoUpdateToMajor', device_id)
    if (channel.disableAutoUpdateToMajor && semver.major(version.name) > semver.major(version_name)) {
      console.log('Cannot upgrade major version', device_id)
      await sendStats('disableAutoUpdateToMajor', platform, device_id, app_id, version_build, version.id)
      return sendRes({
        major: true,
        message: 'Cannot upgrade major version',
        version: version.name,
        old: version_name,
      }, 200)
    }

    console.log('check disableAutoUpdateUnderNative', device_id)
    if (channel.disableAutoUpdateUnderNative && semver.lt(version.name, version_build)) {
      await sendStats('disableAutoUpdateUnderNative', platform, device_id, app_id, version_build, version.id)
      console.log('Cannot revert under native version', device_id)
      return sendRes({
        message: 'Cannot revert under native version',
        version: version.name,
        old: version_name,
      }, 200)
    }

    // console.log('save stats', device_id)
    await sendStats('get', platform, device_id, app_id, version_build, version.id)
    console.log('New version available', app_id, version.name, signedURL)
    return sendRes({
      version: version.name,
      url: signedURL,
    })
  }
  catch (e) {
    console.log('Error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
