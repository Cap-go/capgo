import type { AnalyticsEngineDataPoint } from '@cloudflare/workers-types/2024-04-03'
import type { Context } from 'hono'
import { ClickHouseMeta } from './clickhouse.ts';

export interface Bindings {
  DEVICE_USAGE: AnalyticsEngineDataPoint
  BANDWIDTH_USAGE: AnalyticsEngineDataPoint
  VERSION_USAGE: AnalyticsEngineDataPoint
  APP_LOG: AnalyticsEngineDataPoint
  DEVICE_INFO: AnalyticsEngineDataPoint
}

export function trackDeviceUsageCF(c: Context, device_id: string, app_id: string) {
  if (!c.env.DEVICE_USAGE)
    return
  c.env.DEVICE_USAGE.writeDataPoint({
    blobs: [device_id],
    indexes: [app_id],
  })
}

export function trackBandwidthUsageCF(c: Context, device_id: string, app_id: string, file_size: number) {
  if (!c.env.BANDWIDTH_USAGE)
    return
  c.env.BANDWIDTH_USAGE.writeDataPoint({
    blobs: [device_id],
    doubles: [file_size],
    indexes: [app_id],
  })
}

export function trackVersionUsageCF(c: Context, version_id: number, app_id: string, action: string) {
  if (!c.env.VERSION_USAGE)
    return
  c.env.VERSION_USAGE.writeDataPoint({
    blobs: [app_id, version_id, action],
    indexes: [app_id],
  })
}

export function trackLogsCF(c: Context, app_id: string, device_id: string, action: string, version_id: number) {
  if (!c.env.APP_LOG)
    return
  c.env.APP_LOG.writeDataPoint({
    blobs: [device_id, action],
    doubles: [version_id],
    indexes: [app_id],
  })
}

export function trackDevicesCF(c: Context, app_id: string, device_id: string, version_id: number, platform: string, plugin_version: string, os_version: string, version_build: string, custom_id: string, is_prod: boolean, is_emulator: boolean) {
  if (!c.env.DEVICE_INFO)
    return
  c.env.DEVICE_INFO.writeDataPoint({
    blobs: [device_id, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator],
    doubles: [version_id],
    indexes: [app_id],
  })
}

export function trackMetaCF(c: Context, meta: ClickHouseMeta) {
  if (!c.env.VERSION_META)
    return
  c.env.VERSION_META.writeDataPoint({
    doubles: [meta.action === 'add' ? meta.size : -meta.size],
    indexes: [meta.app_id],
  })
}

// export function readDeviceUsageCF(c: Context, app_id: string, period_start: string, period_end: string, total: boolean = true) {
//   if (!c.env.APP_USAGE)
//     return

// }

// export function readBandwidthUsageCF(c: Context, app_id: string, period_start: string, period_end: string, total: boolean = true) {
//   if (!c.env.BANDWIDTH_USAGE)
//     return

//   const queryTotal = `SELECT
//   sum(double1) AS total_bandwidth
// FROM BANDWIDTH_USAGE
// WHERE
//   timestamp >= '${period_start}'
//   AND timestamp < '${period_end}'
//   AND blob2 = '${app_id}'`

//  const queryByDay = `SELECT DATE(timestamp) AS day, SUM(file_size) AS bandwidth
//  FROM bandwidth_usage
//  WHERE timestamp >= '${period_start}' AND timestamp < ${period_end}'
//    AND app_id = '${app_id}'
//  GROUP BY day
//  ORDER BY day;
//  `

// }
