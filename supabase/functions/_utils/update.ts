import { cryptoRandomString } from 'https://deno.land/x/crypto_random_string@1.1.0/mod.ts'
import * as semver from 'https://deno.land/x/semver@v1.4.1/mod.ts'
import { sendRes } from '../_utils/utils.ts'
import { isAllowedAction, sendDevice, sendStats, supabaseAdmin } from '../_utils/supabase.ts'
import type { AppInfos } from '../_utils/types.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { sendNotif } from '../_utils/notifications.ts'
import { getBundleUrl } from '../_utils/downloadUrl.ts'
import { logsnag } from '../_utils/logsnag.ts'
import { appIdToUrl } from './../_utils/conversion.ts'

interface Channel {
  version: Database['public']['Tables']['app_versions']['Row']
  secondVersion: Database['public']['Tables']['app_versions']['Row']
}

function resToVersion(plugin_version: string, signedURL: string, version: Database['public']['Tables']['app_versions']['Row']) {
  const res: any = {
    version: version.name,
    url: signedURL,
  }
  if (semver.gte(plugin_version, '4.13.0'))
    res.session_key = version.session_key || ''
  if (semver.gte(plugin_version, '4.4.0'))
    res.checksum = version.checksum
  return res
}

function sendResWithStatus(status: string, data?: any, statusCode?: number, updateOverwritten?: boolean): Response {
  const response = sendRes(data, 200)

  response.headers.append('x-update-status', status)
  response.headers.append('x-update-overwritten', (updateOverwritten ?? false).toString())

  return response
}

async function requestInfos(app_id: string, device_id: string, version_name: string) {
  const recD = supabaseAdmin()
    .from('devices')
    .select(`
      customChannel (
        id,
        created_at,
        created_by,
        name,
        app_id,
        allow_dev,
        allow_emulator,
        disableAutoUpdateUnderNative,
        disableAutoUpdateToMajor,
        ios,
        android,
        secondVersion (
          id,
          name,
          checksum,
          session_key,
          user_id,
          bucket_id,
          storage_provider,
          external_url
        ),
        secondaryVersionPercentage,
        enable_progressive_deploy,
        enableAbTesting,
        version (
          id,
          name,
          checksum,
          session_key,
          user_id,
          bucket_id,
          storage_provider,
          external_url
        )
      ),
      customVersion (
        id,
        name,
        checksum,
        session_key,
        user_id,
        bucket_id,
        storage_provider,
        external_url
      )
    `)
    .eq('device_id', device_id)
    .eq('app_id', app_id)
    .single()
    .then(res => (!res.error) ? res.data : null)
  // promise all
  const [deviceData] = await Promise.all([recD])
  const finalDeviceData = deviceData as any as Database['public']['Tables']['devices']['Row'] & { customChannel: Channel; customVersion: Database['public']['Tables']['app_versions']['Row'] } | null
  return { deviceData: finalDeviceData }
}

export async function update(body: AppInfos) {
  // create random id
  const id = cryptoRandomString({ length: 10 })
  try {
    console.log(id, 'body', body)
    let {
      version_name,
      version_build,
    } = body
    const {
      platform,
      app_id,
      device_id,
      version_os,
      plugin_version = '2.3.3',
      custom_id,
      is_emulator = false,
      is_prod = true,
    } = body
    // if version_build is not semver, then make it semver
    const coerce = semver.coerce(version_build)
    const { data: appData } = await supabaseAdmin()
      .from('apps')
      .select(`
        user_id,
        mainChannel (
          id,
          created_at,
          created_by,
          name,
          app_id,
          allow_dev,
          allow_emulator,
          disableAutoUpdateUnderNative,
          disableAutoUpdateToMajor,
          ios,
          android,
          secondVersion (
            id,
            name,
            checksum,
            session_key,
            user_id,
            bucket_id,
            storage_provider,
            external_url
          ),
          secondaryVersionPercentage,
          enable_progressive_deploy,
          enableAbTesting,
          version (
            id,
            name,
            checksum,
            session_key,
            user_id,
            bucket_id,
            storage_provider,
            external_url
          )
        )
      `)
      .eq('app_id', app_id)
      .single()

    const castedAppData = appData as any as Database['public']['Tables']['apps']['Row'] & { mainChannel: Channel } | null

    if (!appData) {
      if (app_id) {
        await supabaseAdmin()
          .from('store_apps')
          .upsert({
            app_id,
            onprem: true,
            capacitor: true,
            capgo: true,
          })
      }
      return sendResWithStatus('app_not_found', {
        message: 'App not found',
        error: 'app_not_found',
      }, 200)
    }
    if (coerce) {
      version_build = coerce.version
    }
    else {
      // get app owner with app_id
      const sent = await sendNotif('user:semver_issue', {
        current_app_id: app_id,
        current_device_id: device_id,
        current_version_id: version_build,
        current_app_id_url: appIdToUrl(app_id),
      }, appData.user_id, '0 0 * * 1', 'red')
      if (sent) {
        await logsnag.track({
          channel: 'updates',
          event: 'semver issue',
          icon: '⚠️',
          user_id: appData.user_id,
          notify: false,
        }).catch()
      }
      return sendResWithStatus('fail', {
        message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number`,
        error: 'semver_error',
      }, 400)
    }
    // if plugin_version is < 4 send notif to alert
    if (semver.lt(plugin_version, '5.0.0')) {
      const sent = await sendNotif('user:plugin_issue', {
        current_app_id: app_id,
        current_device_id: device_id,
        current_version_id: version_build,
        current_app_id_url: appIdToUrl(app_id),
      }, appData.user_id, '0 0 * * 1', 'red')
      if (sent) {
        await logsnag.track({
          channel: 'updates',
          event: 'plugin issue',
          icon: '⚠️',
          user_id: appData.user_id,
          notify: false,
        } as any).catch()
      }
    }
    version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name
    if (!app_id || !device_id || !version_build || !version_name || !platform) {
      return sendResWithStatus('fail', {
        message: 'Cannot find device_id or appi_id',
        error: 'missing_info',
      }, 400)
    }

    console.log(id, 'vals', platform,
      app_id,
      device_id,
      custom_id,
      version_build,
      is_emulator,
      is_prod,
      plugin_version,
      version_name)

    const stat: Database['public']['Tables']['stats']['Insert'] = {
      platform: platform as Database['public']['Enums']['platform_os'],
      device_id,
      action: 'get',
      app_id,
      version_build,
      version: 0,
    }
    const { deviceData } = await requestInfos(app_id, device_id, version_name)
    if ((!deviceData || !deviceData.customChannel || !deviceData!.customVersion) && !castedAppData?.mainChannel) {
      console.log(id, 'Cannot get channel or override', app_id, 'no default channel')
      // No versions so version is 0 right?
      await Promise.all([sendDevice({
        app_id,
        device_id,
        version: 0,
      }), sendStats([{
        ...stat,
        action: 'NoChannelOrOverride',
        version: 0,
      }])])
      return sendResWithStatus('fail', {
        message: 'no default channel or override',
        error: 'no_channel',
      }, 200)
    }

    // deno-lint-ignore no-explicit-any
    const channel = (deviceData?.customChannel || castedAppData?.mainChannel) as any as Database['public']['Tables']['channels']['Row'] & Channel | null
    let enableAbTesting: boolean = channel?.enableAbTesting || false

    const enableProgressiveDeploy: boolean = channel?.enableAbTesting || false

    const updateOverwritten = deviceData?.customVersion !== null || deviceData?.customChannel !== null

    let version = deviceData?.customVersion || (deviceData?.customChannel ? deviceData.customChannel.version : undefined) || castedAppData?.mainChannel.version || null
    const secondVersion = (deviceData?.customChannel ? deviceData.customChannel.secondVersion : undefined) || castedAppData?.mainChannel.secondVersion || null

    if (!version) {
      console.log(id, 'Cannot get version', app_id)
      await sendStats([{
        ...stat,
        action: 'noVersion',
      }])
      return sendResWithStatus('fail', {
        message: 'Cannot get version',
        error: 'no_version',
      }, 200)
    }

    const planValid = await isAllowedAction(appData.user_id)
    stat.version = version.id

    if (enableAbTesting || enableProgressiveDeploy) {
      if (secondVersion && secondVersion?.name !== 'unknown') {
        const secondVersionPercentage: number = channel?.secondaryVersionPercentage ?? 0
        // eslint-disable-next-line max-statements-per-line
        if (secondVersion.name === version_name || version.name === 'unknown' || secondVersionPercentage === 1) { version = secondVersion }
        else if (secondVersionPercentage === 0) { /* empty (do nothing) */ }
        else if (version.name !== version_name) {
          const randomChange = Math.random()

          if (randomChange < secondVersionPercentage)
            version = secondVersion
        }
      }
      else {
        enableAbTesting = false
      }
    }

    // TODO: find better solution to check if device is from apple or google, currently not qworking in netlify-egde
    // const xForwardedFor = headers['x-forwarded-for'] || ''
    // // console.log('xForwardedFor', xForwardedFor)
    // const ip = xForwardedFor.split(',')[1]
    // console.log('IP', ip)
    // check if version is created_at more than 4 hours
    // const isOlderEnought = (new Date(version.created_at || Date.now()).getTime() + 4 * 60 * 60 * 1000) < Date.now()

    // if (xForwardedFor && device_id !== defaultDeviceID && !isOlderEnought && await invalidIp(ip)) {
    //   console.log('invalid ip', xForwardedFor, ip)
    //   return sendRes({
    //     message: `invalid ip ${xForwardedFor} ${JSON.stringify(headers)}`,
    //     error: 'invalid_ip',
    //   }, 400)
    // }
    const device: Database['public']['Tables']['devices']['Insert'] = {
      app_id,
      device_id,
      platform: platform as Database['public']['Enums']['platform_os'],
      plugin_version,
      version: stat.version,
      os_version: version_os,
      ...(is_emulator != null ? { is_emulator } : {}),
      ...(is_prod != null ? { is_prod } : {}),
      ...(custom_id != null ? { custom_id } : {}),
      version_build,
      updated_at: new Date().toISOString(),
    }
    await sendDevice(device)

    if (!planValid) {
      console.log(id, 'Cannot update, upgrade plan to continue to update', app_id)
      await sendStats([{
        ...stat,
        action: 'needPlanUpgrade',
      }])
      return sendResWithStatus('fail', {
        message: 'Cannot update, upgrade plan to continue to update',
        error: 'need_plan_upgrade',
      }, 200, updateOverwritten)
    }

    if (!version.bucket_id && !version.external_url) {
      console.log(id, 'Cannot get bundle', app_id, version)
      await sendStats([{
        ...stat,
        action: 'missingBundle',
      }])
      return sendResWithStatus('fail', {
        message: 'Cannot get bundle',
        error: 'no_bundle',
      }, 200, updateOverwritten)
    }
    let signedURL = version.external_url || ''
    if (version.bucket_id && !version.external_url) {
      const res = await getBundleUrl(version.storage_provider, `apps/${appData.user_id}/${app_id}/versions`, version.bucket_id)
      if (res)
        signedURL = res
    }

    // console.log('signedURL', device_id, signedURL, version_name, version.name)
    if (version_name === version.name) {
      console.log(id, 'No new version available', device_id, version_name, version.name)
      await sendStats([{
        ...stat,
        action: 'noNew',
      }])
      return sendResWithStatus('no_new', {
        message: 'No new version available',
      }, 200, updateOverwritten)
    }

    if (channel) {
    // console.log('check disableAutoUpdateToMajor', device_id)
      if (!channel.ios && platform === 'ios') {
        console.log(id, 'Cannot update, ios is disabled', device_id)
        await sendStats([{
          ...stat,
          action: 'disablePlatformIos',
        }])
        return sendResWithStatus('fail', {
          message: 'Cannot update, ios it\'s disabled',
          error: 'disabled_platform_ios',
          version: version.name,
          old: version_name,
        }, 200, updateOverwritten)
      }
      if (!channel.android && platform === 'android') {
        console.log(id, 'Cannot update, android is disabled', device_id)
        await sendStats([{
          ...stat,
          action: 'disablePlatformAndroid',
        }])
        return sendResWithStatus('fail', {
          message: 'Cannot update, android is disabled',
          error: 'disabled_platform_android',
          version: version.name,
          old: version_name,
        }, 200, updateOverwritten)
      }
      if (channel.disableAutoUpdateToMajor && semver.major(version.name) > semver.major(version_name)) {
        console.log(id, 'Cannot upgrade major version', device_id)
        await sendStats([{
          ...stat,
          action: 'disableAutoUpdateToMajor',
        }])
        return sendResWithStatus('fail', {
          major: true,
          message: 'Cannot upgrade major version',
          error: 'disable_auto_update_to_major',
          version: version.name,
          old: version_name,
        }, 200, updateOverwritten)
      }

      // console.log(id, 'check disableAutoUpdateUnderNative', device_id)
      if (channel.disableAutoUpdateUnderNative && semver.lt(version.name, version_build)) {
        console.log(id, 'Cannot revert under native version', device_id)
        await sendStats([{
          ...stat,
          action: 'disableAutoUpdateUnderNative',
        }])
        return sendResWithStatus('fail', {
          message: 'Cannot revert under native version',
          error: 'disable_auto_update_under_native',
          version: version.name,
          old: version_name,
        }, 200, updateOverwritten)
      }

      if (!channel.allow_dev && !is_prod) {
        console.log(id, 'Cannot update dev build is disabled', device_id)
        await sendStats([{
          ...stat,
          action: 'disableDevBuild',
        }])
        return sendResWithStatus('fail', {
          message: 'Cannot update, dev build is disabled',
          error: 'disable_dev_build',
          version: version.name,
          old: version_name,
        }, 200, updateOverwritten)
      }
      if (!channel.allow_emulator && is_emulator) {
        console.log(id, 'Cannot update emulator is disabled', device_id)
        await sendStats([{
          ...stat,
          action: 'disableEmulator',
        }])
        return sendResWithStatus('fail', {
          message: 'Cannot update, emulator is disabled',
          error: 'disable_emulator',
          version: version.name,
          old: version_name,
        }, 200, updateOverwritten)
      }
    }
    //  check signedURL and if it's url
    if (!signedURL && (!signedURL.startsWith('http://') || !signedURL.startsWith('https://'))) {
      console.log(id, 'Cannot get bundle signedURL', signedURL, app_id)
      await sendStats([{
        ...stat,
        action: 'cannotGetBundle',
      }])
      return sendResWithStatus('fail', {
        message: 'Cannot get bundle',
        error: 'no_bundle',
      }, 200, updateOverwritten)
    }
    // console.log(id, 'save stats', device_id)
    await sendStats([{
      ...stat,
      action: 'get',
    }])
    console.log(id, 'New version available', app_id, version.name, signedURL)
    return sendResWithStatus('new_version', resToVersion(plugin_version, signedURL, version), 200, updateOverwritten)
  }
  catch (e) {
    console.error('e', e)
    return sendRes({
      message: `Error unknow ${JSON.stringify(e)}`,
      error: 'unknow_error',
    }, 500)
  }
}
