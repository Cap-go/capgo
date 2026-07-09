import type { SupabaseClient } from '@supabase/supabase-js'
import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from './hono.ts'
import type { Database } from './supabase.types.ts'
import type { DeviceRes, DeviceWithoutCreatedAt, NativeVersionUsage, ReadDevicesParams, ReadDevicesResponse, ReadStatsInsightsParams, ReadStatsParams, StatsActions, StatsInsightAction, StatsInsightDaily, StatsInsightDevice, StatsInsightsResult, StatsInsightVersion, StatsMetadata, VersionUsage, VersionUsageChannel } from './types.ts'
import { getRuntimeKey } from 'hono/adapter'
import { countDevicesCF, countInstallSourcesCF, countUpdatesFromLogsCF, countUpdatesFromLogsExternalCF, createIfNotExistStoreInfo, getAppsFromCF, getUpdateStatsCF, readBandwidthUsageCF, readDevicesCF, readDeviceUsageCF, readDeviceVersionCountsCF, readNativeVersionUsageCF, readStatsCF, readStatsInsightsCF, readStatsVersionCF, trackBandwidthUsageCF, trackDevicesCF, trackDeviceUsageCF, trackLogsCF, trackLogsCFExternal, trackVersionUsageCF, updateStoreApp } from './cloudflare.ts'
import { normalizeDeviceCountryCode } from './deviceComparison.ts'
import { isDemoApp } from './demo.ts'
import { simpleError, simpleError200 } from './hono.ts'
import { cloudlog } from './logging.ts'
import { countDevicesSB, countInstallSourcesSB, getAppsFromSB, getUpdateStatsSB, readBandwidthUsageSB, readDevicesSB, readDeviceUsageSB, readDeviceVersionCountsSB, readNativeVersionUsageSB, readStatsSB, readStatsInsightsSB, readStatsStorageSB, readStatsVersionSB, supabaseWithAuth, trackBandwidthUsageSB, trackDevicesSB, trackDeviceUsageSB, trackLogsSB, trackMetaSB, trackVersionUsageSB } from './supabase.ts'
import { logSkippedSupabaseWrite, shouldSkipSupabaseStatsFallback } from './supabase_write_guard.ts'
import { DEFAULT_LIMIT } from './types.ts'
import { backgroundTask, getEnv, isInternalVersionName } from './utils.ts'
import { normalizeStatsInsightDate, normalizeStatsInsightNumber, sortStatsInsightTotals } from './statsInsights.ts'

export function createStatsMau(c: Context, device_id: string, app_id: string, org_id: string, platform: string, version_build?: string | null): Promise<void> {
  const lowerDeviceId = device_id
  const jobs: Promise<unknown>[] = []
  if (!c.env.DEVICE_USAGE) {
    if (shouldSkipSupabaseStatsFallback(c)) {
      logSkippedSupabaseWrite(c, 'trackDeviceUsageSB')
      return Promise.resolve()
    }
    jobs.push(Promise.resolve(trackDeviceUsageSB(c, lowerDeviceId, app_id, org_id, platform, version_build)))
  }
  else {
    jobs.push(Promise.resolve(trackDeviceUsageCF(c, lowerDeviceId, app_id, org_id, platform, version_build)))
  }
  return Promise.all(jobs).then(() => undefined)
}

export async function onPremStats(c: Context, app_id: string, action: string, device: DeviceWithoutCreatedAt, metadata?: StatsMetadata) {
  if (!app_id) {
    cloudlog({ requestId: c.get('requestId'), message: 'App ID is missing in onPremStats', country: c.req.raw?.cf?.country })
    return simpleError200(c, 'app_not_found', 'App not found')
  }
  await backgroundTask(c, async () => {
    const res = await createIfNotExistStoreInfo(c, {
      app_id,
      updates: 1,
      onprem: true,
      capacitor: true,
      capgo: true,
    })
    if (!res && action === 'get')
      await updateStoreApp(c, app_id, 1)
  })

  // save stats of unknown sources in our analytic DB
  await createStatsLogsExternal(c, device.app_id, device.device_id, 'get', device.version_name, metadata)
  cloudlog({ requestId: c.get('requestId'), message: 'App is external (onPremise), returning 429', app_id: device.app_id, country: c.req.raw.cf?.country, user_agent: c.req.raw.headers.get('user-agent') })
  // Return 429 to prevent device from retrying until next app kill (DDOS prevention)
  return c.json({ error: 'on_premise_app', message: 'On-premise app detected' }, 429)
}

export function createStatsBandwidth(c: Context, device_id: string, app_id: string, file_size: number) {
  const lowerDeviceId = device_id
  cloudlog({ requestId: c.get('requestId'), message: 'createStatsBandwidth', device_id: lowerDeviceId, app_id, file_size })
  if (file_size === 0)
    return
  if (!c.env.BANDWIDTH_USAGE) {
    if (shouldSkipSupabaseStatsFallback(c)) {
      logSkippedSupabaseWrite(c, 'trackBandwidthUsageSB')
      return Promise.resolve()
    }
    return backgroundTask(c, trackBandwidthUsageSB(c, lowerDeviceId, app_id, file_size))
  }
  return trackBandwidthUsageCF(c, lowerDeviceId, app_id, file_size)
}

export type VersionAction = 'get' | 'fail' | 'install' | 'uninstall'
export function createStatsVersion(c: Context, version_name: string, app_id: string, action: VersionAction, channel?: VersionUsageChannel | string | null) {
  if (isInternalVersionName(version_name))
    return Promise.resolve()
  if (!c.env.VERSION_USAGE) {
    if (shouldSkipSupabaseStatsFallback(c)) {
      logSkippedSupabaseWrite(c, 'trackVersionUsageSB')
      return Promise.resolve()
    }
    return backgroundTask(c, trackVersionUsageSB(c, version_name, app_id, action, channel))
  }
  return trackVersionUsageCF(c, version_name, app_id, action, channel)
}

export function normalizeStatsMetadata(metadata?: StatsMetadata): StatsMetadata | undefined {
  if (!metadata)
    return undefined

  const normalized: StatsMetadata = {}
  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = key.slice(0, 64)
    if (!normalizedKey || typeof value !== 'string')
      continue
    normalized[normalizedKey] = value.slice(0, 2048)
    if (Object.keys(normalized).length >= 30)
      break
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function createStatsLogsExternal(c: Context, app_id: string, device_id: string, action: Database['public']['Enums']['stats_action'], versionName?: string, metadata?: StatsMetadata) {
  const lowerDeviceId = device_id
  const finalVersionName = versionName && versionName !== '' ? versionName : 'unknown'
  const finalMetadata = normalizeStatsMetadata(metadata)
  // This is super important until every device get the version of plugin 6.2.5
  if (!c.env.APP_LOG_EXTERNAL) {
    if (shouldSkipSupabaseStatsFallback(c)) {
      logSkippedSupabaseWrite(c, 'trackLogsSB(external)')
      return Promise.resolve()
    }
    return backgroundTask(c, trackLogsSB(c, app_id, lowerDeviceId, action, finalVersionName, finalMetadata))
  }
  return trackLogsCFExternal(c, app_id, lowerDeviceId, action, finalVersionName, finalMetadata)
}

export function createStatsLogs(c: Context, app_id: string, device_id: string, action: Database['public']['Enums']['stats_action'], versionName?: string, metadata?: StatsMetadata) {
  const lowerDeviceId = device_id
  const finalVersionName = versionName && versionName !== '' ? versionName : 'unknown'
  const finalMetadata = normalizeStatsMetadata(metadata)
  // This is super important until every device get the version of plugin 6.2.5
  if (!c.env.APP_LOG) {
    if (shouldSkipSupabaseStatsFallback(c)) {
      logSkippedSupabaseWrite(c, 'trackLogsSB')
      return Promise.resolve()
    }
    return backgroundTask(c, trackLogsSB(c, app_id, lowerDeviceId, action, finalVersionName, finalMetadata))
  }
  return trackLogsCF(c, app_id, lowerDeviceId, action, finalVersionName, finalMetadata)
}

export function createStatsDevices(c: Context, device: DeviceWithoutCreatedAt) {
  const requestCountry = c.req.raw?.cf?.country
  const countryCode = normalizeDeviceCountryCode(typeof requestCountry === 'string' ? requestCountry : undefined)
  const deviceWithCountry = countryCode ? { ...device, country_code: countryCode } : device

  // In Cloudflare Workers (workerd), prefer Analytics Engine when available.
  // For local Cloudflare testing, these bindings are typically absent, so we
  // must fall back to the Postgres/Supabase path or device state won't be
  // recorded and downstream APIs/tests will break.
  if (getRuntimeKey() === 'workerd' && c.env.DEVICE_INFO)
    return backgroundTask(c, trackDevicesCF(c, deviceWithCountry))

  if (shouldSkipSupabaseStatsFallback(c)) {
    logSkippedSupabaseWrite(c, 'trackDevicesSB')
    return Promise.resolve()
  }

  return backgroundTask(c, trackDevicesSB(c, deviceWithCountry))
}

export function sendStatsAndDevice(c: Context, device: DeviceWithoutCreatedAt, statsActions: StatsActions[], isFailedStat = false) {
  const jobs = []
  statsActions.forEach(({ action, versionName, metadata }) => {
    jobs.push(createStatsLogs(c, device.app_id, device.device_id, action, versionName ?? device.version_name, metadata))
  })

  if (!isFailedStat)
    jobs.push(createStatsDevices(c, device))

  return Promise.all(jobs)
}

export function createStatsMeta(c: Context, app_id: string, version_id: number, size: number) {
  if (size === 0)
    return { error: 'size is 0' }
  cloudlog({ requestId: c.get('requestId'), message: 'createStatsMeta', app_id, version_id, size })
  if (shouldSkipSupabaseStatsFallback(c)) {
    logSkippedSupabaseWrite(c, 'trackMetaSB')
    return { error: 'supabase_write_forbidden' }
  }
  return trackMetaSB(c, app_id, version_id, size)
}

export function readStatsMau(c: Context, app_id: string, start_date: string, end_date: string) {
  if (!c.env.DEVICE_USAGE)
    return readDeviceUsageSB(c, app_id, start_date, end_date)
  return readDeviceUsageCF(c, app_id, start_date, end_date).then(res => res.map(({ org_id: _org_id, ...rest }) => rest))
}

export function readStatsBandwidth(c: Context, app_id: string, start_date: string, end_date: string) {
  if (!c.env.BANDWIDTH_USAGE)
    return readBandwidthUsageSB(c, app_id, start_date, end_date)
  assertAnalyticsEngineReadConfig(c, 'bandwidth usage')
  return readBandwidthUsageCF(c, app_id, start_date, end_date, { throwOnError: true })
}

export function readStatsStorage(c: Context, app_id: string, start_date: string, end_date: string) {
  // No cloudflare implementation, postgrest is enough
  return readStatsStorageSB(c, app_id, start_date, end_date)
}

export function readStatsVersion(c: Context, app_id: string, start_date: string, end_date: string, channel?: VersionUsageChannel | string): Promise<VersionUsage[]> {
  if (!c.env.VERSION_USAGE)
    return readStatsVersionSB(c, app_id, start_date, end_date, channel)
  return readStatsVersionCF(c, app_id, start_date, end_date, channel)
}

export function readNativeVersionUsage(c: Context, app_id: string, start_date: string, end_date: string, supabase: SupabaseClient<Database>): Promise<NativeVersionUsage[]> {
  if (!c.env.DEVICE_USAGE)
    return readNativeVersionUsageSB(c, app_id, start_date, end_date, supabase)
  return readNativeVersionUsageCF(c, app_id, start_date, end_date)
}
function hasAnalyticsEngineReadConfig(c: Context): boolean {
  const token = getEnv(c, 'CF_ANALYTICS_TOKEN')
  const accountId = getEnv(c, 'CF_ACCOUNT_ANALYTICS_ID')
  return Boolean(token && accountId)
}

function shouldUseAnalyticsEngine(c: Context): boolean {
  if (getRuntimeKey() !== 'workerd' || !c.env.DEVICE_INFO)
    return false
  // Analytics reads require API access; fall back to Supabase when tokens are missing.
  return hasAnalyticsEngineReadConfig(c)
}

function assertAnalyticsEngineReadConfig(c: Context, metricName: string): void {
  if (!hasAnalyticsEngineReadConfig(c)) {
    throw simpleError('analytics_engine_unavailable', `Cannot read ${metricName} without Analytics Engine read configuration`)
  }
}

export function readDeviceVersionCounts(c: Context, app_id: string, channelName?: string): Promise<Record<string, number>> {
  if (!shouldUseAnalyticsEngine(c))
    return readDeviceVersionCountsSB(c, app_id, channelName)
  return readDeviceVersionCountsCF(c, app_id, channelName)
}

/**
 * Demo log entry type matching both Cloudflare and Supabase response formats.
 */
interface DemoLogEntry {
  app_id: string
  device_id: string
  action: string
  version_name: string
  created_at: string
}

/**
 * Parse a date value that may be in milliseconds (number) or ISO string format.
 * @param value - Date value as string (ms timestamp or ISO format)
 * @returns Parsed timestamp in milliseconds, or undefined if invalid
 */
function parseDateMs(value?: string): number | undefined {
  if (!value)
    return undefined
  const asNumber = Number(value)
  if (Number.isFinite(asNumber))
    return asNumber
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

/**
 * Generate fake log entries for demo apps.
 * Creates realistic-looking logs within the requested time range.
 * @param c - Hono context
 * @param params - Stats query parameters
 * @returns Array of demo log entries
 */
async function generateDemoLogs(c: Context, params: ReadStatsParams): Promise<DemoLogEntry[]> {
  // Use authenticated client to respect RLS policies
  const auth = c.get('auth')
  if (!auth)
    return []
  const supabase = supabaseWithAuth(c, auth)

  // Get the demo devices for this app
  const { data: devices } = await supabase
    .from('devices')
    .select('device_id, version:app_versions(name)')
    .eq('app_id', params.app_id)
    .limit(10)

  if (!devices || devices.length === 0) {
    return []
  }

  // Demo version progression over time
  const demoVersions = ['1.0.0', '1.0.1', '1.1.0', '1.1.1', '1.2.0']

  // Demo action sequences that simulate realistic app behavior
  const actionSequences = [
    // Normal update flow
    ['get', 'download_10', 'download_50', 'download_complete', 'set'],
    // Quick update
    ['get', 'download_complete', 'set'],
    // App lifecycle events
    ['app_moved_to_background', 'app_moved_to_foreground', 'get'],
    // No update needed
    ['get', 'noNew'],
    // Channel check
    ['getChannel', 'get', 'download_complete', 'set'],
    // Ping
    ['ping'],
  ]

  // Parse time range - supports both millisecond timestamps and ISO strings
  const parsedEnd = parseDateMs(params.end_date) ?? Date.now()
  const parsedStart = parseDateMs(params.start_date) ?? parsedEnd - 60 * 60 * 1000 // Default 1 hour
  // Normalize range in case start/end are reversed
  const rangeStart = Math.min(parsedStart, parsedEnd)
  const rangeEnd = Math.max(parsedStart, parsedEnd)

  // Generate logs within the time range
  const logs: DemoLogEntry[] = []
  const timeSpan = Math.max(0, rangeEnd - rangeStart)
  const numSequences = Math.min(20, Math.max(5, Math.floor(timeSpan / (5 * 60 * 1000)))) // One sequence every ~5 minutes

  for (let i = 0; i < numSequences; i++) {
    const device = devices[i % devices.length]
    const sequence = actionSequences[i % actionSequences.length]
    // Use the device's current version or pick from demo versions
    const versionName = (device.version as any)?.name || demoVersions[i % demoVersions.length]

    // Calculate base time for this sequence
    const sequenceStartTime = rangeStart + (timeSpan * i / numSequences)

    // Add logs for each action in the sequence
    for (let j = 0; j < sequence.length; j++) {
      const action = sequence[j]

      // Apply action filter if provided
      if (params.actions && params.actions.length > 0 && !params.actions.includes(action)) {
        continue
      }

      // Apply device filter if provided
      if (params.deviceIds && params.deviceIds.length > 0 && !params.deviceIds.includes(device.device_id)) {
        continue
      }

      // Apply search filter if provided
      if (params.search) {
        const searchLower = params.search.toLowerCase()
        if (!device.device_id.toLowerCase().includes(searchLower) && !versionName.toLowerCase().includes(searchLower)) {
          continue
        }
      }

      const logTime = new Date(sequenceStartTime + (j * 1000)) // 1 second between actions in sequence

      logs.push({
        app_id: params.app_id,
        device_id: device.device_id,
        action,
        version_name: versionName,
        created_at: logTime.toISOString(),
      })
    }
  }

  // Sort by created_at descending (most recent first)
  logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Apply limit (use ?? to respect explicit 0)
  const limit = params.limit ?? 50
  return logs.slice(0, limit)
}

export async function readStats(c: Context<MiddlewareKeyVariables>, params: ReadStatsParams) {
  // For demo apps, generate fake logs instead of querying real data
  if (await isDemoApp(c, params.app_id)) {
    return generateDemoLogs(c, params)
  }

  if (!c.env.APP_LOG)
    return readStatsSB(c, params)
  return readStatsCF(c, params)
}

interface StatsInsightSourceRow {
  action: string
  device_id: string
  version_name: string
  created_at: string
}

export function buildStatsInsightsFromRows(rows: StatsInsightSourceRow[]): StatsInsightsResult {
  const actionMap = new Map<string, StatsInsightAction & { devices: Set<string>, versions: Set<string> }>()
  const dailyMap = new Map<string, StatsInsightDaily>()
  const versionMap = new Map<string, StatsInsightVersion>()
  const deviceMap = new Map<string, StatsInsightDevice>()
  const allDevices = new Set<string>()

  rows.forEach((row) => {
    const action = row.action || 'unknown'
    const deviceId = row.device_id || ''
    const versionName = row.version_name || 'unknown'
    const createdAt = normalizeStatsInsightDate(row.created_at)
    allDevices.add(deviceId)

    const actionEntry = actionMap.get(action) ?? {
      action,
      total: 0,
      device_count: 0,
      version_count: 0,
      first_seen: createdAt,
      last_seen: createdAt,
      latest_version_name: versionName,
      latest_device_id: deviceId,
      devices: new Set<string>(),
      versions: new Set<string>(),
    }
    actionEntry.total += 1
    actionEntry.devices.add(deviceId)
    actionEntry.versions.add(versionName)
    if (createdAt && (!actionEntry.first_seen || createdAt < actionEntry.first_seen))
      actionEntry.first_seen = createdAt
    if (createdAt && (!actionEntry.last_seen || createdAt > actionEntry.last_seen)) {
      actionEntry.last_seen = createdAt
      actionEntry.latest_version_name = versionName
      actionEntry.latest_device_id = deviceId
    }
    actionMap.set(action, actionEntry)

    if (createdAt) {
      const date = createdAt.slice(0, 10)
      const dailyKey = `${date}:${action}`
      const dailyEntry = dailyMap.get(dailyKey) ?? { date, action, total: 0 }
      dailyEntry.total += 1
      dailyMap.set(dailyKey, dailyEntry)
    }

    const versionKey = `${action}:${versionName}`
    const versionEntry = versionMap.get(versionKey) ?? { action, version_name: versionName, total: 0, device_count: 0, last_seen: createdAt }
    versionEntry.total += 1
    if (createdAt && (!versionEntry.last_seen || createdAt > versionEntry.last_seen))
      versionEntry.last_seen = createdAt
    versionMap.set(versionKey, versionEntry)

    const deviceKey = `${action}:${deviceId}`
    const deviceEntry = deviceMap.get(deviceKey) ?? { action, device_id: deviceId, total: 0, version_name: versionName, last_seen: createdAt }
    deviceEntry.total += 1
    if (createdAt && (!deviceEntry.last_seen || createdAt > deviceEntry.last_seen)) {
      deviceEntry.last_seen = createdAt
      deviceEntry.version_name = versionName
    }
    deviceMap.set(deviceKey, deviceEntry)
  })

  const versionDeviceSets = new Map<string, Set<string>>()
  rows.forEach((row) => {
    const key = `${row.action || 'unknown'}:${row.version_name || 'unknown'}`
    const devices = versionDeviceSets.get(key) ?? new Set<string>()
    devices.add(row.device_id || '')
    versionDeviceSets.set(key, devices)
  })

  const actions = sortStatsInsightTotals([...actionMap.values()].map(({ devices, versions, ...entry }) => ({
    ...entry,
    total: normalizeStatsInsightNumber(entry.total),
    device_count: devices.size,
    version_count: versions.size,
  })), 20)

  const versions = sortStatsInsightTotals([...versionMap.entries()].map(([key, entry]) => ({
    ...entry,
    total: normalizeStatsInsightNumber(entry.total),
    device_count: versionDeviceSets.get(key)?.size ?? 0,
  })), 30)

  const devices = sortStatsInsightTotals([...deviceMap.values()].map(entry => ({
    ...entry,
    total: normalizeStatsInsightNumber(entry.total),
  })), 30)

  return {
    summary: {
      total: rows.length,
      device_count: allDevices.size,
      action_count: actionMap.size,
    },
    actions,
    daily: [...dailyMap.values()].sort((left, right) => left.date.localeCompare(right.date) || right.total - left.total),
    versions,
    devices,
  }
}

export async function readStatsInsights(c: Context<MiddlewareKeyVariables>, params: ReadStatsInsightsParams) {
  if (await isDemoApp(c, params.app_id)) {
    const demoLogs = await generateDemoLogs(c, { ...params, limit: 10_000 })
    return buildStatsInsightsFromRows(demoLogs)
  }

  if (!c.env.APP_LOG)
    return readStatsInsightsSB(c, params)
  return readStatsInsightsCF(c, params)
}

export function countDevices(
  c: Context,
  app_id: string,
  customIdMode: boolean,
  deviceIds: string[] = [],
  versionName?: string,
  search?: string,
) {
  const trimmedSearch = search?.trim()
  if (shouldUseAnalyticsEngine(c))
    return countDevicesCF(c, app_id, customIdMode, deviceIds, versionName, trimmedSearch)
  return countDevicesSB(c, app_id, customIdMode, deviceIds, versionName, trimmedSearch)
}

export function countInstallSources(c: Context, app_id: string) {
  if (getRuntimeKey() === 'workerd' && c.env.DEVICE_INFO && !shouldUseAnalyticsEngine(c)) {
    throw simpleError('analytics_engine_unavailable', 'Cannot count install sources without Analytics Engine read configuration')
  }

  if (shouldUseAnalyticsEngine(c))
    return countInstallSourcesCF(c, app_id)
  return countInstallSourcesSB(c, app_id)
}

export async function readDevices(c: Context, params: ReadDevicesParams, customIdMode: boolean): Promise<ReadDevicesResponse> {
  let results: DeviceRes[]
  // Use Analytics Engine DEVICE_INFO when available in Cloudflare Workers.
  // In local Cloudflare testing these bindings are often absent, so fall back
  // to the Postgres/Supabase path.
  if (shouldUseAnalyticsEngine(c))
    results = await readDevicesCF(c, params, customIdMode)
  else
    results = await readDevicesSB(c, params, customIdMode)

  const limit = params.limit ?? DEFAULT_LIMIT
  const hasMore = results.length > limit
  const data = hasMore ? results.slice(0, limit) : results

  // Build next cursor from last item
  let nextCursor: string | undefined
  if (hasMore && data.length > 0) {
    const lastItem = data[data.length - 1]
    nextCursor = `${lastItem.updated_at}|${lastItem.device_id}`
  }

  return { data, nextCursor, hasMore }
}

export async function countAllApps(c: Context, referenceDate?: Date): Promise<number> {
  const [cloudflareApps, supabaseApps] = await Promise.all([
    getAppsFromCF(c, referenceDate),
    getAppsFromSB(c, referenceDate),
  ])

  const allApps = [...new Set([...cloudflareApps, ...supabaseApps])]
  return allApps.length
}

export async function countAllUpdates(c: Context, referenceDate?: Date): Promise<number> {
  const logsCount = await countUpdatesFromLogsCF(c, referenceDate)

  return logsCount
}

export async function countAllUpdatesExternal(c: Context, referenceDate?: Date): Promise<number> {
  const externalCount = await countUpdatesFromLogsExternalCF(c, referenceDate)
  return externalCount
}

export function getUpdateStats(c: Context) {
  if (c.env.VERSION_USAGE)
    return getUpdateStatsCF(c)
  else
    return getUpdateStatsSB(c)
}
