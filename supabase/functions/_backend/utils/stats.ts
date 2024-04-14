import type { Context } from 'hono'
import { trackBandwidthUsage, trackDeviceUsage, trackVersionUsage } from './supabase.ts'
import { trackBandwidthUsageCF, trackDeviceUsageCF, trackVersionUsageCF } from './cloudflare.ts'

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
