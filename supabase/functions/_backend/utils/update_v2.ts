import cryptoRandomString from 'crypto-random-string'
import * as semver from 'semver'
import type { Context } from 'hono'
import { drizzle as drizzle_postgress } from 'drizzle-orm/postgres-js'
import { and, eq, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import postgres from 'postgres'
// import { getRuntimeKey } from 'hono/adapter'
import { isAllowedActionOrg } from './supabase.ts'
import type { AppInfos } from './types.ts'
import type { Database } from './supabase.types.ts'
import { sendNotifOrg } from './notifications.ts'
import { getBundleUrl } from './downloadUrl.ts'
import { logsnag } from './logsnag.ts'
import { appIdToUrl } from './conversion.ts'

import * as schema from './postgress_schema.ts'
import type { DeviceWithoutCreatedAt } from './stats.ts'
// import { backgroundTask } from './utils.ts'
import { backgroundTask, existInEnv, getEnv } from './utils.ts'
import { createStatsBandwidth, createStatsMau, createStatsVersion, sendStatsAndDevice } from './stats.ts'

async function requestInfosPostgres(
  platform: string,
  app_id: string,
  device_id: string,
  defaultChannel: string | undefined,
  drizzleClient: ReturnType<typeof drizzle_postgress>,
) {
  let mainConditions
  let orderByClause

  if (defaultChannel) {
    // If defaultChannel exists, prioritize this condition and ignore others
    mainConditions = and(
      eq(schema.version_info.app_id, app_id),
      eq(schema.version_info.channel_name, defaultChannel),
      eq(schema.version_info.allow_device_self_set, true),
    )

    orderByClause = [
      // Prioritize default channel
      sql`CASE WHEN version_info.channel_name = ${defaultChannel} THEN 0 ELSE 1 END`,
      sql`version_info.updated_at DESC`, // Optional: Order by update timestamp if needed
    ]
  }
  else {
    // Define the main query conditions for device-specific and public entries
    mainConditions = and(
      eq(schema.version_info.app_id, app_id),
      or(
        // Device-specific match
        eq(schema.version_info.device_id, device_id),
        // Public entry
        eq(schema.version_info.public, true),
      ),
    )

    orderByClause = [
      // Prioritization order:
      // 1. Device-specific entries
      // 2. Platform-specific public entries
      sql`CASE
            WHEN version_info.device_id = ${device_id} THEN 0
            WHEN ${platform} = 'android' AND version_info.android = TRUE THEN 1
            WHEN ${platform} = 'ios' AND version_info.ios = TRUE THEN 1
            ELSE 2
          END`,
    ]
  }

  // Fetch the version info with the necessary conditions
  const versionInfo = await drizzleClient
    .select()
    .from(schema.version_info)
    .where(mainConditions)
    .orderBy(...orderByClause)
    .limit(1)
    .then(data => data.at(0))

  return versionInfo
}

async function getAppOwnerPostgres(
  appId: string,
  drizzleCient: ReturnType<typeof drizzle_postgress>,
): Promise<{ owner_org: string, orgs: { created_by: string, id: string } } | null> {
  try {
    const appOwner = await drizzleCient
      .select({
        owner_org: schema.apps.owner_org,
        orgs: {
          created_by: schema.orgs.created_by,
          id: schema.orgs.id,
        },
      })
      .from(schema.apps)
      .where(eq(schema.apps.app_id, appId))
      .innerJoin(alias(schema.orgs, 'orgs'), eq(schema.apps.owner_org, schema.orgs.id))
      .limit(1)
      .then(data => data[0])

    return appOwner
  }
  catch (e: any) {
    console.error('getAppOwnerPostgres', e)
    return null
  }
}

export async function updateWithPG(c: Context, body: AppInfos, drizzleClient: ReturnType<typeof drizzle_postgress>) {
  const LogSnag = logsnag(c)
  const id = cryptoRandomString({ length: 10 })

  try {
    console.log(id, 'body', body, new Date().toISOString())

    let { version_name, version_build } = body
    const { platform, app_id, device_id, version_os, plugin_version = '2.3.3', custom_id, defaultChannel, is_emulator = false, is_prod = true } = body

    // Ensure version_build is valid semver
    const coerce = semver.coerce(version_build, { includePrerelease: true })
    const appOwner = await getAppOwnerPostgres(app_id, drizzleClient)

    if (!appOwner) {
      console.log(id, 'App not found', app_id, new Date().toISOString())
      return c.json({ message: 'App not found', error: 'app_not_found' }, 200)
    }

    if (coerce) {
      version_build = coerce.version
    }
    else {
      const sent = await sendNotifOrg(c, 'user:semver_issue', {
        current_app_id: app_id,
        current_device_id: device_id,
        current_version_id: version_build,
        current_app_id_url: appIdToUrl(app_id),
      }, appOwner.owner_org, app_id, '0 0 * * 1', 'red')

      if (sent) {
        await LogSnag.track({
          channel: 'updates',
          event: 'semver issue',
          icon: '⚠️',
          user_id: appOwner.owner_org,
          notify: false,
        }).catch()
      }

      return c.json({
        message: `Native version: ${version_build} doesn't follow semver convention`,
        error: 'semver_error',
      }, 400)
    }

    if (semver.lt(plugin_version, '5.0.0')) {
      const sent = await sendNotifOrg(c, 'user:plugin_issue', {
        current_app_id: app_id,
        current_device_id: device_id,
        current_version_id: version_build,
        current_app_id_url: appIdToUrl(app_id),
      }, appOwner.owner_org, app_id, '0 0 * * 1', 'red')

      if (sent) {
        await LogSnag.track({
          channel: 'updates',
          event: 'plugin issue',
          icon: '⚠️',
          user_id: appOwner.owner_org,
          notify: false,
        }).catch()
      }
    }

    version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name

    if (!app_id || !device_id || !version_build || !version_name || !platform)
      return c.json({ message: 'Cannot find device_id or appi_id', error: 'missing_info' }, 400)

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

    const versionInfo = await requestInfosPostgres(platform, app_id, device_id, defaultChannel, drizzleClient)

    console.log('versionInfo', versionInfo)

    // Add no channel found check
    if (!versionInfo) {
      console.log(id, 'No suitable channel or override found', app_id, new Date().toISOString())
      await sendStatsAndDevice(c, device, [{ action: 'noChannelOrOverride' }])
      return c.json({
        message: 'No suitable channel or override found',
        error: 'no_channel',
      }, 200)
    }

    // Check if there is a device-specific override
    const isDeviceOverride = versionInfo.device_id === device_id

    // Skip platform check if there is a device-specific override
    const platformNotSupported = !isDeviceOverride && ((platform === 'android' && !versionInfo.android) || (platform === 'ios' && !versionInfo.ios))

    if (platformNotSupported)
      return c.json({ message: `Platform ${platform} is not supported`, error: 'platform_not_supported' }, 200)

    // Plan validation
    const planValid = await isAllowedActionOrg(c, appOwner.orgs.id)
    device.version = versionInfo.version_id

    if (!planValid) {
      console.log(id, 'Cannot update, upgrade plan to continue to update', app_id)
      await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
      return c.json({ message: 'Cannot update, upgrade plan to continue to update', error: 'need_plan_upgrade' }, 200)
    }

    if (!versionInfo.bucket_id && !versionInfo.external_url && !versionInfo.r2_path) {
      console.log(id, 'Cannot get bundle', app_id, versionInfo.version_id)
      await sendStatsAndDevice(c, device, [{ action: 'missingBundle' }])
      return c.json({ message: 'Cannot get bundle', error: 'no_bundle' }, 200)
    }

    // Major version update check
    if (versionInfo.disable_auto_update === 'major' && semver.major(versionInfo.version_name) > semver.major(version_name)) {
      console.log(id, 'Cannot upgrade major version', device_id, new Date().toISOString())
      await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateToMajor' }])
      return c.json({
        major: true,
        message: 'Cannot upgrade major version',
        error: 'disable_auto_update_to_major',
        version: versionInfo.version_name,
        old: version_name,
      }, 200)
    }

    // Minor version update check
    if (versionInfo.disable_auto_update === 'minor' && semver.minor(versionInfo.version_name) > semver.minor(version_name)) {
      console.log(id, 'Cannot upgrade minor version', device_id, new Date().toISOString())
      await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateToMinor' }])
      return c.json({
        major: true,
        message: 'Cannot upgrade minor version',
        error: 'disable_auto_update_to_minor',
        version: versionInfo.version_name,
        old: version_name,
      }, 200)
    }

    // Under native version check
    if (versionInfo.disable_auto_update_under_native && semver.lt(versionInfo.version_name, version_build)) {
      console.log(id, 'Cannot revert under native version', device_id, new Date().toISOString())
      await sendStatsAndDevice(c, device, [{ action: 'disableAutoUpdateUnderNative' }])
      return c.json({
        message: 'Cannot revert under native version',
        error: 'disable_auto_update_under_native',
        version: versionInfo.version_name,
        old: version_name,
      }, 200)
    }

    if (version_name === versionInfo.version_name) {
      console.log(id, 'No new version available', device_id, version_name, versionInfo.version_name, new Date().toISOString())
      await sendStatsAndDevice(c, device, [{ action: 'noNew' }])
      return c.json({ message: 'No new version available' }, 200)
    }

    if (!versionInfo.allow_dev && !is_prod) {
      console.log(id, 'Cannot update dev build is disabled', device_id, new Date().toISOString())
      await sendStatsAndDevice(c, device, [{ action: 'disableDevBuild' }])
      return c.json({ message: 'Cannot update, dev build is disabled', error: 'disable_dev_build', version: versionInfo.version_name, old: version_name }, 200)
    }

    if (!versionInfo.allow_emulator && is_emulator) {
      console.log(id, 'Cannot update emulator is disabled', device_id, new Date().toISOString())
      await sendStatsAndDevice(c, device, [{ action: 'disableEmulator' }])
      return c.json({ message: 'Cannot update, emulator is disabled', error: 'disable_emulator', version: versionInfo.version_name, old: version_name }, 200)
    }

    let signedURL = versionInfo.external_url || ''
    let fileSize = 0
    if ((versionInfo.bucket_id || versionInfo.r2_path) && !versionInfo.external_url) {
      const res = await getBundleUrl(c, appOwner.orgs.created_by, {
        id: versionInfo.version_id,
        storage_provider: versionInfo.storage_provider,
        r2_path: versionInfo.r2_path,
        bucket_id: versionInfo.bucket_id,
        app_id: versionInfo.app_id,
      })

      if (res) {
        fileSize = res.size
        signedURL = res.url
      }
    }

    if (!signedURL && (!signedURL.startsWith('http://') && !signedURL.startsWith('https://'))) {
      console.log(id, 'Cannot get bundle signedURL', signedURL, app_id, new Date().toISOString())
      await sendStatsAndDevice(c, device, [{ action: 'cannotGetBundle' }])
      return c.json({ message: 'Cannot get bundle', error: 'no_bundle' }, 200)
    }

    await createStatsMau(c, device_id, app_id)
    await createStatsBandwidth(c, device_id, app_id, fileSize)
    await createStatsVersion(c, versionInfo.version_id, app_id, 'get')
    await sendStatsAndDevice(c, device, [{ action: 'get' }])

    console.log(id, 'New version available', app_id, versionInfo.version_name, signedURL, new Date().toISOString())

    const response: {
      version: string
      url: string
      session_key?: string
      checksum?: string | null
    } = {
      version: versionInfo.version_name,
      url: signedURL,
    }

    if (semver.gte(plugin_version, '4.13.0'))
      response.session_key = versionInfo.session_key || ''

    if (semver.gte(plugin_version, '4.4.0'))
      response.checksum = versionInfo.checksum || null

    return c.json(response, 200)
  }
  catch (e) {
    console.error('e', e)
    return c.json({ message: `Unknown error ${JSON.stringify(e)}`, error: 'unknown_error' }, 500)
  }
}

function getDrizzlePostgres(c: Context) {
  // TODO: find why is not always working when we add the IF
  // if (getRuntimeKey() === 'workerd') {
  //   return postgres(c.env.HYPERDRIVE.connectionString, { prepare: false, idle_timeout: 2 })
  // }
  // else
  if (existInEnv(c, 'CUSTOM_SUPABASE_DB_URL')) {
    console.log('CUSTOM_SUPABASE_DB_URL', getEnv(c, 'CUSTOM_SUPABASE_DB_URL'))
    return postgres(getEnv(c, 'CUSTOM_SUPABASE_DB_URL'), { idle_timeout: 1 })
  }
  console.log('SUPABASE_DB_URL', getEnv(c, 'SUPABASE_DB_URL'))
  return postgres(getEnv(c, 'SUPABASE_DB_URL'), { idle_timeout: 1 })
}

export async function updateV2(c: Context, body: AppInfos) {
  const pgClient = getDrizzlePostgres(c)
  let res
  try {
    res = await updateWithPG(c, body, drizzle_postgress(pgClient as any))
  }
  catch (e) {
    console.error('update', e)
    return c.json({
      message: `Error unknow ${JSON.stringify(e)}`,
      error: 'unknow_error',
    }, 500)
  }
  // await pgClient.end()
  backgroundTask(c, () => pgClient.end({ timeout: 1 }))
  return res
}
