import type { Context } from 'hono'
import { readBandwidthUsageSB, readDeviceUsageSB, readDevicesSB, readStatsSB, readStatsStorageSB, readStatsVersionSB, trackBandwidthUsageSB, trackDeviceUsageSB, trackDevicesSB, trackLogsSB, trackMetaSB, trackVersionUsageSB } from './supabase.ts'
import { readBandwidthUsageCF, readDeviceUsageCF, readDevicesCF, readStatsCF, readStatsVersionCF, trackBandwidthUsageCF, trackDeviceUsageCF, trackDevicesCF, trackLogsCF, trackVersionUsageCF } from './cloudflare.ts'
import type { Database } from './supabase.types.ts'

export function createStatsMau(c: Context, device_id: string, app_id: string) {
  if (!c.env.DEVICE_USAGE)
    return trackDeviceUsageSB(c, device_id, app_id)
  return trackDeviceUsageCF(c, device_id, app_id)
}

export function createStatsBandwidth(c: Context, device_id: string, app_id: string, file_size: number) {
  if (file_size === 0)
    return
  if (!c.env.BANDWIDTH_USAGE)
    return trackBandwidthUsageSB(c, device_id, app_id, file_size)
  return trackBandwidthUsageCF(c, device_id, app_id, file_size)
}

export type VersionAction = 'get' | 'fail' | 'install' | 'uninstall'
export function createStatsVersion(c: Context, version_id: number, app_id: string, action: VersionAction) {
  if (!c.env.VERSION_USAGE)
    return trackVersionUsageSB(c, version_id, app_id, action)
  return trackVersionUsageCF(c, version_id, app_id, action)
}

export function createStatsLogs(c: Context, app_id: string, device_id: string, action: string, version_id: number) {
  if (!c.env.APP_LOG) // TODO: should make it work with supabase too
    return trackLogsSB(c, app_id, device_id, action, version_id)
  return trackLogsCF(c, app_id, device_id, action, version_id)
}

export function createStatsDevices(c: Context, app_id: string, device_id: string, version: number, platform: Database['public']['Enums']['platform_os'], plugin_version: string, os_version: string, version_build: string, custom_id: string, is_prod: boolean, is_emulator: boolean) {
  if (!c.env.DEVICE_LOG) // TODO: should make it work with supabase too
    return trackDevicesSB(c, app_id, device_id, version, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator)
  return trackDevicesCF(c, app_id, device_id, version, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator)
}

export function createStatsMeta(c: Context, app_id: string, version_id: number, size: number) {
  if (size === 0)
    return
  console.log('createStatsMeta', app_id, version_id, size)
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

export function readStats(c: Context, app_id: string, start_date: string, end_date: string, deviceIds?: string[], search?: string) {
  if (!c.env.APP_LOG)
    return readStatsSB(c, app_id, start_date, end_date, deviceIds, search)
  return readStatsCF(c, app_id, start_date, end_date, deviceIds, search)
}

export function readDevices(c: Context, app_id: string, start_date: string, end_date: string, version_id?: string, deviceIds?: string[], search?: string) {
  if (!c.env.DEVICE_LOG)
    return readDevicesSB(c, app_id, start_date, end_date, version_id, deviceIds, search)
  return readDevicesCF(c, app_id, start_date, end_date, version_id, deviceIds, search)
}
