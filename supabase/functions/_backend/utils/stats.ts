import type { Context } from 'hono'
import { readBandwidthUsage, readDeviceUsage, readStorageUsage, trackBandwidthUsage, trackDeviceUsage, trackMeta, trackVersionUsage } from './supabase.ts'
import { readBandwidthUsageCF, readDeviceUsageCF, trackBandwidthUsageCF, trackDeviceUsageCF, trackDevicesCF, trackLogsCF, trackMetaCF, trackVersionUsageCF } from './cloudflare.ts'

export function createStatsMau(c: Context, device_id: string, app_id: string) {
  if (!c.env.DEVICE_USAGE)
    return trackDeviceUsage(c, device_id, app_id)
  return trackDeviceUsageCF(c, device_id, app_id)
}

export function createStatsBandwidth(c: Context, device_id: string, app_id: string, file_size: number) {
  if (file_size === 0)
    return
  if (!c.env.BANDWIDTH_USAGE)
    return trackBandwidthUsage(c, device_id, app_id, file_size)
  return trackBandwidthUsageCF(c, device_id, app_id, file_size)
}

export type VersionAction = 'get' | 'fail' | 'install' | 'uninstall'
export function createStatsVersion(c: Context, version_id: number, app_id: string, action: VersionAction) {
  if (!c.env.VERSION_USAGE)
    return trackVersionUsage(c, version_id, app_id, action)
  return trackVersionUsageCF(c, version_id, app_id, action)
}

export function createStatsLogs(c: Context, app_id: string, device_id: string, action: string, version_id: number) {
  if (!c.env.APP_LOG) // TODO: should make it work with supabase too
    return
  return trackLogsCF(c, app_id, device_id, action, version_id)
}

export function createStatsDevices(c: Context, app_id: string, device_id: string, version: number, platform: string, plugin_version: string, os_version: string, version_build: string, custom_id: string, is_prod: boolean, is_emulator: boolean) {
  if (!c.env.DEVICE_INFO) // TODO: should make it work with supabase too
    return
  return trackDevicesCF(c, app_id, device_id, version, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator)
}

export function createStatsMeta(c: Context, app_id: string, version_id: number, size: number) {
  if (size === 0)
    return
  console.log('createStatsMeta', app_id, version_id, size)
  if (!c.env.VERSION_META)
    return trackMeta(c, app_id, version_id, size)
  return trackMetaCF(c, app_id, version_id, size)
}

export function readStatsMau(c: Context, app_id: string, start_date: string, end_date: string) {
  if (!c.env.DEVICE_USAGE)
    return readDeviceUsage(c, app_id, start_date, end_date)
  return readDeviceUsageCF(c, app_id, start_date, end_date)
}

export function readStatsBandwidth(c: Context, app_id: string, start_date: string, end_date: string) {
  if (!c.env.BANDWIDTH_USAGE)
    return readBandwidthUsage(c, app_id, start_date, end_date)
  return readBandwidthUsageCF(c, app_id, start_date, end_date)
}

export function readStatsStorage(c: Context, app_id: string, start_date: string, end_date: string) {
    // No cloudflare implementation, postgrest is enough
    return readStorageUsage(c, app_id, start_date, end_date)
}
