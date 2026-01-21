import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import type { AppStats, StatsActions } from '../utils/types.ts'
import { greaterOrEqual, parse } from '@std/semver'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { getAppStatus, setAppStatus } from '../utils/appStatus.ts'
import { BRES, simpleError, simpleError200, simpleErrorWithStatus, simpleRateLimit } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { sendNotifOrgCached } from '../utils/notifications.ts'
import { closeClient, getAppOwnerPostgres, getAppVersionPostgres, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { makeDevice, parsePluginBody } from '../utils/plugin_parser.ts'
import { createStatsVersion, onPremStats, sendStatsAndDevice } from '../utils/stats.ts'
import { backgroundTask, deviceIdRegex, INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, isLimited, MISSING_STRING_APP_ID, MISSING_STRING_DEVICE_ID, MISSING_STRING_PLATFORM, MISSING_STRING_VERSION_NAME, MISSING_STRING_VERSION_OS, NON_STRING_APP_ID, NON_STRING_DEVICE_ID, NON_STRING_PLATFORM, NON_STRING_VERSION_NAME, NON_STRING_VERSION_OS, reverseDomainRegex } from '../utils/utils.ts'
import { ALLOWED_STATS_ACTIONS } from './stats_actions.ts'

z.config(z.locales.en())

const PLAN_ERROR = 'Cannot send stats, upgrade plan to continue to update'

export interface BatchStatsResult {
  status: 'ok' | 'error'
  error?: string
  message?: string
  index?: number
  moreInfo?: Record<string, unknown>
}

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

interface PostResult {
  success: boolean
  error?: string
  message?: string
  isOnprem?: boolean
  moreInfo?: Record<string, unknown>
}

async function post(c: Context, drizzleClient: ReturnType<typeof getDrizzleClient>, body: AppStats): Promise<PostResult> {
  const device = makeDevice(body)
  const { app_id, action, version_name, old_version_name, plugin_version } = body

  const planActions: Array<'mau' | 'bandwidth'> = ['mau', 'bandwidth']
  const cachedStatus = await getAppStatus(c, app_id)
  if (cachedStatus === 'onprem') {
    await onPremStats(c, app_id, action, device)
    return { success: true, isOnprem: true }
  }
  if (cachedStatus === 'cancelled') {
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    return { success: false, error: 'need_plan_upgrade', message: PLAN_ERROR }
  }
  const appOwner = await getAppOwnerPostgres(c, app_id, drizzleClient as ReturnType<typeof getDrizzleClient>, planActions)
  if (!appOwner) {
    await setAppStatus(c, app_id, 'onprem')
    await onPremStats(c, app_id, action, device)
    return { success: true, isOnprem: true }
  }
  if (!appOwner.plan_valid) {
    await setAppStatus(c, app_id, 'cancelled')
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot update, upgrade plan to continue to update', id: app_id })
    await sendStatsAndDevice(c, device, [{ action: 'needPlanUpgrade' }])
    // Send weekly notification about missing payment (not configurable - payment related)
    backgroundTask(c, sendNotifOrgCached(c, 'org:missing_payment', {
      app_id,
      device_id: body.device_id,
      app_id_url: app_id,
    }, appOwner.owner_org, app_id, '0 0 * * 1')) // Weekly on Monday
    return { success: false, error: 'need_plan_upgrade', message: 'Cannot update, upgrade plan to continue to update' }
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
      return { success: false, error: 'version_not_found', message: 'Version not found', moreInfo: { app_id, version_name } }
    }
  }
  // device.version = appVersion.id
  if (action === 'set' && !device.is_emulator && device.is_prod) {
    // Use versionOnly (from request body) instead of appVersion - no DB read needed for stats
    await createStatsVersion(c, versionOnly, app_id, 'install')
    if (old_version_name) {
      const oldVersion = await getAppVersionPostgres(c, app_id, old_version_name, undefined, drizzleClient as ReturnType<typeof getDrizzleClient>)
      if (oldVersion && oldVersion.id !== appVersion.id) {
        await createStatsVersion(c, old_version_name, app_id, 'uninstall')
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
      // Use versionOnly (from request body) instead of appVersion - no DB read needed for stats
      await createStatsVersion(c, versionOnly, app_id, 'fail')
      cloudlog({ requestId: c.get('requestId'), message: 'FAIL!' })
      // Daily fail ratio emails are now sent via cron job that checks aggregate stats
      // instead of per-device notifications. See process_daily_fail_ratio_email.
    }
  }
  statsActions.push({ action: action as Database['public']['Enums']['stats_action'] })

  // Don't update device record on failure actions - the version_name in the request
  // is the failed version, not the actual running version on the device
  await sendStatsAndDevice(c, device, statsActions, action.endsWith('_fail'))
  return { success: true }
}

export const app = new Hono<MiddlewareKeyVariables>()

async function parseBodyRaw(c: Context): Promise<AppStats | AppStats[]> {
  try {
    const body = await c.req.json<AppStats | AppStats[]>()
    // Normalize device_id to lowercase for both single and array
    // Guard against non-object items to allow per-item validation errors
    if (Array.isArray(body)) {
      for (const item of body) {
        if (item && typeof item === 'object' && typeof (item as AppStats).device_id === 'string') {
          (item as AppStats).device_id = (item as AppStats).device_id.toLowerCase()
        }
      }
    }
    else if (body && typeof body === 'object' && typeof (body as AppStats).device_id === 'string') {
      (body as AppStats).device_id = (body as AppStats).device_id.toLowerCase()
    }
    return body
  }
  catch (e) {
    throw simpleError('invalid_json_parse_body', 'Invalid JSON body', { e })
  }
}

app.post('/', async (c) => {
  const body = await parseBodyRaw(c)
  const isBatch = Array.isArray(body)
  const events = isBatch ? body : [body]

  // Handle empty batch early - no need to acquire DB connection
  if (isBatch && events.length === 0) {
    return c.json({ status: 'ok', results: [] })
  }

  // Early validation of first event's app_id before using it in checks
  // Use optional chaining to safely handle null/primitive items
  const firstEvent = events[0]
  const firstAppId = (firstEvent as AppStats | null | undefined)?.app_id
  if (!firstAppId || typeof firstAppId !== 'string') {
    throw simpleError('invalid_app_id', MISSING_STRING_APP_ID)
  }
  if (!reverseDomainRegex.test(firstAppId)) {
    throw simpleError('invalid_app_id', INVALID_STRING_APP_ID)
  }

  // Validate all events in batch have valid app_ids and they all match
  if (isBatch) {
    for (let i = 1; i < events.length; i++) {
      const currentAppId = (events[i] as AppStats | null | undefined)?.app_id

      // Ensure each event has a valid string app_id in reverse-domain format
      if (!currentAppId || typeof currentAppId !== 'string') {
        return simpleError200(c, 'invalid_app_id', MISSING_STRING_APP_ID)
      }
      if (!reverseDomainRegex.test(currentAppId)) {
        return simpleError200(c, 'invalid_app_id', INVALID_STRING_APP_ID)
      }

      if (currentAppId !== firstAppId) {
        return simpleError200(c, 'mixed_app_ids', 'All events in a batch must have the same app_id')
      }
    }
  }

  // Rate limit check on app_id (all events share the same app)
  if (isLimited(c, firstAppId)) {
    return simpleRateLimit({ app_id: firstAppId })
  }

  const pgClient = getPgClient(c, true)
  const drizzleClient = getDrizzleClient(pgClient!)

  try {
    // For single event, process directly and let errors propagate for proper status codes
    if (!isBatch) {
      const bodyParsed = parsePluginBody<AppStats>(c, events[0], jsonRequestSchema)
      const result = await post(c, drizzleClient, bodyParsed)
      if (result.isOnprem) {
        return c.json({ error: 'on_premise_app', message: 'On-premise app detected' }, 429)
      }
      if (result.success) {
        return c.json(BRES)
      }
      if (result.error === 'need_plan_upgrade') {
        return simpleErrorWithStatus(c, 429, result.error, result.message!, result.moreInfo)
      }
      return simpleError200(c, result.error!, result.message!, result.moreInfo)
    }

    // For batch, collect results and handle errors per event
    const results: BatchStatsResult[] = []

    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      try {
        const bodyParsed = parsePluginBody<AppStats>(c, event, jsonRequestSchema)
        const result = await post(c, drizzleClient, bodyParsed)

        if (result.isOnprem) {
          results.push({
            status: 'error',
            error: 'on_premise_app',
            message: 'On-premise app detected',
            index: i,
          })
        }
        else if (result.success) {
          results.push({ status: 'ok', index: i })
        }
        else if (result.error === 'need_plan_upgrade') {
          return simpleErrorWithStatus(c, 429, result.error, result.message!, result.moreInfo)
        }
        else {
          results.push({
            status: 'error',
            error: result.error,
            message: result.message,
            index: i,
            moreInfo: result.moreInfo,
          })
        }
      }
      catch (e) {
        const err = e as Error & { cause?: { error?: string } }
        results.push({
          status: 'error',
          error: err?.cause?.error || 'processing_error',
          message: err?.message || 'Error processing event',
          index: i,
        })
      }
    }

    // For batch, return array of results
    return c.json({ status: 'ok', results })
  }
  finally {
    if (pgClient)
      await closeClient(c, pgClient)
  }
})

app.get('/', (c) => {
  return c.json(BRES)
})
