import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import type { DeviceRes, DeviceWithoutCreatedAt, ReadDevicesParams, ReadDevicesResponse, ReadStatsParams, StatsActions, VersionUsage } from './types.ts'
import { getRuntimeKey } from 'hono/adapter'
import { countDevicesCF, countUpdatesFromLogsCF, countUpdatesFromLogsExternalCF, createIfNotExistStoreInfo, getAppsFromCF, getUpdateStatsCF, readBandwidthUsageCF, readDevicesCF, readDeviceUsageCF, readDeviceVersionCountsCF, readStatsCF, readStatsVersionCF, trackBandwidthUsageCF, trackDevicesCF, trackDeviceUsageCF, trackLogsCF, trackLogsCFExternal, trackVersionUsageCF, updateStoreApp } from './cloudflare.ts'
import { isAppDemo } from './demo.ts'
import { simpleError200 } from './hono.ts'
import { cloudlog } from './logging.ts'
import { countDevicesSB, getAppsFromSB, getUpdateStatsSB, readBandwidthUsageSB, readDevicesSB, readDeviceUsageSB, readDeviceVersionCountsSB, readStatsSB, readStatsStorageSB, readStatsVersionSB, supabaseWithAuth, trackBandwidthUsageSB, trackDevicesSB, trackDeviceUsageSB, trackLogsSB, trackMetaSB, trackVersionUsageSB } from './supabase.ts'
import { DEFAULT_LIMIT } from './types.ts'
import { backgroundTask, isInternalVersionName } from './utils.ts'

export function createStatsMau(c: Context, device_id: string, app_id: string, org_id: string, platform: string) {
  const lowerDeviceId = device_id
  if (!c.env.DEVICE_USAGE)
    return trackDeviceUsageSB(c, lowerDeviceId, app_id, org_id)
  return trackDeviceUsageCF(c, lowerDeviceId, app_id, org_id, platform)
}

export async function onPremStats(c: Context, app_id: string, action: string, device: DeviceWithoutCreatedAt) {
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
  await createStatsLogsExternal(c, device.app_id, device.device_id, 'get', device.version_name)
  cloudlog({ requestId: c.get('requestId'), message: 'App is external (onPremise), returning 429', app_id: device.app_id, country: c.req.raw.cf?.country, user_agent: c.req.raw.headers.get('user-agent') })
  // Return 429 to prevent device from retrying until next app kill (DDOS prevention)
  return c.json({ error: 'on_premise_app', message: 'On-premise app detected' }, 429)
}

export function createStatsBandwidth(c: Context, device_id: string, app_id: string, file_size: number) {
  const lowerDeviceId = device_id
  cloudlog({ requestId: c.get('requestId'), message: 'createStatsBandwidth', device_id: lowerDeviceId, app_id, file_size })
  if (file_size === 0)
    return
  if (!c.env.BANDWIDTH_USAGE)
    return backgroundTask(c, trackBandwidthUsageSB(c, lowerDeviceId, app_id, file_size))
  return trackBandwidthUsageCF(c, lowerDeviceId, app_id, file_size)
}

export type VersionAction = 'get' | 'fail' | 'install' | 'uninstall'
export function createStatsVersion(c: Context, version_name: string, app_id: string, action: VersionAction) {
  if (isInternalVersionName(version_name))
    return Promise.resolve()
  if (!c.env.VERSION_USAGE)
    return backgroundTask(c, trackVersionUsageSB(c, version_name, app_id, action))
  return trackVersionUsageCF(c, version_name, app_id, action)
}

export function createStatsLogsExternal(c: Context, app_id: string, device_id: string, action: Database['public']['Enums']['stats_action'], versionName?: string) {
  const lowerDeviceId = device_id
  const finalVersionName = versionName && versionName !== '' ? versionName : 'unknown'
  // This is super important until every device get the version of plugin 6.2.5
  if (!c.env.APP_LOG_EXTERNAL)
    return backgroundTask(c, trackLogsSB(c, app_id, lowerDeviceId, action, finalVersionName))
  return trackLogsCFExternal(c, app_id, lowerDeviceId, action, finalVersionName)
}

export function createStatsLogs(c: Context, app_id: string, device_id: string, action: Database['public']['Enums']['stats_action'], versionName?: string) {
  const lowerDeviceId = device_id
  const finalVersionName = versionName && versionName !== '' ? versionName : 'unknown'
  // This is super important until every device get the version of plugin 6.2.5
  if (!c.env.APP_LOG)
    return backgroundTask(c, trackLogsSB(c, app_id, lowerDeviceId, action, finalVersionName))
  return trackLogsCF(c, app_id, lowerDeviceId, action, finalVersionName)
}

export function createStatsDevices(c: Context, device: DeviceWithoutCreatedAt) {
  // In Cloudflare Workers (workerd), prefer Analytics Engine when available.
  // For local Cloudflare testing, these bindings are typically absent, so we
  // must fall back to the Postgres/Supabase path or device state won't be
  // recorded and downstream APIs/tests will break.
  if (getRuntimeKey() === 'workerd' && c.env.DEVICE_INFO)
    return backgroundTask(c, trackDevicesCF(c, device))

  return backgroundTask(c, trackDevicesSB(c, device))
}

export function sendStatsAndDevice(c: Context, device: DeviceWithoutCreatedAt, statsActions: StatsActions[], isFailedStat = false) {
  const jobs = []
  statsActions.forEach(({ action, versionName }) => {
    jobs.push(createStatsLogs(c, device.app_id, device.device_id, action, versionName ?? device.version_name))
  })

  if (!isFailedStat)
    jobs.push(createStatsDevices(c, device))

  return Promise.all(jobs)
}

export function createStatsMeta(c: Context, app_id: string, version_id: number, size: number) {
  if (size === 0)
    return { error: 'size is 0' }
  cloudlog({ requestId: c.get('requestId'), message: 'createStatsMeta', app_id, version_id, size })
  return trackMetaSB(c, app_id, version_id, size)
}

export function readStatsMau(c: Context, app_id: string, start_date: string, end_date: string) {
  if (!c.env.DEVICE_USAGE)
    return readDeviceUsageSB(c, app_id, start_date, end_date)
  return readDeviceUsageCF(c, app_id, start_date, end_date).then(res => res.map(({ org_id, ...rest }) => rest))
}

export function readStatsBandwidth(c: Context, app_id: string, start_date: string, end_date: string) {
  if (!c.env.BANDWIDTH_USAGE)
    return readBandwidthUsageSB(c, app_id, start_date, end_date)
  return readBandwidthUsageCF(c, app_id, start_date, end_date)
}

export function readStatsStorage(c: Context, app_id: string, start_date: string, end_date: string) {
  // No cloudflare implementation, postgrest is enough
  return readStatsStorageSB(c, app_id, start_date, end_date)
}

export function readStatsVersion(c: Context, app_id: string, start_date: string, end_date: string): Promise<VersionUsage[]> {
  if (!c.env.VERSION_USAGE)
    return readStatsVersionSB(c, app_id, start_date, end_date)
  return readStatsVersionCF(c, app_id, start_date, end_date)
}

export function readDeviceVersionCounts(c: Context, app_id: string, channelName?: string): Promise<Record<string, number>> {
  if (!c.env.DEVICE_INFO)
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
    const versionName = (device.version as any)?.name || demoVersions[Math.floor(Math.random() * demoVersions.length)]

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

export async function readStats(c: Context, params: ReadStatsParams) {
  // For demo apps, generate fake logs instead of querying real data
  if (isAppDemo(params.app_id)) {
    return generateDemoLogs(c, params)
  }

  if (!c.env.APP_LOG)
    return readStatsSB(c, params)
  return readStatsCF(c, params)
}

export function countDevices(c: Context, app_id: string, customIdMode: boolean) {
  // Use Analytics Engine DEVICE_INFO when available in Cloudflare Workers.
  // In local Cloudflare testing these bindings are often absent, so fall back
  // to the Postgres/Supabase path.
  if (getRuntimeKey() === 'workerd' && c.env.DEVICE_INFO)
    return countDevicesCF(c, app_id, customIdMode)
  return countDevicesSB(c, app_id, customIdMode)
}

export async function readDevices(c: Context, params: ReadDevicesParams, customIdMode: boolean): Promise<ReadDevicesResponse> {
  let results: DeviceRes[]
  // Use Analytics Engine DEVICE_INFO when available in Cloudflare Workers.
  // In local Cloudflare testing these bindings are often absent, so fall back
  // to the Postgres/Supabase path.
  if (getRuntimeKey() === 'workerd' && c.env.DEVICE_INFO)
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

export async function countAllApps(c: Context): Promise<number> {
  const [cloudflareApps, supabaseApps] = await Promise.all([
    getAppsFromCF(c),
    getAppsFromSB(c),
  ])

  const allApps = [...new Set([...cloudflareApps, ...supabaseApps])]
  return allApps.length
}

export async function countAllUpdates(c: Context): Promise<number> {
  const logsCount = await countUpdatesFromLogsCF(c)

  return logsCount
}

export async function countAllUpdatesExternal(c: Context): Promise<number> {
  const externalCount = await countUpdatesFromLogsExternalCF(c)
  return externalCount
}

export function getUpdateStats(c: Context) {
  if (c.env.VERSION_USAGE)
    return getUpdateStatsCF(c)
  else
    return getUpdateStatsSB(c)
}
