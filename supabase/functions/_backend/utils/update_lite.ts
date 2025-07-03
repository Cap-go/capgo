import type { Context } from 'hono'
import type { ManifestEntry } from './downloadUrl.ts'
import type { getDrizzleClientD1 } from './pg_d1.ts'
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
import { backgroundTask, fixSemver, getEnv } from '../utils/utils.ts'
import { createIfNotExistStoreInfo } from './cloudflare.ts'
import { appIdToUrl } from './conversion.ts'
import { getBundleUrl, getManifestUrl } from './downloadUrl.ts'
import { simpleError, simpleError200 } from './hono.ts'
import { cloudlog } from './loggin.ts'
import { sendNotifOrg } from './notifications.ts'
import { closeClient, getAppOwnerPostgres, getDrizzleClient, getPgClient, isAllowedActionOrgActionPg } from './pg.ts'
import { getAppOwnerPostgresV2, getDrizzleClientD1Session, isAllowedActionOrgActionD1 } from './pg_d1.ts'
import { requestInfosPostgresLite, requestInfosPostgresLiteV2 } from './pg_lite.ts'
import { createStatsBandwidth, createStatsMau, createStatsVersion, sendStatsAndDevice } from './stats.ts'

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
    res.session_key = version.session_key ?? ''
  if (greaterThan(pluginVersion, parse('4.4.0')))
    res.checksum = version.checksum
  if (greaterThan(pluginVersion, parse('6.8.0')) && manifest.length > 0)
    res.manifest = manifest
  return res
}

export async function updateWithPG(c: Context, body: AppInfos, drizzleCient: ReturnType<typeof getDrizzleClient> | ReturnType<typeof getDrizzleClientD1>, isV2: boolean = false) {
  cloudlog({ requestId: c.get('requestId'), message: 'body', body, date: new Date().toISOString() })
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
    cloudlog({ requestId: c.get('requestId'), message: 'App not found', id: app_id, date: new Date().toISOString() })
    return simpleError200(c, 'app_not_found', 'App not found', { app_id })
  }
  if (!coerce) {
    // get app owner with app_id
    await backgroundTask(c, sendNotifOrg(c, 'user:semver_issue', {
      app_id,
      device_id,
      version_id: version_build,
      app_id_url: appIdToUrl(app_id),
    }, appOwner.owner_org, app_id, '0 0 * * 1'))
    cloudlog({ requestId: c.get('requestId'), message: 'semver_issue', app_id, version_build })
    return simpleError200(c, 'semver_error', `Native version: ${version_build} doesn't follow semver convention, please follow https://capgo.app/semver_tester/ to allow Capgo compare version number`)
  }
  version_build = format(coerce)
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
    cloudlog({ requestId: c.get('requestId'), message: 'missing_info', app_id, device_id, version_build, version_name, platform })
    return simpleError200(c, 'missing_info', 'Cannot find device_id or appi_id')
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
  const planValid = isV2 ? await isAllowedActionOrgActionD1(c, drizzleCient as ReturnType<typeof getDrizzleClientD1>, appOwner.orgs.id, ['mau', 'bandwidth']) : await isAllowedActionOrgActionPg(c, drizzleCient as ReturnType<typeof getDrizzleClient>, appOwner.orgs.id, ['mau', 'bandwidth'])
  if (!planValid) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot update, upgrade plan to continue to update', id: app_id })
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    return simpleError200(c, 'need_plan_upgrade', 'Cannot update, upgrade plan to continue to update')
  }
  await backgroundTask(c, createStatsMau(c, device_id, app_id))

  cloudlog({ requestId: c.get('requestId'), message: 'vals', platform, device })

  const requestedInto = isV2 ? await requestInfosPostgresLiteV2(c, app_id, version_name, drizzleCient as ReturnType<typeof getDrizzleClientD1>) : await requestInfosPostgresLite(c, app_id, version_name, drizzleCient as ReturnType<typeof getDrizzleClient>)

  const { versionData } = requestedInto
  const { channelData } = requestedInto

  if (!versionData) {
    cloudlog({ requestId: c.get('requestId'), message: 'No version data found' })
    return simpleError200(c, 'no-version_data', 'Couldn\'t find version data')
  }

  if (!channelData) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot get channel', id: app_id, date: new Date().toISOString() })
    if (versionData)
      await sendStatsAndDevice(c, device, [{ action: 'update_fail', versionId: versionData.id }])

    return simpleError200(c, 'no_channel', 'no default channel')
  }

  const version = channelData.version
  device.version = versionData ? versionData.id : version.id

  if (!version.external_url && !version.r2_path && version.name !== 'builtin') {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot get bundle', id: app_id, version })
    await sendStatsAndDevice(c, device, [{ action: 'missingBundle' }])
    return simpleError200(c, 'no_bundle', 'Cannot get bundle')
  }

  if (version_name === version.name) {
    cloudlog({ requestId: c.get('requestId'), message: 'No new version available', id: device_id, version_name, version: version.name, date: new Date().toISOString() })
    await sendStatsAndDevice(c, device, [{ action: 'noNew' }])
    return simpleError200(c, 'no_new_version', 'No new version available')
  }

  if (version.name === 'builtin' && greaterOrEqual(parse(plugin_version), parse('6.2.0'))) {
    if (body.version_name === 'builtin' && version.name === 'builtin') {
      return simpleError200(c, 'already_on_builtin', 'Already on builtin')
    }
    else {
      return c.json({ version: 'builtin' }, 200)
    }
  }
  else if (version.name === 'builtin' && !greaterOrEqual(parse(plugin_version), parse('6.2.0'))) {
    return simpleError200(c, 'revert_to_builtin_plugin_version_too_old', 'revert_to_builtin used, but plugin version is too old')
  }
  let signedURL = version.external_url ?? ''
  let manifest: ManifestEntry[] = []
  if (version.r2_path && !version.external_url) {
    const res = await getBundleUrl(c, version.id, version.r2_path, device_id)
    if (res) {
      signedURL = res.url
      // only count the size of the bundle if it's not external
      await backgroundTask(c, createStatsBandwidth(c, device_id, app_id, res.size ?? 0))
    }
    if (greaterThan(parse(plugin_version), parse('6.2.0'))) {
      manifest = getManifestUrl(c, version.id, channelData.manifestEntries ?? [], device_id)
    }
  }
  //  check signedURL and if it's url
  if (!signedURL && (!signedURL.startsWith('http://') || !signedURL.startsWith('https://'))) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot get bundle signedURL', url: signedURL, id: app_id, date: new Date().toISOString() })
    await sendStatsAndDevice(c, device, [{ action: 'cannotGetBundle' }])
    return simpleError200(c, 'no_bundle_url', 'Cannot get bundle url')
  }
  await backgroundTask(c, Promise.all([
    createStatsVersion(c, version.id, app_id, 'get'),
    sendStatsAndDevice(c, device, [{ action: 'get' }]),
  ]))
  cloudlog({ requestId: c.get('requestId'), message: 'New version available', app_id, version: version.name, signedURL, date: new Date().toISOString() })
  const res = resToVersion(plugin_version, signedURL, version as any, manifest)
  if (!res.url && !res.manifest) {
    cloudlog({ requestId: c.get('requestId'), message: 'No url or manifest', id: app_id, version: version.name, date: new Date().toISOString() })
    return simpleError200(c, 'no_url_or_manifest', 'No url or manifest')
  }
  return c.json(res, 200)
}

export async function update(c: Context, body: AppInfos) {
  let pgClient
  let isV2 = getRuntimeKey() === 'workerd' ? Number.parseFloat(getEnv(c, 'IS_V2') ?? '0') : 0.0
  if (c.req.url.endsWith('/updates_lite_v2') && getRuntimeKey() === 'workerd') {
    // force v2 for lite update v2
    isV2 = 1.0
  }
  // check if URL ends with update_v2 if yes do not init PG
  if (isV2 && Math.random() < isV2) {
    cloudlog({ requestId: c.get('requestId'), message: 'update2', isV2 })
    pgClient = null
  }
  else {
    pgClient = getPgClient(c)
  }

  let res
  try {
    res = await updateWithPG(c, body, isV2 ? getDrizzleClientD1Session(c) : getDrizzleClient(pgClient as any), !!isV2)
  }
  catch (e) {
    throw simpleError('unknow_error', `Error unknow ${JSON.stringify(e)}`, { e })
  }
  if (isV2 && pgClient)
    await closeClient(c, pgClient)
  return res
}
