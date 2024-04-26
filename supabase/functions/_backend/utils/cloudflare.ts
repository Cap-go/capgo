import type { AnalyticsEngineDataPoint } from '@cloudflare/workers-types/2024-04-03'
import type { Context } from 'hono'
import ky from 'ky'
import dayjs from 'dayjs'
import { getEnv } from './utils.ts'

// type is require for the bindings no interface
// eslint-disable-next-line ts/consistent-type-definitions
export type Bindings = {
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

export function trackMetaCF(c: Context, app_id: string, version_id: number, size: number) {
  if (!c.env.VERSION_META)
    return
  console.log('trackMetaCF', app_id, version_id, size)
  c.env.VERSION_META.writeDataPoint({
    doubles: [version_id, size],
    indexes: [app_id],
  })
}

export function formatDateCF(date: string | undefined) {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

async function runQueryToCF<T>(c: Context, query: string) {
  const CF_ANALYTICS_TOKEN = getEnv(c, 'CF_ANALYTICS_TOKEN')
  const CF_ACCOUNT_ID = getEnv(c, 'CF_ACCOUNT_ID')

  const response = await ky.post(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/analytics_engine/sql`, {
    headers: {
      Authorization: `Bearer ${CF_ANALYTICS_TOKEN}`,
      'Content-Type': 'text/plain; charset=utf-8',
      'Accept-Encoding': 'gzip, zlib, deflate, zstd, br',
    },
    body: query,
  })

  return response.json<T>()
}

interface DeviceUsageCF {
  date: string
  mau: number
  app_id: string
}

export async function readDeviceUsageCF(c: Context, app_id: string, period_start: string, period_end: string) {
  if (!c.env.DEVICE_USAGE)
    return [] as DeviceUsageCF[]
  const query = `SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS date,
  count(DISTINCT blob1) AS mau,
  index1 AS app_id
FROM device_usage
WHERE
  app_id = '${app_id}'
  AND timestamp >= toDateTime('${formatDateCF(period_start)}')
  AND timestamp < toDateTime('${formatDateCF(period_end)}')
GROUP BY app_id, date
ORDER BY date, app_id;`

  try {
    return await runQueryToCF<DeviceUsageCF[]>(c, query)
  } catch (e) {
    console.error('Error reading device usage', e)
  }
  return [] as DeviceUsageCF[]
}

interface BandwidthUsageCF {
  date: string
  bandwidth: number
  app_id: string
}

export async function readBandwidthUsageCF(c: Context, app_id: string, period_start: string, period_end: string) {
  if (!c.env.BANDWIDTH_USAGE)
    return [] as BandwidthUsageCF[]
  const query = `SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS date,
  sum(double1) AS bandwidth,
  blob2 AS app_id
FROM bandwidth_usage
WHERE
  timestamp >= toDateTime('${formatDateCF(period_start)}')
  AND timestamp < toDateTime('${formatDateCF(period_end)}')
  AND app_id = '${app_id}'
GROUP BY date, app_id
ORDER BY date, app_id;`

  try {
    return await runQueryToCF<BandwidthUsageCF[]>(c, query)
  } catch (e) {
    console.error('Error reading bandwidth usage', e)
  }
  return [] as BandwidthUsageCF[]
}
