import type { Context } from '@hono/hono'
import type { ManifestEntry } from './downloadUrl.ts'
import type { DeviceWithoutCreatedAt } from './stats.ts'
import type { Database } from './supabase.types.ts'
import type { AppInfos } from './types.ts'
import {
  format,
  greaterOrEqual,
  greaterThan,
  lessThan,
  parse,
  tryParse,
} from '@std/semver'
import { getRuntimeKey } from 'hono/adapter'
import { createIfNotExistStoreInfo } from './cloudflare.ts'
import { appIdToUrl } from './conversion.ts'
import { getBundleUrl, getManifestUrl } from './downloadUrl.ts'
import { sendNotifOrg } from './notifications.ts'
import { closeClient, getAppOwnerPostgres, getAppOwnerPostgresV2, getDrizzleClient, getDrizzleClientD1, getPgClient, isAllowedActionOrgActionD1, isAllowedActionOrgActionPg, requestInfosPostgres, requestInfosPostgresV2 } from './pg.ts'
import { createStatsBandwidth, createStatsMau, createStatsVersion, sendStatsAndDevice } from './stats.ts'
import { backgroundTask, fixSemver } from './utils.ts'

function resToVersion(plugin_version: string, signedURL: string, version: Database['public']['Tables']['app_versions']['Row'], manifest: ManifestEntry[]) {
  const res: {
    version: string
    url: string
    session_key?: string
    checksum?: string | null
    manifest?: ManifestEntry[]
  } = {
    version: version.name,
    url: signedURL,
  }
  const pluginVersion = parse(plugin_version)
  if (greaterThan(pluginVersion, parse('4.13.0')))
    res.session_key = version.session_key || ''
  if (greaterThan(pluginVersion, parse('4.4.0')))
    res.checksum = version.checksum
  if (greaterThan(pluginVersion, parse('6.8.0')) && manifest.length > 0)
    res.manifest = manifest
  return res
}

export async function updateWithPG(c: Context, body: AppInfos, drizzleCient: ReturnType<typeof getDrizzleClient> | ReturnType<typeof getDrizzleClientD1>, isV2: boolean) {
  try {
    console.log({ requestId: c.get('requestId'), context: 'body', body, date: new Date().toISOString() })
    let {
      version_name,
      version_build,
      device_id,
    } = body
    const {
      platform,
      app_id,
      version_os,
      plugin_version = '2.3.3',
      custom_id,
      defaultChannel,
      is_emulator = false,
      is_prod = true,
    } = body
    device_id = device_id.toLowerCase()
    // if version_build is not semver, then make it semver
    const coerce = tryParse(fixSemver(version_build))
    const appOwner = isV2 ? await getAppOwnerPostgresV2(c, app_id, drizzleCient as ReturnType<typeof getDrizzleClientD1>) : await getAppOwnerPostgres(c, app_id, drizzleCient as ReturnType<typeof getDrizzleClient>)
    if (!appOwner) {
      if (app_id) {
        await backgroundTask(c, createIfNotExistStoreInfo(c, {
          app_id,
          onprem: true,
          capacitor: true,
          capgo: true,
        }))
      }
      console.log({ requestId: c.get('requestId'), context: 'App not found', id: app_id, date: new Date().toISOString() })
      return c.json({
        message: 'App not found',
        error: 'app_not_found',
        app_id,
      }, 200)
    }
    if (coerce) {
      version_build = format(coerce)
    }
    else {
      // get app owner with app_id
      await backgroundTask(c, sendNotifOrg(c, 'user:semver_issue', {
        app_id,
        device_id,
        version_id: version_build,
        app_id_url: appIdToUrl(app_id),
      }, appOwner.owner_org, app_id, '0 0 * * 1'))
      console.log({ requestId: c.get('requestId'), context: 'semver_issue', app_id, version_build })
      return c.json({
        message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number`,
        error: 'semver_error',
      }, 400)
    }
    // if plugin_version is < 6 send notif to alert for update
    if (lessThan(parse(plugin_version), parse('6.0.0'))) {
      await backgroundTask(c, sendNotifOrg(c, 'user:plugin_issue', {
        app_id,
        device_id,
        version_id: version_build,
        app_id_url: appIdToUrl(app_id),
      }, appOwner.owner_org, app_id, '0 0 * * 1'))
    }
    version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name
    if (!app_id || !device_id || !version_build || !version_name || !platform) {
      console.log({ requestId: c.get('requestId'), context: 'missing_info', app_id, device_id, version_build, version_name, platform })
      return c.json({
        message: 'Cannot find device_id or appi_id',
        error: 'missing_info',
      }, 400)
    }
    const device: DeviceWithoutCreatedAt = {
      app_id,
      device_id,
      plugin_version,
      version: 0,
      custom_id,
      is_emulator,
      is_prod,
      version_build,
      os_version: version_os,
      platform: platform as Database['public']['Enums']['platform_os'],
      updated_at: new Date().toISOString(),
    }
    const start = performance.now()
    const planValid = isV2 ? await isAllowedActionOrgActionD1(c, drizzleCient as ReturnType<typeof getDrizzleClientD1>, appOwner.orgs.id, ['mau', 'bandwidth']) : await isAllowedActionOrgActionPg(c, drizzleCient as ReturnType<typeof getDrizzleClient>, appOwner.orgs.id, ['mau', 'bandwidth'])
    if (!planValid) {
      console.log({ requestId: c.get('requestId'), context: 'Cannot update, upgrade plan to continue to update', id: app_id })
      await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
      return c.json({
        message: 'Cannot update, upgrade plan to continue to update',
        error: 'need_plan_upgrade',
      }, 200)
    }
    await backgroundTask(c, createStatsMau(c, device_id, app_id))

    console.log({ requestId: c.get('requestId'), context: 'vals', platform, device })

    const requestedInto = isV2
      ? await requestInfosPostgresV2(platform, app_id, device_id, version_name, defaultChannel, drizzleCient as ReturnType<typeof getDrizzleClientD1>)
      : await requestInfosPostgres(platform, app_id, device_id, version_name, defaultChannel, drizzleCient as ReturnType<typeof getDrizzleClient>)

    const end = performance.now()
    console.log({ requestId: c.get('requestId'), context: 'requestInfosPostgres', duration: `${end - start}ms` })

    const { versionData, channelOverride } = requestedInto
    let { channelData } = requestedInto
    console.log({ requestId: c.get('requestId'), context: 'requestedInto', message: `versionData exists ? ${versionData !== undefined}, channelData exists ? ${channelData !== undefined}, channelOverride exists ? ${channelOverride !== undefined}` })

    if (!versionData) {
      console.log({ requestId: c.get('requestId'), context: 'No version data found' })
      return c.json({
        message: 'Couldn\'t find version data',
        error: 'no-version_data',
      }, 200)
    }

    if (!channelData && !channelOverride) {
      console.log({ requestId: c.get('requestId'), context: 'Cannot get channel or override', id: app_id, date: new Date().toISOString() })
      if (versionData)
        await sendStatsAndDevice(c, device, [{ action: 'NoChannelOrOverride', versionId: versionData.id }])

      return c.json({
        message: 'no default channel or override',
        error: 'no_channel',
      }, 200)
    }

    // Trigger only if the channel is overwriten but the version is not
    if (channelOverride)
      channelData = channelOverride

    if (!channelData) {
      return c.json({
        message: 'channel data still null',
        error: 'null_channel_data',
      }, 200)
    }

    const version = channelOverride?.version || channelData.version
    device.version = versionData ? versionData.id : version.id

    // TODO: find better solution to check if device is from apple or google, currently not qworking in netlify-egde
    // const xForwardedFor = headers['x-forwarded-for'] || ''
    // // console.log(c.get('requestId'), 'xForwardedFor', xForwardedFor)
    // const ip = xForwardedFor.split(',')[1]
    // console.log(c.get('requestId'), 'IP', ip)
    // check if version is created_at more than 4 hours
    // const isOlderEnought = (new Date(version.created_at || Date.now()).getTime() + 4 * 60 * 60 * 1000) < Date.now()

    // if (xForwardedFor && device_id !== defaultDeviceID && !isOlderEnought && await invalidIp(ip)) {
    //   console.log(c.get('requestId'), 'invalid ip', xForwardedFor, ip)
    //   return c.json({
    //     message: `invalid ip ${xForwardedFor} ${JSON.stringify(headers)}`,
    //     error: 'invalid_ip',
    //   }, 400)
    // }

    if (!version.external_url && !version.r2_path && version.name !== 'builtin' && !version.manifest) {
      console.log({ requestId: c.get('requestId'), context: 'Cannot get bundle', id: app_id, version })
      await sendStatsAndDevice(c, device, [{ action: 'missingBundle' }])
      return c.json({
        message: 'Cannot get bundle',
        error: 'no_bundle',
      }, 200)
    }

    // console.log(c.get('requestId'), 'signedURL', device_id, version_name, version.name)
    if (version_name === version.name) {
      console.log({ requestId: c.get('requestId'), context: 'No new version available', id: device_id, version_name, version: version.name, date: new Date().toISOString() })
      // TODO: check why this event is send with wrong version_name
      await sendStatsAndDevice(c, device, [{ action: 'noNew' }])
      return c.json({
        message: 'No new version available',
      }, 200)
    }

    if (channelData) {
    // console.log(c.get('requestId'), 'check disableAutoUpdateToMajor', device_id)
      if (!channelData.channels.ios && platform === 'ios') {
        console.log({ requestId: c.get('requestId'), context: 'Cannot update, ios is disabled', id: device_id, date: new Date().toISOString() })
        await sendStatsAndDevice(c, device, [{ action: 'disablePlatformIos' }])
        return c.json({
          message: 'Cannot update, ios it\'s disabled',
          error: 'disabled_platform_ios',
          version: version.name,
          old: version_name,
        }, 200)
      }
      if (!channelData.channels.android && platform === 'android') {
        console.log({ requestId: c.get('requestId'), context: 'Cannot update, android is disabled', id: device_id, date: new Date().toISOString() })
        await sendStatsAndDevice(c, device, [{ action: 'disablePlatformAndroid' }])
        console.log({ requestId: c.get('requestId'), context: 'sendStats', date: new Date().toISOString() })
        return c.json({
          message: 'Cannot update, android is disabled',
          error: 'disabled_platform_android',
          version: version.name,
          old: version_name,
        }, 200)
      }
      if (version.name !== 'builtin' && channelData?.channels.disable_auto_update === 'major' && parse(version.name).major > parse(version_build).major) {
        console.log({ requestId: c.get('requestId'), context: 'Cannot upgrade major version', id: device_id, date: new Date().toISOString() })
        await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateToMajor' }])
        return c.json({
          major: true,
          message: 'Cannot upgrade major version',
          error: 'disable_auto_update_to_major',
          version: version.name,
          old: version_build,
        }, 200)
      }

      if (!channelData.channels.allow_device_self_set && !channelData.channels.public) {
        console.log({ requestId: c.get('requestId'), context: 'Cannot update via a private channel', id: device_id, date: new Date().toISOString() })
        await sendStatsAndDevice(c, device, [{ action: 'cannotUpdateViaPrivateChannel' }])
        return c.json({
          message: 'Cannot update via a private channel. Please ensure your defaultChannel has "Allow devices to self dissociate/associate" set to true',
          error: 'cannot_update_via_private_channel',
        }, 200)
      }

      if (version.name !== 'builtin' && channelData.channels.disable_auto_update === 'minor' && parse(version.name).minor > parse(version_build).minor) {
        console.log({ requestId: c.get('requestId'), context: 'Cannot upgrade minor version', id: device_id, date: new Date().toISOString() })
        await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateToMinor' }])
        return c.json({
          major: true,
          message: 'Cannot upgrade minor version',
          error: 'disable_auto_update_to_minor',
          version: version.name,
          old: version_build,
        }, 200)
      }

      console.log({ requestId: c.get('requestId'), context: 'version', version: version.name, old: version_name })
      if (version.name !== 'builtin' && channelData.channels.disable_auto_update === 'patch' && !(
        parse(version.name).patch > parse(version_build).patch
        && parse(version.name).major === parse(version_build).major
        && parse(version.name).minor === parse(version_build).minor
      )) {
        console.log({ requestId: c.get('requestId'), context: 'Cannot upgrade patch version', id: device_id, date: new Date().toISOString() })
        await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateToPatch' }])
        return c.json({
          major: true,
          message: 'Cannot upgrade patch version',
          error: 'disable_auto_update_to_patch',
          version: version.name,
          old: version_build,
        }, 200)
      }

      if (version.name !== 'builtin' && channelData.channels.disable_auto_update === 'version_number') {
        const minUpdateVersion = version.min_update_version

        // The channel is misconfigured
        if (minUpdateVersion === null) {
          console.log({ requestId: c.get('requestId'), context: 'Channel is misconfigured', channel: channelData.channels.name, date: new Date().toISOString() })
          await sendStatsAndDevice(c, device, [{ action: 'channelMisconfigured' }])
          return c.json({
            message: `Channel ${channelData.channels.name} is misconfigured`,
            error: 'misconfigured_channel',
            version: version.name,
            old: version_build,
          }, 200)
        }

        // Check if the minVersion is greater then the current version
        if (greaterThan(parse(minUpdateVersion), parse(version_build))) {
          console.log({ requestId: c.get('requestId'), context: 'Cannot upgrade, metadata > current version', id: device_id, min: minUpdateVersion, old: version_name, date: new Date().toISOString() })
          await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateMetadata' }])
          return c.json({
            major: true,
            message: 'Cannot upgrade version, min update version > current version',
            error: 'disable_auto_update_to_metadata',
            version: version.name,
            old: version_build,
          }, 200)
        }
      }

      // console.log(c.get('requestId'), 'check disableAutoUpdateUnderNative', device_id)
      if (version.name !== 'builtin' && channelData.channels.disable_auto_update_under_native && lessThan(parse(version.name), parse(version_build))) {
        console.log({ requestId: c.get('requestId'), context: 'Cannot revert under native version', id: device_id, date: new Date().toISOString() })
        await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateUnderNative' }])
        return c.json({
          message: 'Cannot revert under native version',
          error: 'disable_auto_update_under_native',
          version: version.name,
          old: version_name,
        }, 200)
      }

      if (!channelData.channels.allow_dev && !is_prod) {
        console.log({ requestId: c.get('requestId'), context: 'Cannot update dev build is disabled', id: device_id, date: new Date().toISOString() })
        await sendStatsAndDevice(c, device, [{ action: 'disableDevBuild' }])
        return c.json({
          message: 'Cannot update, dev build is disabled',
          error: 'disable_dev_build',
          version: version.name,
          old: version_name,
        }, 200)
      }
      if (!channelData.channels.allow_emulator && is_emulator) {
        console.log({ requestId: c.get('requestId'), context: 'Cannot update emulator is disabled', id: device_id, date: new Date().toISOString() })
        await sendStatsAndDevice(c, device, [{ action: 'disableEmulator' }])
        return c.json({
          message: 'Cannot update, emulator is disabled',
          error: 'disable_emulator',
          version: version.name,
          old: version_name,
        }, 200)
      }
    }
    if (version.name === 'builtin' && greaterOrEqual(parse(plugin_version), parse('6.2.0'))) {
      if (body.version_name === 'builtin' && version.name === 'builtin') {
        return c.json({ message: 'Already on builtin' }, 200)
      }
      else {
        return c.json({ version: 'builtin' })
      }
    }
    else if (version.name === 'builtin' && !greaterOrEqual(parse(plugin_version), parse('6.2.0'))) {
      return c.json({
        message: 'revert_to_builtin used, but plugin version is too old',
        error: 'revert_to_builtin_plugin_version_too_old',
      }, 200)
    }
    let signedURL = version.external_url || ''
    let manifest: ManifestEntry[] = []
    if (!version.external_url) {
      if (version.r2_path) {
        const res = await getBundleUrl(c, version.id, version.r2_path, device_id)
        if (res) {
          signedURL = res.url
          // only count the size of the bundle if it's not external
          await backgroundTask(c, createStatsBandwidth(c, device_id, app_id, res.size ?? 0))
        }
      }
      manifest = getManifestUrl(c, version.id, version.manifest as any, device_id)
    }
    //  check signedURL and if it's url
    if (!signedURL || (!(signedURL.startsWith('http://') || signedURL.startsWith('https://'))) && !version.manifest) {
      console.log({ requestId: c.get('requestId'), context: 'Cannot get bundle signedURL', url: signedURL, id: app_id, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'cannotGetBundle' }])
      return c.json({
        message: 'Cannot get bundle url',
        error: 'no_bundle_url',
      }, 200)
    }
    if (version.manifest && !signedURL) {
      // TODO: remove this when all plugin acccept no URL
      signedURL = 'https://404.capgo.app/no.zip'
    }
    // console.log(c.get('requestId'), 'save stats', device_id)
    await backgroundTask(c, Promise.all([
      createStatsVersion(c, version.id, app_id, 'get'),
      sendStatsAndDevice(c, device, [{ action: 'get' }]),
    ]))
    console.log({ requestId: c.get('requestId'), context: 'New version available', app_id, version: version.name, signedURL, date: new Date().toISOString() })
    const res = resToVersion(plugin_version, signedURL, version as any, manifest)
    if (!res.url && !res.manifest) {
      console.log({ requestId: c.get('requestId'), context: 'No url or manifest', id: app_id, version: version.name, date: new Date().toISOString() })
      return c.json({
        message: 'No url or manifest',
        error: 'no_url_or_manifest',
      }, 200)
    }
    return c.json(res, 200)
  }
  catch (e) {
    console.error({ requestId: c.get('requestId'), context: 'update', error: JSON.stringify(e), body })
    return c.json({
      message: `Error unknow ${JSON.stringify(e)}`,
      error: 'unknow_error',
    }, 500)
  }
}

export async function update(c: Context, body: AppInfos) {
  let pgClient
  let isV2 = false
  if (c.req.url.endsWith('/updates_v2') && getRuntimeKey() === 'workerd') {
    isV2 = true
  }
  // if (!isV2 && getRuntimeKey() === 'workerd') {
  //   // make 20% chance to be v2
  //   isV2 = Math.random() < 0.3
  // }
  // check if URL ends with update_v2 if yes do not init PG
  if (isV2) {
    console.log({ requestId: c.get('requestId'), context: 'update2', isV2 })
    pgClient = null
  }
  else {
    pgClient = getPgClient(c)
  }

  let res
  try {
    res = await updateWithPG(c, body, isV2 ? getDrizzleClientD1(c) : getDrizzleClient(pgClient as any), isV2)
  }
  catch (e) {
    console.error({ requestId: c.get('requestId'), context: 'update', error: e })
    return c.json({
      message: `Error unknow ${JSON.stringify(e)}`,
      error: 'unknow_error',
    }, 500)
  }
  if (isV2 && pgClient)
    await closeClient(c, pgClient)
  return res
}
