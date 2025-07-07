import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import type { Order } from './types.ts'
import { backgroundTask } from '../utils/utils.ts'
import { countDevicesCF, countUpdatesFromLogsCF, countUpdatesFromLogsExternalCF, createIfNotExistStoreInfo, getAppsFromCF, getUpdateStatsCF, readBandwidthUsageCF, readDevicesCF, readDeviceUsageCF, readStatsCF, readStatsVersionCF, trackBandwidthUsageCF, trackDevicesCF, trackDeviceUsageCF, trackLogsCF, trackLogsCFExternal, trackVersionUsageCF, updateStoreApp } from './cloudflare.ts'
import { simpleError200 } from './hono.ts'
import { cloudlog } from './loggin.ts'
import { countDevicesSB, getAppsFromSB, getUpdateStatsSB, readBandwidthUsageSB, readDevicesSB, readDeviceUsageSB, readStatsSB, readStatsStorageSB, readStatsVersionSB, trackBandwidthUsageSB, trackDevicesSB, trackDeviceUsageSB, trackLogsSB, trackMetaSB, trackVersionUsageSB } from './supabase.ts'

export type DeviceWithoutCreatedAt = Omit<Database['public']['Tables']['devices']['Insert'], 'created_at'>
export interface StatsActions {
  action: Database['public']['Enums']['stats_action']
  versionId?: number
}

export function createStatsMau(c: Context, device_id: string, app_id: string) {
  const lowerDeviceId = device_id.toLowerCase()
  if (!c.env.DEVICE_USAGE)
    return trackDeviceUsageSB(c, lowerDeviceId, app_id)
  return trackDeviceUsageCF(c, lowerDeviceId, app_id)
}

export async function opnPremStats(c: Context, app_id: string, action: string, device: DeviceWithoutCreatedAt) {
  if (app_id) {
    await createIfNotExistStoreInfo(c, {
      app_id,
      onprem: true,
      capacitor: true,
      capgo: true,
    })
  }
  if (action === 'get')
    await updateStoreApp(c, app_id, 1)
  // save stats of unknow sources in our analytic DB
  await backgroundTask(c, createStatsLogsExternal(c, device.app_id, device.device_id, 'get', device.version))
  cloudlog({ requestId: c.get('requestId'), message: 'App is external', app_id: device.app_id, country: (c.req.raw as any)?.cf?.country })
  return simpleError200(c, 'app_not_found', 'App not found')
}

export function createStatsBandwidth(c: Context, device_id: string, app_id: string, file_size: number) {
  const lowerDeviceId = device_id.toLowerCase()
  if (file_size === 0)
    return
  if (!c.env.BANDWIDTH_USAGE)
    return trackBandwidthUsageSB(c, lowerDeviceId, app_id, file_size)
  return trackBandwidthUsageCF(c, lowerDeviceId, app_id, file_size)
}

export type VersionAction = 'get' | 'fail' | 'install' | 'uninstall'
export function createStatsVersion(c: Context, version_id: number, app_id: string, action: VersionAction) {
  if (!c.env.VERSION_USAGE)
    return trackVersionUsageSB(c, version_id, app_id, action)
  return trackVersionUsageCF(c, version_id, app_id, action)
}

export function createStatsLogsExternal(c: Context, app_id: string, device_id: string, action: Database['public']['Enums']['stats_action'], version_id: number) {
  const lowerDeviceId = device_id.toLowerCase()
  // This is super important until every device get the version of plugin 6.2.5
  if (!c.env.APP_LOG_EXTERNAL)
    return trackLogsSB(c, app_id, lowerDeviceId, action, version_id)
  return trackLogsCFExternal(c, app_id, lowerDeviceId, action, version_id)
}

export function createStatsLogs(c: Context, app_id: string, device_id: string, action: Database['public']['Enums']['stats_action'], version_id: number) {
  const lowerDeviceId = device_id.toLowerCase()
  // This is super important until every device get the version of plugin 6.2.5
  if (!c.env.APP_LOG)
    return trackLogsSB(c, app_id, lowerDeviceId, action, version_id)
  return trackLogsCF(c, app_id, lowerDeviceId, action, version_id)
}

export function createStatsDevices(c: Context, app_id: string, device_id: string, version: number, platform: Database['public']['Enums']['platform_os'], plugin_version: string, os_version: string, version_build: string, custom_id: string, is_prod: boolean, is_emulator: boolean) {
  const lowerDeviceId = device_id.toLowerCase()
  if (!c.env.DB_DEVICES)
    return trackDevicesSB(c, app_id, lowerDeviceId, version, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator)
  return trackDevicesCF(c, app_id, lowerDeviceId, version, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator)
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
  return readDeviceUsageCF(c, app_id, start_date, end_date)
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

export function readStats(c: Context, app_id: string, start_date?: string, end_date?: string, deviceIds?: string[], search?: string, order?: Order[], limit?: number) {
  if (!c.env.APP_LOG)
    return readStatsSB(c, app_id, start_date, end_date, deviceIds, search, order, limit)
  return readStatsCF(c, app_id, start_date, end_date, deviceIds, search, order, limit)
}

export function countDevices(c: Context, app_id: string) {
  if (!c.env.DB_DEVICES)
    return countDevicesSB(c, app_id)
  return countDevicesCF(c, app_id)
}

export function readDevices(c: Context, app_id: string, range_start: number, range_end: number, version_id?: string, deviceIds?: string[], search?: string, order?: Order[]) {
  if (!c.env.DB_DEVICES)
    return readDevicesSB(c, app_id, range_start, range_end, version_id, deviceIds, search, order)
  return readDevicesCF(c, app_id, range_start, range_end, version_id, deviceIds, search, order)
}

export function sendStatsAndDevice(c: Context, device: DeviceWithoutCreatedAt, statsActions: StatsActions[]) {
  // Prepare the device data for insertion

  device.device_id = device.device_id.toLowerCase()
  const jobs = []
  // Prepare the stats data for insertion
  statsActions.forEach(({ action, versionId }) => {
    jobs.push(createStatsLogs(c, device.app_id, device.device_id, action, versionId ?? device.version))
  })

  // if any statsActions is get, then we need the device data
  // if (statsActions.some(({ action }) => ['set', 'reset', 'app_moved_to_foreground'].includes(action))) // TODO: check if we don't fuck our billing without this
  jobs.push(createStatsDevices(c, device.app_id, device.device_id, device.version, device.platform ?? 'android', device.plugin_version ?? '', device.os_version ?? '', device.version_build ?? '', device.custom_id ?? '', device.is_prod ?? true, device.is_emulator ?? false))

  return backgroundTask(c, Promise.all(jobs)
    .catch((error) => {
      cloudlog({ requestId: c.get('requestId'), message: '[sendStatsAndDevice] rejected with error', error })
    }))
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

export async function getUpdateStats(c: Context) {
  if (c.env.VERSION_USAGE)
    return getUpdateStatsCF(c)
  else
    return getUpdateStatsSB(c)
}
