import type { Context } from 'hono'
import type { ManifestEntry } from './downloadUrl.ts'

import type { Database } from './supabase.types.ts'
import type { AppInfos, DeviceWithoutCreatedAt } from './types.ts'
import {
  greaterOrEqual,
  greaterThan,
  lessThan,
  parse,
  tryParse,
} from '@std/semver'
import { getRuntimeKey } from 'hono/adapter'
import { getBundleUrl, getManifestUrl } from './downloadUrl.ts'
import { getIsV2, simpleError, simpleError200 } from './hono.ts'
import { cloudlog } from './logging.ts'
import { sendNotifOrg } from './notifications.ts'
import { closeClient, getAppOwnerPostgres, getDrizzleClient, getPgClient, requestInfosPostgres } from './pg.ts'
import { getAppOwnerPostgresV2, getDrizzleClientD1Session, requestInfosPostgresV2 } from './pg_d1.ts'
import { s3 } from './s3.ts'
import { createStatsBandwidth, createStatsMau, createStatsVersion, onPremStats, sendStatsAndDevice } from './stats.ts'
import { backgroundTask, fixSemver, isInternalVersionName } from './utils.ts'

const PLAN_LIMIT: Array<'mau' | 'bandwidth' | 'storage'> = ['mau', 'bandwidth']

export function resToVersion(plugin_version: string, signedURL: string, version: Database['public']['Tables']['app_versions']['Row'], manifest: ManifestEntry[]) {
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
    res.session_key = version.session_key ?? ''
  if (greaterThan(pluginVersion, parse('4.4.0')))
    res.checksum = version.checksum
  if (greaterThan(pluginVersion, parse('6.8.0')) && manifest.length > 0)
    res.manifest = manifest
  return res
}

async function returnV2orV1<T>(
  c: Context,
  isV2: boolean,
  runV1: () => Promise<T>,
  runV2: () => Promise<T>,
): Promise<T> {
  // When v2 is enabled, only run v2 (D1) and do NOT touch v1 (PG)
  if (isV2) {
    return runV2()
  }
  // Disabled to no overload DB
  // In the v1 case, use PG as the source of truth, but kick off v2 in the background
  // if (getRuntimeKey() === 'workerd' && existInEnv(c, 'DB_REPLICA_EU')) {
  //   const replicatePromise = runV2().then((res) => {
  //     cloudlog({ requestId: c.get('requestId'), message: 'Completed background V2 function', res })
  //   }).catch((err) => {
  //     cloudlog({ requestId: c.get('requestId'), message: 'Error in background V2 function', err })
  //   })
  //   await backgroundTask(c, replicatePromise)
  // }
  return runV1()
}

export async function updateWithPG(
  c: Context,
  body: AppInfos,
  getDrizzleClientD1: () => ReturnType<typeof getDrizzleClientD1Session>,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
  isV2: boolean,
) {
  cloudlog({ requestId: c.get('requestId'), message: 'body', body, date: new Date().toISOString() })
  const {
    version_name,
    version_build,
    device_id,
    platform,
    app_id,
    version_os,
    plugin_version = '2.3.3',
    custom_id,
    defaultChannel,
    is_emulator = false,
    is_prod = true,
  } = body
  // if version_build is not semver, then make it semver
  const appOwner = await returnV2orV1(
    c,
    isV2,
    () => getAppOwnerPostgres(c, app_id, drizzleClient, PLAN_LIMIT),
    () => getAppOwnerPostgresV2(c, app_id, getDrizzleClientD1(), PLAN_LIMIT),
  )
  const device: DeviceWithoutCreatedAt = {
    app_id,
    device_id,
    plugin_version,
    version_name,
    custom_id,
    is_emulator,
    is_prod,
    version_build,
    os_version: version_os,
    platform: platform as Database['public']['Enums']['platform_os'],
    updated_at: new Date().toISOString(),
    default_channel: defaultChannel ?? null,
  }
  if (!appOwner) {
    return onPremStats(c, app_id, 'get', device)
  }
  const channelDeviceCount = appOwner.channel_device_count ?? 0
  const manifestBundleCount = appOwner.manifest_bundle_count ?? 0
  const bypassChannelOverrides = channelDeviceCount <= 0
  const pluginVersion = parse(plugin_version)
  // Ensure there is manifest and the plugin version support manifest fetching
  const fetchManifestEntries = manifestBundleCount > 0 && greaterOrEqual(pluginVersion, parse('6.25.0'))
  cloudlog({
    requestId: c.get('requestId'),
    message: 'App channel device count evaluated',
    app_id,
    channelDeviceCount,
    bypassChannelOverrides,
    manifestBundleCount,
    fetchManifestEntries,
  })
  if (body.version_build === 'unknown') {
    return simpleError200(c, 'unknown_version_build', 'Version build is unknown, cannot proceed with update', { body })
  }
  const coerce = tryParse(fixSemver(body.version_build))
  if (!coerce) {
    // get app owner with app_id
    await backgroundTask(c, sendNotifOrg(c, 'user:semver_issue', {
      app_id,
      device_id,
      version_id: version_build,
      app_id_url: app_id,
    }, appOwner.owner_org, app_id, '0 0 * * 1'))
    throw simpleError('semver_error', `Native version: ${body.version_build} doesn't follow semver convention, please check https://capgo.app/semver_tester/ to learn more about semver usage in Capgo`, { body })
  }
  // Check if plugin_version is deprecated and send notification
  // v6 is deprecated if < 6.25.0, v7 is deprecated if < 7.25.0, anything < 6.0.0 is deprecated
  const parsedPluginVersion = parse(plugin_version)
  const isDeprecated = lessThan(parsedPluginVersion, parse('6.0.0'))
    || (parsedPluginVersion.major === 6 && lessThan(parsedPluginVersion, parse('6.25.0')))
    || (parsedPluginVersion.major === 7 && lessThan(parsedPluginVersion, parse('7.25.0')))

  if (isDeprecated) {
    await backgroundTask(c, sendNotifOrg(c, 'user:plugin_issue', {
      app_id,
      device_id,
      version_id: version_build,
      app_id_url: app_id,
    }, appOwner.owner_org, app_id, '0 0 * * 1'))
  }
  if (!app_id || !device_id || !version_build || !version_name || !platform) {
    throw simpleError('missing_info', 'Cannot find device_id or app_id', { body })
  }

  if (!appOwner.plan_valid) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot update, upgrade plan to continue to update', id: app_id })
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    return simpleError200(c, 'need_plan_upgrade', 'Cannot update, upgrade plan to continue to update')
  }
  await backgroundTask(c, createStatsMau(c, device_id, app_id, appOwner.owner_org))

  cloudlog({ requestId: c.get('requestId'), message: 'vals', platform, device })

  const requestedInto = await returnV2orV1(
    c,
    isV2,
    () => requestInfosPostgres(c, platform, app_id, device_id, defaultChannel, drizzleClient, channelDeviceCount, manifestBundleCount),
    () => requestInfosPostgresV2(c, platform, app_id, device_id, defaultChannel, getDrizzleClientD1(), channelDeviceCount, manifestBundleCount),
  )
  const { channelOverride } = requestedInto
  let { channelData } = requestedInto
  cloudlog({ requestId: c.get('requestId'), message: `channelData exists ? ${channelData !== undefined}, channelOverride exists ? ${channelOverride !== undefined}` })

  if (!channelData && !channelOverride) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot get channel or override', id: app_id, date: new Date().toISOString() })
    await sendStatsAndDevice(c, device, [{ action: 'NoChannelOrOverride' }])
    return simpleError200(c, 'no_channel', 'no default channel or override')
  }

  // Trigger only if the channel is overwritten but the version is not
  if (channelOverride)
    channelData = channelOverride

  if (!channelData) {
    return simpleError200(c, 'null_channel_data', 'channel data still null')
  }

  const version = channelOverride?.version ?? channelData.version
  const manifestEntries = (channelOverride?.manifestEntries ?? channelData?.manifestEntries ?? []) as Partial<Database['public']['Tables']['manifest']['Row']>[]
  // device.version = versionData ? versionData.id : version.id

  // TODO: find better solution to check if device is from apple or google, currently not working in

  if (!version.external_url && !version.r2_path && !isInternalVersionName(version.name) && (!manifestEntries || manifestEntries.length === 0)) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot get bundle', id: app_id, version, manifestEntriesLength: manifestEntries ? manifestEntries.length : 0, channelData: channelData ? channelData.channels.name : 'no channel data', defaultChannel })
    await sendStatsAndDevice(c, device, [{ action: 'missingBundle', versionName: version.name }])
    return simpleError200(c, 'no_bundle', 'Cannot get bundle')
  }

  // cloudlog(c.get('requestId'), 'signedURL', device_id, version_name, version.name)
  if (version_name === version.name) {
    cloudlog({ requestId: c.get('requestId'), message: 'No new version available', id: device_id, version_name, version: version.name, date: new Date().toISOString() })
    // TODO: check why this event is send with wrong version_name
    await sendStatsAndDevice(c, device, [{ action: 'noNew', versionName: version.name }])
    return simpleError200(c, 'no_new_version_available', 'No new version available')
  }

  if (channelData) {
    // cloudlog(c.get('requestId'), 'check disableAutoUpdateToMajor', device_id)
    if (!channelData.channels.ios && platform === 'ios') {
      cloudlog({ requestId: c.get('requestId'), message: 'Cannot update, ios is disabled', id: device_id, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'disablePlatformIos', versionName: version.name }])
      return simpleError200(c, 'disabled_platform_ios', 'Cannot update, ios it\'s disabled', {
        version: version.name,
        old: version_name,
      })
    }
    if (!channelData.channels.android && platform === 'android') {
      cloudlog({ requestId: c.get('requestId'), message: 'Cannot update, android is disabled', id: device_id, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'disablePlatformAndroid', versionName: version.name }])
      cloudlog({ requestId: c.get('requestId'), message: 'sendStats', date: new Date().toISOString() })
      return simpleError200(c, 'disabled_platform_android', 'Cannot update, android is disabled', {
        version: version.name,
        old: version_name,
      })
    }
    if (!isInternalVersionName(version.name) && channelData?.channels.disable_auto_update === 'major' && parse(version.name).major > parse(version_build).major) {
      cloudlog({ requestId: c.get('requestId'), message: 'Cannot upgrade major version', id: device_id, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateToMajor', versionName: version.name }])
      return simpleError200(c, 'disable_auto_update_to_major', 'Cannot upgrade major version', {
        major: true,
        version: version.name,
        old: version_build,
      })
    }

    if (!channelData.channels.allow_device_self_set && !channelData.channels.public && !channelOverride) {
      cloudlog({ requestId: c.get('requestId'), message: 'Cannot update via a private channel', id: device_id, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'cannotUpdateViaPrivateChannel', versionName: version.name }])
      return simpleError200(c, 'cannot_update_via_private_channel', 'Cannot update via a private channel. Please ensure your defaultChannel has "Allow devices to self dissociate/associate" set to true')
    }

    if (!isInternalVersionName(version.name) && channelData.channels.disable_auto_update === 'minor' && parse(version.name).minor > parse(version_build).minor) {
      cloudlog({ requestId: c.get('requestId'), message: 'Cannot upgrade minor version', id: device_id, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateToMinor', versionName: version.name }])
      return simpleError200(c, 'disable_auto_update_to_minor', 'Cannot upgrade minor version', {
        major: true,
        version: version.name,
        old: version_build,
      })
    }

    cloudlog({ requestId: c.get('requestId'), message: 'version', version: version.name, old: version_name })
    if (!isInternalVersionName(version.name) && channelData.channels.disable_auto_update === 'patch' && !(
      parse(version.name).patch > parse(version_build).patch
      && parse(version.name).major === parse(version_build).major
      && parse(version.name).minor === parse(version_build).minor
    )) {
      cloudlog({ requestId: c.get('requestId'), message: 'Cannot upgrade patch version', id: device_id, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateToPatch', versionName: version.name }])
      return simpleError200(c, 'disable_auto_update_to_patch', 'Cannot upgrade patch version', {
        major: true,
        version: version.name,
        old: version_build,
      })
    }

    if (!isInternalVersionName(version.name) && channelData.channels.disable_auto_update === 'version_number') {
      const minUpdateVersion = version.min_update_version

      // The channel is misconfigured
      if (minUpdateVersion === null) {
        cloudlog({ requestId: c.get('requestId'), message: 'Channel is misconfigured', channel: channelData.channels.name, date: new Date().toISOString() })
        await sendStatsAndDevice(c, device, [{ action: 'channelMisconfigured', versionName: version.name }])
        return simpleError200(c, 'misconfigured_channel', `Channel ${channelData.channels.name} is misconfigured`, {
          version: version.name,
          old: version_build,
        })
      }

      // Check if the minVersion is greater then the current version
      if (greaterThan(parse(minUpdateVersion), parse(version_build))) {
        cloudlog({ requestId: c.get('requestId'), message: 'Cannot upgrade, metadata > current version', id: device_id, min: minUpdateVersion, old: version_name, date: new Date().toISOString() })
        await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateMetadata', versionName: version.name }])
        return simpleError200(c, 'disable_auto_update_to_metadata', 'Cannot upgrade version, min update version > current version', {
          major: true,
          version: version.name,
          old: version_build,
        })
      }
    }

    // cloudlog(c.get('requestId'), 'check disableAutoUpdateUnderNative', device_id)
    if (!isInternalVersionName(version.name) && channelData.channels.disable_auto_update_under_native && lessThan(parse(version.name), parse(version_build))) {
      cloudlog({ requestId: c.get('requestId'), message: 'Cannot revert under native version', id: device_id, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateUnderNative', versionName: version.name }])
      return simpleError200(c, 'disable_auto_update_under_native', 'Cannot revert under native version', {
        version: version.name,
        old: version_name,
      })
    }

    if (!channelData.channels.allow_dev && !is_prod) {
      cloudlog({ requestId: c.get('requestId'), message: 'Cannot update dev build is disabled', id: device_id, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'disableDevBuild', versionName: version.name }])
      return simpleError200(c, 'disable_dev_build', 'Cannot update, dev build is disabled', {
        version: version.name,
        old: version_name,
      })
    }
    if (!channelData.channels.allow_emulator && is_emulator) {
      cloudlog({ requestId: c.get('requestId'), message: 'Cannot update emulator is disabled', id: device_id, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'disableEmulator', versionName: version.name }])
      return simpleError200(c, 'disable_emulator', 'Cannot update, emulator is disabled', {
        version: version.name,
        old: version_name,
      })
    }
  }
  if (version.name === 'builtin' && greaterOrEqual(parse(plugin_version), parse('6.2.0'))) {
    if (body.version_name === 'builtin' && version.name === 'builtin') {
      return simpleError200(c, 'already_on_builtin', 'Already on builtin')
    }
    else {
      return simpleError200(c, 'already_on_builtin', 'Already on builtin', {
        version: 'builtin',
      })
    }
  }
  else if (version.name === 'builtin' && !greaterOrEqual(parse(plugin_version), parse('6.2.0'))) {
    return simpleError200(c, 'revert_to_builtin_plugin_version_too_old', 'revert_to_builtin used, but plugin version is too old')
  }
  const startBundleUrl = performance.now()
  let signedURL = version.external_url ?? ''
  let manifest: ManifestEntry[] = []
  if (!version.external_url) {
    if (version.r2_path) {
      const url = await getBundleUrl(c, version.r2_path, device_id, version.checksum ?? '')
      if (url) {
        // only count the size of the bundle if it's not external and zip for now
        signedURL = url
        if (getRuntimeKey() !== 'workerd') {
          await backgroundTask(c, async () => {
            const size = await s3.getSize(c, version.r2_path)
            await createStatsBandwidth(c, device_id, app_id, size ?? 0)
          })
        }
      }
    }
    manifest = getManifestUrl(c, version.id, manifestEntries, device_id)
  }
  const endBundleUrl = performance.now()
  cloudlog({ requestId: c.get('requestId'), message: 'bundle_url_timing', duration: `${endBundleUrl - startBundleUrl}ms`, date: new Date().toISOString() })
  //  check signedURL and if it's url
  if ((!signedURL || (!(signedURL.startsWith('http://') || signedURL.startsWith('https://')))) && !manifest.length) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot get bundle signedURL', url: signedURL, id: app_id, date: new Date().toISOString() })
    await sendStatsAndDevice(c, device, [{ action: 'cannotGetBundle', versionName: version.name }])
    return simpleError200(c, 'no_bundle_url', 'Cannot get bundle url')
  }
  if (manifest.length && !signedURL) {
    // TODO: remove this when all plugin accept no URL
    signedURL = 'https://404.capgo.app/no.zip'
  }
  // cloudlog(c.get('requestId'), 'save stats', device_id)
  device.version_name = version.name
  await Promise.all([
    createStatsVersion(c, version.id, app_id, 'get'),
    sendStatsAndDevice(c, device, [{ action: 'get', versionName: version.name }]),
  ])
  cloudlog({ requestId: c.get('requestId'), message: 'New version available', app_id, version: version.name, signedURL, date: new Date().toISOString() })
  const res = resToVersion(plugin_version, signedURL, version as any, manifest)
  if (!res.url && !res.manifest) {
    cloudlog({ requestId: c.get('requestId'), message: 'No url or manifest', id: app_id, version: version.name, date: new Date().toISOString() })
    return simpleError200(c, 'no_url_or_manifest', 'No url or manifest')
  }
  return c.json(res, 200)
}

export async function update(c: Context, body: AppInfos) {
  const isV2 = getIsV2(c)
  const pgClient = isV2 ? null : getPgClient(c, true) // READ-ONLY: writes use SDK, not Drizzle

  const drizzlePg = pgClient ? getDrizzleClient(pgClient) : (null as any)
  // Lazily create D1 client inside updateWithPG when actually used
  const res = await updateWithPG(c, body, () => getDrizzleClientD1Session(c), drizzlePg, !!isV2)
  if (!isV2 && pgClient)
    await closeClient(c, pgClient)
  return res
}
