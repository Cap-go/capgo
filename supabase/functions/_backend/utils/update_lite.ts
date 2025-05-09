import type { Context } from '@hono/hono'
import type { ManifestEntry } from './downloadUrl.ts'
import type { getDrizzleClientD1 } from './pg.ts'
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
import { closeClient, getAppOwnerPostgres, getAppOwnerPostgresV2, getDrizzleClient, getDrizzleClientD1Session, getPgClient, isAllowedActionOrgActionD1, isAllowedActionOrgActionPg, requestInfosPostgresLite, requestInfosPostgresLiteV2 } from './pg.ts'
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

export async function updateWithPG(c: Context, body: AppInfos, drizzleCient: ReturnType<typeof getDrizzleClient> | ReturnType<typeof getDrizzleClientD1>, isV2: boolean = false) {
  try {
    console.log({ requestId: c.get('requestId'), message: 'body', body, date: new Date().toISOString() })
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
      console.log({ requestId: c.get('requestId'), message: 'App not found', id: app_id, date: new Date().toISOString() })
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
      console.log({ requestId: c.get('requestId'), message: 'semver_issue', app_id, version_build })
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
      console.log({ requestId: c.get('requestId'), message: 'missing_info', app_id, device_id, version_build, version_name, platform })
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
    const planValid = isV2 ? await isAllowedActionOrgActionD1(c, drizzleCient as ReturnType<typeof getDrizzleClientD1>, appOwner.orgs.id, ['mau', 'bandwidth']) : await isAllowedActionOrgActionPg(c, drizzleCient as ReturnType<typeof getDrizzleClient>, appOwner.orgs.id, ['mau', 'bandwidth'])
    if (!planValid) {
      console.log({ requestId: c.get('requestId'), message: 'Cannot update, upgrade plan to continue to update', id: app_id })
      await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
      return c.json({
        message: 'Cannot update, upgrade plan to continue to update',
        error: 'need_plan_upgrade',
      }, 200)
    }
    await backgroundTask(c, createStatsMau(c, device_id, app_id))

    console.log({ requestId: c.get('requestId'), message: 'vals', platform, device })

    const requestedInto = isV2 ? await requestInfosPostgresLiteV2(app_id, version_name, drizzleCient as ReturnType<typeof getDrizzleClientD1>) : await requestInfosPostgresLite(app_id, version_name, drizzleCient as ReturnType<typeof getDrizzleClient>)

    const { versionData } = requestedInto
    const { channelData } = requestedInto

    if (!versionData) {
      console.log({ requestId: c.get('requestId'), message: 'No version data found' })
      return c.json({
        message: 'Couldn\'t find version data',
        error: 'no-version_data',
      }, 200)
    }

    if (!channelData) {
      console.log({ requestId: c.get('requestId'), message: 'Cannot get channel', id: app_id, date: new Date().toISOString() })
      if (versionData)
        await sendStatsAndDevice(c, device, [{ action: 'update_fail', versionId: versionData.id }])

      return c.json({
        message: 'no default channel',
        error: 'no_channel',
      }, 200)
    }

    const version = channelData.version
    device.version = versionData ? versionData.id : version.id

    if (!version.external_url && !version.r2_path && version.name !== 'builtin') {
      console.log({ requestId: c.get('requestId'), message: 'Cannot get bundle', id: app_id, version })
      await sendStatsAndDevice(c, device, [{ action: 'missingBundle' }])
      return c.json({
        message: 'Cannot get bundle',
        error: 'no_bundle',
      }, 200)
    }

    if (version_name === version.name) {
      console.log({ requestId: c.get('requestId'), message: 'No new version available', id: device_id, version_name, version: version.name, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'noNew' }])
      return c.json({
        message: 'No new version available',
      }, 200)
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
    if (version.r2_path && !version.external_url) {
      const res = await getBundleUrl(c, version.id, version.r2_path, device_id)
      if (res) {
        signedURL = res.url
        // only count the size of the bundle if it's not external
        await backgroundTask(c, createStatsBandwidth(c, device_id, app_id, res.size ?? 0))
      }
      if (greaterThan(parse(plugin_version), parse('6.2.0'))) {
        manifest = getManifestUrl(c, version.id, channelData.manifestEntries || [], device_id)
      }
    }
    //  check signedURL and if it's url
    if (!signedURL && (!signedURL.startsWith('http://') || !signedURL.startsWith('https://'))) {
      console.log({ requestId: c.get('requestId'), message: 'Cannot get bundle signedURL', url: signedURL, id: app_id, date: new Date().toISOString() })
      await sendStatsAndDevice(c, device, [{ action: 'cannotGetBundle' }])
      return c.json({
        message: 'Cannot get bundle url',
        error: 'no_bundle_url',
      }, 200)
    }
    await backgroundTask(c, Promise.all([
      createStatsVersion(c, version.id, app_id, 'get'),
      sendStatsAndDevice(c, device, [{ action: 'get' }]),
    ]))
    console.log({ requestId: c.get('requestId'), message: 'New version available', app_id, version: version.name, signedURL, date: new Date().toISOString() })
    const res = resToVersion(plugin_version, signedURL, version as any, manifest)
    if (!res.url && !res.manifest) {
      console.log({ requestId: c.get('requestId'), message: 'No url or manifest', id: app_id, version: version.name, date: new Date().toISOString() })
      return c.json({
        message: 'No url or manifest',
        error: 'no_url_or_manifest',
      }, 200)
    }
    return c.json(res, 200)
  }
  catch (e) {
    console.error({ requestId: c.get('requestId'), message: 'update', error: JSON.stringify(e), body })
    return c.json({
      message: `Error unknow ${JSON.stringify(e)}`,
      error: 'unknow_error',
    }, 500)
  }
}

export async function update(c: Context, body: AppInfos) {
  let pgClient
  let isV2 = false
  if (c.req.url.endsWith('/updates_lite_v2') && getRuntimeKey() === 'workerd') {
    isV2 = true
  }
  if (!isV2 && getRuntimeKey() === 'workerd') {
    // make 10% chance to use v2 with D1 read replicate to test the performance
    isV2 = Math.random() < 0.1
  }
  // check if URL ends with update_v2 if yes do not init PG
  if (isV2) {
    console.log({ requestId: c.get('requestId'), message: 'update2', isV2 })
    pgClient = null
  }
  else {
    pgClient = getPgClient(c)
  }

  let res
  try {
    res = await updateWithPG(c, body, isV2 ? getDrizzleClientD1Session(c) : getDrizzleClient(pgClient as any), isV2)
  }
  catch (e) {
    console.error({ requestId: c.get('requestId'), message: 'update', error: e })
    return c.json({
      message: `Error unknow ${JSON.stringify(e)}`,
      error: 'unknow_error',
    }, 500)
  }
  if (isV2 && pgClient)
    await closeClient(c, pgClient)
  return res
}
