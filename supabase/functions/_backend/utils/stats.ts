import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import type { DeviceWithoutCreatedAt, ReadDevicesParams, ReadDevicesResponse, ReadStatsParams, StatsActions } from './types.ts'
import { countDevicesCF, countUpdatesFromLogsCF, countUpdatesFromLogsExternalCF, createIfNotExistStoreInfo, getAppsFromCF, getUpdateStatsCF, readBandwidthUsageCF, readDevicesCF, readDeviceUsageCF, readStatsCF, readStatsVersionCF, trackBandwidthUsageCF, trackDevicesCF, trackDeviceUsageCF, trackLogsCF, trackLogsCFExternal, trackVersionUsageCF, updateStoreApp } from './cloudflare.ts'
import { simpleError200 } from './hono.ts'
import { cloudlog } from './logging.ts'
import { countDevicesSB, getAppsFromSB, getUpdateStatsSB, readBandwidthUsageSB, readDevicesSB, readDeviceUsageSB, readStatsSB, readStatsStorageSB, readStatsVersionSB, trackBandwidthUsageSB, trackDevicesSB, trackDeviceUsageSB, trackLogsSB, trackMetaSB, trackVersionUsageSB } from './supabase.ts'
import { DEFAULT_LIMIT } from './types.ts'
import { backgroundTask } from './utils.ts'

export function createStatsMau(c: Context, device_id: string, app_id: string, org_id: string) {
  const lowerDeviceId = device_id
  if (!c.env.DEVICE_USAGE)
    return trackDeviceUsageSB(c, lowerDeviceId, app_id, org_id)
  return trackDeviceUsageCF(c, lowerDeviceId, app_id, org_id)
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
export function createStatsVersion(c: Context, version_id: number, app_id: string, action: VersionAction) {
  if (!c.env.VERSION_USAGE)
    return backgroundTask(c, trackVersionUsageSB(c, version_id, app_id, action))
  return trackVersionUsageCF(c, version_id, app_id, action)
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
  if (!c.env.DB_DEVICES)
    return backgroundTask(c, trackDevicesSB(c, device))
  // trackDevicesCF should always be as Background task as it write in D1
  return backgroundTask(c, trackDevicesCF(c, device))
}

export function sendStatsAndDevice(c: Context, device: DeviceWithoutCreatedAt, statsActions: StatsActions[]) {
  const jobs = []
  statsActions.forEach(({ action, versionName }) => {
    jobs.push(createStatsLogs(c, device.app_id, device.device_id, action, versionName ?? device.version_name))
  })

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

export function readStatsVersion(c: Context, app_id: string, start_date: string, end_date: string) {
  if (!c.env.VERSION_USAGE)
    return readStatsVersionSB(c, app_id, start_date, end_date)
  return readStatsVersionCF(c, app_id, start_date, end_date)
}

export function readStats(c: Context, params: ReadStatsParams) {
  if (!c.env.APP_LOG)
    return readStatsSB(c, params)
  return readStatsCF(c, params)
}

export function countDevices(c: Context, app_id: string, customIdMode: boolean) {
  if (!c.env.DB_DEVICES)
    return countDevicesSB(c, app_id, customIdMode)
  return countDevicesCF(c, app_id, customIdMode)
}

export async function readDevices(c: Context, params: ReadDevicesParams, customIdMode: boolean): Promise<ReadDevicesResponse> {
  let results: Database['public']['Tables']['devices']['Row'][]
  if (!c.env.DB_DEVICES)
    results = await readDevicesSB(c, params, customIdMode)
  else
    results = await readDevicesCF(c, params, customIdMode)

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
