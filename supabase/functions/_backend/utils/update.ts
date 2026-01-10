import type { Context } from 'hono'
import type { ManifestEntry } from './downloadUrl.ts'
import type { Database } from './supabase.types.ts'
import type { AppInfos } from './types.ts'
import {
  greaterOrEqual,
  greaterThan,
  lessThan,
  parse,
  tryParse,
} from '@std/semver'
import { getRuntimeKey } from 'hono/adapter'
import { getAppStatus, setAppStatus } from './appStatus.ts'
import { getBundleUrl, getManifestUrl } from './downloadUrl.ts'
import { simpleError200 } from './hono.ts'
import { cloudlog } from './logging.ts'
import { sendNotifOrg } from './notifications.ts'
import { closeClient, getAppOwnerPostgres, getDrizzleClient, getPgClient, requestInfosPostgres, setReplicationLagHeader } from './pg.ts'
import { makeDevice } from './plugin_parser.ts'
import { s3 } from './s3.ts'
import { createStatsBandwidth, createStatsMau, createStatsVersion, onPremStats, sendStatsAndDevice } from './stats.ts'
import { backgroundTask, BROTLI_MIN_UPDATER_VERSION_V5, BROTLI_MIN_UPDATER_VERSION_V6, BROTLI_MIN_UPDATER_VERSION_V7, fixSemver, isDeprecatedPluginVersion, isInternalVersionName } from './utils.ts'

const PLAN_LIMIT: Array<'mau' | 'bandwidth' | 'storage'> = ['mau', 'bandwidth']
const PLAN_ERROR = 'Cannot get update, upgrade plan to continue to update'

export function resToVersion(plugin_version: string, signedURL: string, version: Database['public']['Tables']['app_versions']['Row'], manifest: ManifestEntry[], expose_metadata: boolean = false) {
  const pluginVersion = parse(plugin_version)
  const res: {
    version: string
    url: string
    session_key: string
    checksum: string | null
    manifest?: ManifestEntry[]
    link?: string | null
    comment?: string | null
  } = {
    version: version.name,
    url: signedURL,
    // session_key and checksum are always included since v4 is no longer supported
    session_key: version.session_key ?? '',
    checksum: version.checksum,
  }
  // manifest is supported in v5.10.0+, v6.25.0+, v7.0.35+, v8+
  if (manifest.length > 0 && !isDeprecatedPluginVersion(pluginVersion, BROTLI_MIN_UPDATER_VERSION_V5, BROTLI_MIN_UPDATER_VERSION_V6, BROTLI_MIN_UPDATER_VERSION_V7))
    res.manifest = manifest
  // Include link and comment for plugin v5.35.0+, v6.35.0+, v7.35.0+, v8.35.0+ (only if expose_metadata is enabled and they have values)
  if (expose_metadata && !isDeprecatedPluginVersion(pluginVersion, '5.35.0', '6.35.0', '7.35.0', '8.35.0')) {
    if (version.link)
      res.link = version.link
    if (version.comment)
      res.comment = version.comment
  }
  return res
}

export async function updateWithPG(
  c: Context,
  body: AppInfos,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
) {
  cloudlog({ requestId: c.get('requestId'), message: 'body', body, date: new Date().toISOString() })
  const {
    version_name,
    version_build,
    device_id,
    platform,
    app_id,
    plugin_version = '2.3.3',
    defaultChannel,
  } = body
  // if version_build is not semver, then make it semver
  const device = makeDevice(body)
  const cachedStatus = await getAppStatus(c, app_id)
  if (cachedStatus === 'onprem') {
    return onPremStats(c, app_id, 'get', device)
  }
  if (cachedStatus === 'cancelled') {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot update, upgrade plan to continue to update', id: app_id })
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    return simpleError200(c, 'need_plan_upgrade', PLAN_ERROR)
  }
  const appOwner = await getAppOwnerPostgres(c, app_id, drizzleClient, PLAN_LIMIT)
  if (!appOwner) {
    await setAppStatus(c, app_id, 'onprem')
    return onPremStats(c, app_id, 'get', device)
  }
  if (!appOwner.plan_valid) {
    await setAppStatus(c, app_id, 'cancelled')
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot update, upgrade plan to continue to update', id: app_id })
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    // Send weekly notification about missing payment (not configurable - payment related)
    await backgroundTask(c, sendNotifOrg(c, 'org:missing_payment', {
      app_id,
      device_id,
      app_id_url: app_id,
    }, appOwner.owner_org, app_id, '0 0 * * 1')) // Weekly on Monday
    return simpleError200(c, 'need_plan_upgrade', PLAN_ERROR)
  }
  await setAppStatus(c, app_id, 'cloud')
  const channelDeviceCount = appOwner.channel_device_count ?? 0
  const manifestBundleCount = appOwner.manifest_bundle_count ?? 0
  const bypassChannelOverrides = channelDeviceCount <= 0
  const pluginVersion = parse(plugin_version)
  // v5 is deprecated if < 5.10.0, v6 is deprecated if < 6.25.0, v7 is deprecated if < 7.25.0
  const isDeprecated = isDeprecatedPluginVersion(pluginVersion)
  // Ensure there is manifest and the plugin version support manifest fetching (v5.10.0+, v6.25.0+, v7.0.35+)
  const fetchManifestEntries = manifestBundleCount > 0 && !isDeprecatedPluginVersion(pluginVersion, undefined, undefined, BROTLI_MIN_UPDATER_VERSION_V7)
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
    return simpleError200(c, 'semver_error', `Native version: ${body.version_build} doesn't follow semver convention, please check https://capgo.app/semver_tester/ to learn more about semver usage in Capgo`)
  }
  // Reject v4 completely - it's no longer supported
  if (pluginVersion.major === 4) {
    cloudlog({ requestId: c.get('requestId'), message: 'Plugin version 4.x is no longer supported', plugin_version, app_id })
    await backgroundTask(c, sendNotifOrg(c, 'user:plugin_issue', {
      app_id,
      device_id,
      version_id: version_build,
      app_id_url: app_id,
    }, appOwner.owner_org, app_id, '0 0 * * 1'))
    await sendStatsAndDevice(c, device, [{ action: 'backend_refusal' }])
    return simpleError200(c, 'unsupported_plugin_version', `Plugin version ${plugin_version} (v4) is no longer supported. Please upgrade to v5.10.0 or later.`)
  }

  // Check if plugin_version is deprecated and send notification
  if (isDeprecated) {
    await backgroundTask(c, sendNotifOrg(c, 'user:plugin_issue', {
      app_id,
      device_id,
      version_id: version_build,
      app_id_url: app_id,
    }, appOwner.owner_org, app_id, '0 0 * * 1'))
  }
  if (!app_id || !device_id || !version_build || !version_name || !platform) {
    return simpleError200(c, 'missing_info', 'Cannot find device_id or app_id')
  }

  await backgroundTask(c, createStatsMau(c, device_id, app_id, appOwner.owner_org, platform))

  cloudlog({ requestId: c.get('requestId'), message: 'vals', platform, device })

  // Only query link/comment if plugin supports it (v5.35.0+, v6.35.0+, v7.35.0+, v8.35.0+) AND app has expose_metadata enabled
  const needsMetadata = appOwner.expose_metadata && !isDeprecatedPluginVersion(pluginVersion, '5.35.0', '6.35.0', '7.35.0', '8.35.0')

  const requestedInto = await requestInfosPostgres(c, platform, app_id, device_id, defaultChannel, drizzleClient, channelDeviceCount, manifestBundleCount, needsMetadata)
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

  // Check for encryption key mismatch between device and bundle
  // Only check if both device and bundle have key_id set (encrypted bundle)
  // Only enforce for plugin_version > 8.40.7 (transitional period for key_id format change from 4 to 20 chars)
  if (body.key_id && version.key_id && body.key_id !== version.key_id && greaterThan(pluginVersion, parse('8.40.7'))) {
    cloudlog({ requestId: c.get('requestId'), message: 'Encryption key mismatch', device_id, deviceKeyId: body.key_id, bundleKeyId: version.key_id, versionName: version.name })
    await sendStatsAndDevice(c, device, [{ action: 'keyMismatch', versionName: version.name }])
    return simpleError200(c, 'key_id_mismatch', 'Device encryption key does not match bundle encryption key. The device may have a different public key than the one used to encrypt this bundle.', {
      deviceKeyId: body.key_id,
      bundleKeyId: version.key_id,
    })
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
      const errorMessage = defaultChannel
        ? `Cannot update via a private channel. The channel "${channelData.channels.name}" does not allow device self-assignment. Please ensure your defaultChannel "${defaultChannel}" has "Allow devices to self dissociate/associate" set to true.`
        : `Cannot update via a private channel. The channel "${channelData.channels.name}" does not allow device self-assignment. Please set a defaultChannel with "Allow devices to self dissociate/associate" enabled.`
      return simpleError200(c, 'cannot_update_via_private_channel', errorMessage)
    }

    if (!isInternalVersionName(version.name) && channelData.channels.disable_auto_update === 'minor' && (
      parse(version.name).major !== parse(version_build).major
      || parse(version.name).minor !== parse(version_build).minor
    )) {
      cloudlog({ requestId: c.get('requestId'), message: 'Cannot upgrade minor version', id: device_id, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateToMinor', versionName: version.name }])
      return simpleError200(c, 'disable_auto_update_to_minor', 'Cannot upgrade minor version', {
        major: true,
        version: version.name,
        old: version_build,
      })
    }

    cloudlog({ requestId: c.get('requestId'), message: 'version', version: version.name, old: version_name })
    if (!isInternalVersionName(version.name) && channelData.channels.disable_auto_update === 'patch' && (
      parse(version.name).major !== parse(version_build).major
      || parse(version.name).minor !== parse(version_build).minor
      || parse(version.name).patch !== parse(version_build).patch
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

    if (!channelData.channels.allow_prod && body.is_prod) {
      cloudlog({ requestId: c.get('requestId'), message: 'Cannot update prod build is disabled', id: device_id, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'disableProdBuild', versionName: version.name }])
      return simpleError200(c, 'disable_prod_build', 'Cannot update, prod build is disabled', {
        version: version.name,
        old: version_name,
      })
    }
    if (!channelData.channels.allow_dev && !body.is_prod) {
      cloudlog({ requestId: c.get('requestId'), message: 'Cannot update dev build is disabled', id: device_id, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'disableDevBuild', versionName: version.name }])
      return simpleError200(c, 'disable_dev_build', 'Cannot update, dev build is disabled', {
        version: version.name,
        old: version_name,
      })
    }
    if (!channelData.channels.allow_device && !body.is_emulator) {
      cloudlog({ requestId: c.get('requestId'), message: 'Cannot update device is disabled', id: device_id, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'disableDevice', versionName: version.name }])
      return simpleError200(c, 'disable_device', 'Cannot update, device is disabled', {
        version: version.name,
        old: version_name,
      })
    }
    if (!channelData.channels.allow_emulator && body.is_emulator) {
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
  const res = resToVersion(plugin_version, signedURL, version as any, manifest, needsMetadata)
  if (!res.url && !res.manifest) {
    cloudlog({ requestId: c.get('requestId'), message: 'No url or manifest', id: app_id, version: version.name, date: new Date().toISOString() })
    return simpleError200(c, 'no_url_or_manifest', 'No url or manifest')
  }
  return c.json(res, 200)
}

export async function update(c: Context, body: AppInfos) {
  const pgClient = getPgClient(c, true)

  // Set replication lag header (uses cached status, non-blocking)
  await setReplicationLagHeader(c, pgClient)

  const drizzlePg = pgClient ? getDrizzleClient(pgClient) : (null as any)
  // Lazily create D1 client inside updateWithPG when actually used
  const res = await updateWithPG(c, body, drizzlePg)
  if (pgClient)
    await closeClient(c, pgClient)
  return res
}
