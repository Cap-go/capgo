import type { Context } from 'hono'
import { trackBandwidthUsage, trackDeviceUsage, trackVersionUsage } from './supabase.ts'
import { trackBandwidthUsageCF, trackDeviceUsageCF, trackDevicesCF, trackLogsCF, trackMetaCF, trackVersionUsageCF } from './cloudflare.ts'
import { ClickHouseMeta } from './clickhouse.ts';

export function createStatsMau(c: Context, device_id: string, app_id: string) {
  if (!c.env.DEVICE_USAGE)
    return trackDeviceUsage(c, device_id, app_id)
  return trackDeviceUsageCF(c, device_id, app_id)
}

export function createStatsBandwidth(c: Context, device_id: string, app_id: string, file_size: number) {
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
  if (!c.env.APP_LOG)  // TODO: should make it work with supabase too
    return
  return trackLogsCF(c, app_id, device_id, action, version_id)
}

export function createStatsDevices(c: Context, app_id: string, device_id: string, version: number, platform: string, plugin_version: string, os_version: string, version_build: string, custom_id: string, is_prod: boolean, is_emulator: boolean) {
  if (!c.env.DEVICE_INFO) // TODO: should make it work with supabase too
    return
  return trackDevicesCF(c, app_id, device_id, version, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator)
}

export function createStatsMeta(c: Context, meta: ClickHouseMeta) {
  if (!c.env.VERSION_META)  // TODO: should make it work with supabase too
    return
  return trackMetaCF(c, meta)
}

// read mau

// export function readStatsMau(c: Context, device_id: string, app_id: string) {
//   if (!c.env.APP_USAGE)
//     return readDeviceUsage(c, device_id, app_id)
//   return readDeviceUsageCF(c, device_id, app_id)
// }

// export function readStatsBandwidth(c: Context, device_id: string, app_id: string, file_size: number) {
//   if (!c.env.BANDWIDTH_USAGE)
//     return readBandwidthUsage(c, device_id, app_id, file_size)
//   return readBandwidthUsageCF(c, device_id, app_id, file_size)
// }
