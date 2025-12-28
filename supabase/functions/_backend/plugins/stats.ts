import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import type { AppStats, StatsActions } from '../utils/types.ts'
import { greaterOrEqual, parse } from '@std/semver'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { getAppStatus, setAppStatus } from '../utils/appStatus.ts'
import { BRES, parseBody, simpleError200, simpleRateLimit } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { sendNotifOrg } from '../utils/notifications.ts'
import { closeClient, getAppOwnerPostgres, getAppVersionPostgres, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { makeDevice, parsePluginBody } from '../utils/plugin_parser.ts'
import { createStatsVersion, onPremStats, sendStatsAndDevice } from '../utils/stats.ts'
import { deviceIdRegex, INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, isLimited, MISSING_STRING_APP_ID, MISSING_STRING_DEVICE_ID, MISSING_STRING_PLATFORM, MISSING_STRING_VERSION_NAME, MISSING_STRING_VERSION_OS, NON_STRING_APP_ID, NON_STRING_DEVICE_ID, NON_STRING_PLATFORM, NON_STRING_VERSION_NAME, NON_STRING_VERSION_OS, reverseDomainRegex } from '../utils/utils.ts'
import { ALLOWED_STATS_ACTIONS } from './stats_actions.ts'

z.config(z.locales.en())

const PLAN_ERROR = 'Cannot send stats, upgrade plan to continue to update'

export const jsonRequestSchema = z.object({
  app_id: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_APP_ID : NON_STRING_APP_ID,
  }).check(z.regex(reverseDomainRegex, { message: INVALID_STRING_APP_ID })),
  device_id: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_DEVICE_ID : NON_STRING_DEVICE_ID,
  }).check(z.maxLength(36), z.regex(deviceIdRegex, { message: INVALID_STRING_DEVICE_ID })),
  platform: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_PLATFORM : NON_STRING_PLATFORM,
  }),
  version_name: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_VERSION_NAME : NON_STRING_VERSION_NAME,
  }),
  old_version_name: z.optional(z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_VERSION_NAME : NON_STRING_VERSION_NAME,
  })),
  version_os: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_VERSION_OS : NON_STRING_VERSION_OS,
  }),
  version_code: z.optional(z.string()),
  version_build: z.optional(z.string()),
  action: z.optional(z.enum(ALLOWED_STATS_ACTIONS)),
  custom_id: z.optional(z.string()),
  channel: z.optional(z.string()),
  defaultChannel: z.optional(z.string()),
  plugin_version: z.optional(z.string()),
  is_emulator: z.boolean(),
  is_prod: z.boolean(),
  key_id: z.optional(z.string().check(z.maxLength(20))),
})

async function post(c: Context, drizzleClient: ReturnType<typeof getDrizzleClient>, body: AppStats) {
  const device = makeDevice(body)
  const { app_id, action, version_name, old_version_name, plugin_version } = body

  const planActions: Array<'mau' | 'bandwidth'> = ['mau', 'bandwidth']
  const cachedStatus = await getAppStatus(c, app_id)
  if (cachedStatus === 'onprem') {
    return onPremStats(c, app_id, action, device)
  }
  if (cachedStatus === 'cancelled') {
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    return simpleError200(c, 'need_plan_upgrade', PLAN_ERROR)
  }
  const appOwner = await getAppOwnerPostgres(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>, planActions)
  if (!appOwner) {
    await setAppStatus(c, app_id, 'onprem')
    return onPremStats(c, app_id, action, device)
  }
  if (!appOwner.plan_valid) {
    await setAppStatus(c, app_id, 'cancelled')
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot update, upgrade plan to continue to update', id: app_id })
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    return simpleError200(c, 'need_plan_upgrade', 'Cannot update, upgrade plan to continue to update')
  }
  await setAppStatus(c, app_id, 'cloud')
  const statsActions: StatsActions[] = []

  // Extract version from composite format if present (e.g., "1.2.3:main.js" -> "1.2.3")
  // Composite format is used for file-specific failure stats
  const colonIndex = version_name.indexOf(':')
  const versionOnly = colonIndex > 0 ? version_name.substring(0, colonIndex) : version_name

  let allowedDeleted = false
  if (versionOnly === 'builtin' || versionOnly === 'unknown') {
    allowedDeleted = true
  }
  let appVersion = await getAppVersionPostgres(c, app_id, versionOnly, allowedDeleted, drizzleClient as ReturnType<typeof getDrizzleClient>)
  if (!appVersion) {
    const appVersion2 = await getAppVersionPostgres(c, app_id, 'unknown', allowedDeleted, drizzleClient as ReturnType<typeof getDrizzleClient>)
    if (appVersion2) {
      appVersion = appVersion2
      cloudlog({ requestId: c.get('requestId'), message: `Version name ${version_name} not found, using unknown instead`, app_id, version_name })
    }
    else {
      return simpleError200(c, 'version_not_found', 'Version not found', { app_id, version_name })
    }
  }
  // device.version = appVersion.id
  if (action === 'set' && !device.is_emulator && device.is_prod) {
    await createStatsVersion(c, appVersion.id, app_id, 'install')
    if (old_version_name) {
      const oldVersion = await getAppVersionPostgres(c, app_id, old_version_name, undefined, drizzleClient as ReturnType<typeof getDrizzleClient>)
      if (oldVersion && oldVersion.id !== appVersion.id) {
        await createStatsVersion(c, oldVersion.id, app_id, 'uninstall')
        statsActions.push({ action: 'uninstall', versionName: old_version_name ?? 'unknown' })
      }
    }
  }
  else if (action.endsWith('_fail')) {
    // Only exclude download_fail for plugin versions below 7.17.0 and 6.14.25 as the plugin where wrongly reporting it on these versions
    const shouldCountDownloadFail = action !== 'download_fail'
      || greaterOrEqual(parse(plugin_version), parse('7.17.0'))
      || (plugin_version.startsWith('6.') && greaterOrEqual(parse(plugin_version), parse('6.14.25')))

    if (shouldCountDownloadFail) {
      await createStatsVersion(c, appVersion.id, app_id, 'fail')
      cloudlog({ requestId: c.get('requestId'), message: 'FAIL!' })
      await sendNotifOrg(c, 'user:update_fail', {
        app_id,
        device_id: body.device_id,
        version_id: appVersion.id,
        app_id_url: app_id,
      }, appVersion.owner_org, app_id, '0 0 * * 1')
    }
  }
  statsActions.push({ action: action as Database['public']['Enums']['stats_action'] })

  // Don't update device record on failure actions - the version_name in the request
  // is the failed version, not the actual running version on the device
  await sendStatsAndDevice(c, device, statsActions, action.endsWith('_fail'))
  return c.json(BRES)
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', async (c) => {
  const body = await parseBody<AppStats>(c)
  if (isLimited(c, body.app_id)) {
    return simpleRateLimit(body)
  }
  const pgClient = getPgClient(c, true)

  const bodyParsed = parsePluginBody<AppStats>(c, body, jsonRequestSchema)
  const res = await post(c, getDrizzleClient(pgClient!), bodyParsed)
  if (pgClient)
    await closeClient(c, pgClient)
  return res
})

app.get('/', (c) => {
  return c.json(BRES)
})
