import type { AnalyticsEngineDataPoint, D1Database, Hyperdrive } from '@cloudflare/workers-types'
import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import type { DeviceWithoutCreatedAt, ReadDevicesParams, ReadStatsParams } from './types.ts'
import dayjs from 'dayjs'
import ky from 'ky'
import { hasComparableDeviceChanged, toComparableDevice } from './deviceComparison.ts'
import { cloudlog, cloudlogErr, serializeError } from './loggin.ts'
import { DEFAULT_LIMIT } from './types.ts'
import { getEnv } from './utils.ts'

// type is require for the bindings no interface
// eslint-disable-next-line ts/consistent-type-definitions
export type Bindings = {
  DEVICE_USAGE: AnalyticsEngineDataPoint
  BANDWIDTH_USAGE: AnalyticsEngineDataPoint
  VERSION_USAGE: AnalyticsEngineDataPoint
  APP_LOG: AnalyticsEngineDataPoint
  DB_DEVICES: D1Database
  DB_STOREAPPS: D1Database
  DB_REPLICATE: D1Database
  HYPERDRIVE_DB: Hyperdrive
  HYPERDRIVE_DB_DIRECT: Hyperdrive
  ATTACHMENT_UPLOAD_HANDLER: DurableObjectNamespace
}

export function trackDeviceUsageCF(c: Context, device_id: string, app_id: string) {
  if (!c.env.DEVICE_USAGE)
    return Promise.resolve()
  c.env.DEVICE_USAGE.writeDataPoint({
    blobs: [device_id],
    indexes: [app_id],
  })
  return Promise.resolve()
}

export function trackBandwidthUsageCF(c: Context, device_id: string, app_id: string, file_size: number) {
  if (!c.env.BANDWIDTH_USAGE)
    return Promise.resolve()
  c.env.BANDWIDTH_USAGE.writeDataPoint({
    blobs: [device_id],
    doubles: [file_size],
    indexes: [app_id],
  })
  return Promise.resolve()
}

export function trackVersionUsageCF(c: Context, version_id: number, app_id: string, action: string) {
  if (!c.env.VERSION_USAGE)
    return Promise.resolve()
  c.env.VERSION_USAGE.writeDataPoint({
    blobs: [app_id, version_id, action],
    indexes: [app_id],
  })
  return Promise.resolve()
}

export function trackLogsCF(c: Context, app_id: string, device_id: string, action: string, version_id: number) {
  if (!c.env.APP_LOG)
    return Promise.resolve()
  c.env.APP_LOG.writeDataPoint({
    blobs: [device_id, action],
    doubles: [version_id],
    indexes: [app_id],
  })
  return Promise.resolve()
}

export function trackLogsCFExternal(c: Context, app_id: string, device_id: string, action: Database['public']['Enums']['stats_action'], version_id: number) {
  if (!c.env.APP_LOG_EXTERNAL)
    return Promise.resolve()
  c.env.APP_LOG_EXTERNAL.writeDataPoint({
    blobs: [device_id, action],
    doubles: [version_id],
    indexes: [app_id],
  })
  return Promise.resolve()
}

export async function trackDevicesCF(c: Context, device: DeviceWithoutCreatedAt) {
  cloudlog({ requestId: c.get('requestId'), message: 'trackDevicesCF', device })

  if (!c.env.DB_DEVICES)
    return Promise.resolve()

  const upsertQuery = `
  INSERT INTO devices (
    updated_at, device_id, version, app_id, platform, 
    plugin_version, os_version, version_build, custom_id, 
    is_prod, is_emulator
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (device_id, app_id) DO UPDATE SET
    updated_at = excluded.updated_at,
    version = excluded.version,
    platform = excluded.platform,
    plugin_version = excluded.plugin_version,
    os_version = excluded.os_version,
    version_build = excluded.version_build,
    custom_id = excluded.custom_id,
    is_prod = excluded.is_prod,
    is_emulator = excluded.is_emulator
`
  try {
    const updated_at = new Date().toISOString()

    const comparableDevice = toComparableDevice(device)

    const existingRow = await c.env.DB_DEVICES.prepare(`
      SELECT * FROM devices 
      WHERE device_id = ? AND app_id = ?
    `).bind(device.device_id, device.app_id).first()

    if (!existingRow || hasComparableDeviceChanged(existingRow, device)) {
      cloudlog({ requestId: c.get('requestId'), message: existingRow ? 'Updating existing device' : 'Inserting new device' })

      const res = await c.env.DB_DEVICES.prepare(upsertQuery)
        .bind(
          updated_at,
          device.device_id,
          comparableDevice.version,
          device.app_id,
          comparableDevice.platform,
          comparableDevice.plugin_version,
          comparableDevice.os_version,
          comparableDevice.version_build,
          comparableDevice.custom_id ?? '',
          comparableDevice.is_prod ? 1 : 0,
          comparableDevice.is_emulator ? 1 : 0,
        )
        .run()
      cloudlog({ requestId: c.get('requestId'), message: 'Upsert result:', res })
    }
    else {
      cloudlog({ requestId: c.get('requestId'), message: 'No update needed' })
    }
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error tracking device', error: serializeError(e), query: upsertQuery })
  }

  return Promise.resolve()
}

export function formatDateCF(date: string | undefined) {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

interface AnalyticsApiResponse {
  data: { [key: string]: string }[]
  meta: { name: string, type: string }[]
  rows: number
  rows_before_limit_at_least: number
}

function convertDataToJsTypes<T>(apiResponse: AnalyticsApiResponse) {
  const { meta, data } = apiResponse

  // cloudlog(c.get('requestId'), 'meta', meta)
  const converters = {
    String: (value: string) => String(value),
    UInt64: (value: string) => Number(value),
    DateTime: (value: string) => new Date(value),
  }

  return data.map((row) => {
    const convertedRow = {} as any
    meta.forEach((column) => {
      const { name, type } = column
      convertedRow[name] = (converters as any)[type] ? (converters as any)[type](row[name]) : row[name]
    })
    return convertedRow as T
  })
}

async function runQueryToCFA<T>(c: Context, query: string) {
  const CF_ANALYTICS_TOKEN = getEnv(c, 'CF_ANALYTICS_TOKEN')
  const CF_ACCOUNT_ID = getEnv(c, 'CF_ACCOUNT_ANALYTICS_ID')

  const headers = {
    'Authorization': `Bearer ${CF_ANALYTICS_TOKEN}`,
    'Content-Type': 'text/plain; charset=utf-8',
    'Accept-Encoding': 'gzip, zlib, deflate, zstd, br',
    'User-Agent': 'Capgo/1.0',
  }
  cloudlog({ requestId: c.get('requestId'), message: 'runQueryToCFA payload', headers, query })
  const response = await ky.post(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/analytics_engine/sql`, {
    headers,
    body: query,
  }).catch(async (e) => {
    if (e.name === 'HTTPError') {
      const errorJson = await e.response.json()
      cloudlogErr({ requestId: c.get('requestId'), message: 'runQueryToCFA HTTPError', error: errorJson })
    }
    else {
      cloudlogErr({ requestId: c.get('requestId'), message: 'runQueryToCFA error', error: serializeError(e) })
    }
    throw new Error('runQueryToCFA encountered an error')
  })
  const res = await response.json<AnalyticsApiResponse & { data: T[] }>()
  return convertDataToJsTypes<T>(res)
}

export interface DeviceUsageCF {
  date: string
  mau: number
  app_id: string
}

export interface DeviceUsageAllCF {
  date: string
  device_id: string
  app_id: string
}

export async function readDeviceUsageCF(c: Context, app_id: string, period_start: string, period_end: string) {
  if (!c.env.DEVICE_USAGE)
    return [] as DeviceUsageCF[]
  const query = `SELECT
    formatDateTime(toStartOfInterval(timestamp, INTERVAL '1' DAY), '%Y-%m-%d') AS date,
    blob1 AS device_id,
    index1 AS app_id
  FROM device_usage
  WHERE
    app_id = '${app_id}'
    AND timestamp >= toDateTime('${formatDateCF(period_start)}')
    AND timestamp < toDateTime('${formatDateCF(period_end)}')
  ORDER BY date`

  cloudlog({ requestId: c.get('requestId'), message: 'readDeviceUsageCF query', query })
  try {
    const res = await runQueryToCFA<DeviceUsageAllCF>(c, query)
    // First, filter to keep only the first appearance of each device_id
    const uniqueDevices = new Map<string, DeviceUsageAllCF>()
    res.toReversed().forEach((entry) => {
      uniqueDevices.set(entry.device_id, entry)
    })
    const arr = Array.from(uniqueDevices.values())
    cloudlog({ requestId: c.get('requestId'), message: 'uniqueDevices', arrLength: arr.length })

    // Now calculate MAU based on the unique devices
    const groupedByDay = arr.reduce((acc, curr) => {
      const { date, app_id } = curr
      if (!acc[date]) {
        acc[date] = {
          date,
          mau: 0,
          app_id,
        }
      }
      acc[date].mau++
      return acc
    }, {} as Record<string, DeviceUsageCF>)
    const result = Object.values(groupedByDay).sort((a, b) => a.date > b.date ? 1 : -1)
    return result
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error reading device usage', error: serializeError(e), query })
  }
  return [] as DeviceUsageCF[]
}

interface BandwidthUsageCF {
  date: string
  bandwidth: number
  app_id: string
}

export async function rawAnalyticsQuery(c: Context, query: string) {
  if (!c.env.BANDWIDTH_USAGE)
    return []

  cloudlog({ requestId: c.get('requestId'), message: 'rawAnalyticsQuery query', query })
  try {
    return await runQueryToCFA<any>(c, query)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error reading rawAnalyticsQuery', error: serializeError(e) })
  }
  return []
}

export async function readBandwidthUsageCF(c: Context, app_id: string, period_start: string, period_end: string) {
  if (!c.env.BANDWIDTH_USAGE)
    return [] as BandwidthUsageCF[]
  const query = `SELECT
  formatDateTime(toStartOfInterval(timestamp, INTERVAL '1' DAY), '%Y-%m-%d') AS date,
  sum(double1) AS bandwidth,
  index1 AS app_id
FROM bandwidth_usage
WHERE
  timestamp >= toDateTime('${formatDateCF(period_start)}')
  AND timestamp < toDateTime('${formatDateCF(period_end)}')
  AND app_id = '${app_id}'
GROUP BY date, app_id
ORDER BY date, app_id`

  cloudlog({ requestId: c.get('requestId'), message: 'readBandwidthUsageCF query', query })
  try {
    return await runQueryToCFA<BandwidthUsageCF>(c, query)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error reading bandwidth usage', error: serializeError(e), query })
  }
  return [] as BandwidthUsageCF[]
}

interface StoreApp {
  created_at: string // Assuming ISO string format for datetime
  app_id: string
  url: string
  title: string
  summary: string
  icon: string
  free: boolean
  category: string
  capacitor: boolean
  developer_email: string
  installs: number
  developer: string
  score: number
  to_get_framework: boolean
  onprem: boolean
  updates: number
  to_get_info: boolean
  to_get_similar: boolean
  updated_at: string // Assuming ISO string format for datetime
  cordova: boolean
  react_native: boolean
  capgo: boolean
  kotlin: boolean
  flutter: boolean
  native_script: boolean
  lang?: string // Optional as it's not NOT NULL
  developer_id?: string // Optional as it's not NOT NULL
}

interface VersionUsageCF {
  date: string
  app_id: string
  version_id: number
  get: number
  fail: number
  install: number
  uninstall: number
}

export async function readStatsVersionCF(c: Context, app_id: string, period_start: string, period_end: string) {
  if (!c.env.VERSION_USAGE)
    return [] as VersionUsageCF[]
  const query = `SELECT
  blob1 as app_id,
  blob2 as version_id,
  formatDateTime(toStartOfInterval(timestamp, INTERVAL '1' DAY), '%Y-%m-%d') AS date,
  sum(if(blob3 = 'get', 1, 0)) AS get,
  sum(if(blob3 = 'fail', 1, 0)) AS fail,
  sum(if(blob3 = 'install', 1, 0)) AS install,
  sum(if(blob3 = 'uninstall', 1, 0)) AS uninstall
FROM version_usage
WHERE
  app_id = '${app_id}'
  AND timestamp >= toDateTime('${formatDateCF(period_start)}')
  AND timestamp < toDateTime('${formatDateCF(period_end)}')
GROUP BY date, app_id, version_id
ORDER BY date`

  cloudlog({ requestId: c.get('requestId'), message: 'readStatsVersionCF query', query })
  try {
    return await runQueryToCFA<VersionUsageCF>(c, query)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error reading version usage', error: serializeError(e), query })
  }
  return [] as VersionUsageCF[]
}

interface DeviceRowCF {
  app_id: string
  device_id: string
  version_id: number
  platform: string
  plugin_version: string
  os_version: string
  version_build: string
  custom_id: string
  is_prod: string
  is_emulator: string
  updated_at: string
}

export async function countDevicesCF(c: Context, app_id: string, customIdMode: boolean) {
  if (!c.env.DB_DEVICES)
    return 0

  let query = `SELECT count(*) AS total FROM devices WHERE app_id = ?1`

  if (customIdMode) {
    query = `SELECT count(*) AS total FROM devices WHERE app_id = ?1 AND custom_id IS NOT NULL AND custom_id != ''`
  }

  cloudlog({ requestId: c.get('requestId'), message: 'countDevicesCF query', query })
  try {
    const readD1 = c.env.DB_DEVICES
      .prepare(query)
      .bind(app_id)
      .first('total')
    const res = await readD1
    return res
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error reading device list', error: serializeError(e), query })
  }
  return [] as DeviceRowCF[]
}

export async function readDevicesCF(c: Context, params: ReadDevicesParams, customIdMode: boolean) {
  if (!c.env.DB_DEVICES)
    return [] as DeviceRowCF[]

  let deviceFilter = ''
  let rangeStart = params.rangeStart ?? 0
  let rangeEnd = params.rangeEnd ?? DEFAULT_LIMIT

  if (customIdMode) {
    deviceFilter += `AND custom_id IS NOT NULL AND custom_id != ''`
  }
  if (params.deviceIds?.length) {
    cloudlog({ requestId: c.get('requestId'), message: 'deviceIds', deviceIds: params.deviceIds })
    if (params.deviceIds.length === 1) {
      deviceFilter = `AND device_id = '${params.deviceIds[0]}'`
      rangeStart = 0
      rangeEnd = 1
    }
    else {
      const devicesList = params.deviceIds.join(',')
      deviceFilter = `AND device_id IN (${devicesList})`
      rangeStart = 0
      rangeEnd = params.deviceIds.length
    }
  }
  let searchFilter = ''
  if (params.search) {
    cloudlog({ requestId: c.get('requestId'), message: 'search', search: params.search })
    if (params.deviceIds?.length)
      searchFilter = `AND custom_id LIKE '%${params.search}%')`
    else
      searchFilter = `AND (device_id LIKE '%${params.search}%' OR custom_id LIKE '%${params.search}%')`
  }
  let versionFilter = ''
  if (params.version_id)
    versionFilter = `AND version_id = ${params.version_id}`

  const orderFilters: string[] = []
  if (params.order?.length) {
    params.order.forEach((col) => {
      if (col.sortable && typeof col.sortable === 'string') {
        cloudlog({ requestId: c.get('requestId'), message: 'order', colKey: col.key, colSortable: col.sortable })
        orderFilters.push(`${col.key} ${col.sortable.toUpperCase()}`)
      }
    })
  }
  const orderFilter = orderFilters.length ? `ORDER BY ${orderFilters.join(', ')}` : ''

  const query = `SELECT
  app_id,
  device_id,
  version,
  platform,
  plugin_version,
  os_version,
  version_build,
  is_prod,
  is_emulator,
  custom_id,
  updated_at
FROM devices
WHERE
  app_id = '${params.app_id}' ${deviceFilter} ${searchFilter} ${versionFilter}
${orderFilter}
LIMIT ${rangeEnd} OFFSET ${rangeStart}`

  cloudlog({ requestId: c.get('requestId'), message: 'readDevicesCF query', query })
  try {
    cloudlog({ requestId: c.get('requestId'), message: 'readDevicesCF exec' })
    const readD1 = c.env.DB_DEVICES
      .prepare(query)
      .all()
    cloudlog({ requestId: c.get('requestId'), message: 'readDevicesCF exec await' })
    const res = await readD1
    cloudlog({ requestId: c.get('requestId'), message: 'readDevicesCF res', res })
    return res.results as DeviceRowCF[]
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error reading device list', error: serializeError(e), query })
  }
  return [] as DeviceRowCF[]
}

interface StatRowCF {
  app_id: string
  device_id: string
  action: string
  version_id: number
  created_at: string
}

export async function readStatsCF(c: Context, params: ReadStatsParams) {
  if (!c.env.APP_LOG)
    return [] as StatRowCF[]

  let deviceFilter = ''

  if (params.deviceIds?.length) {
    cloudlog({ requestId: c.get('requestId'), message: 'deviceIds', deviceIds: params.deviceIds })
    if (params.deviceIds.length === 1) {
      deviceFilter = `AND device_id = '${params.deviceIds[0]}'`
    }
    else {
      const devicesList = params.deviceIds.join(',')
      deviceFilter = `AND device_id IN (${devicesList})`
    }
  }
  let searchFilter = ''
  if (params.search) {
    const searchLower = params.search.toLowerCase()
    if (params.deviceIds?.length)
      searchFilter = `AND position('${searchLower}' IN toLower(action)) > 0`
    else
      searchFilter = `AND (position('${searchLower}' IN toLower(device_id)) > 0 OR position('${searchLower}' IN toLower(action)) > 0)`
  }
  const orderFilters: string[] = []
  if (params.order?.length) {
    params.order.forEach((col) => {
      if (col.sortable && typeof col.sortable === 'string') {
        cloudlog({ requestId: c.get('requestId'), message: 'order', colKey: col.key, colSortable: col.sortable })
        orderFilters.push(`${col.key} ${col.sortable.toUpperCase()}`)
      }
    })
  }
  const orderFilter = orderFilters.length ? `ORDER BY ${orderFilters.join(', ')}` : ''
  const startFilter = params.start_date ? `AND created_at >= toDateTime('${formatDateCF(params.start_date)}')` : ''
  const endFilter = params.end_date ? `AND created_at < toDateTime('${formatDateCF(params.end_date)}')` : ''
  const query = `SELECT
  index1 as app_id,
  blob1 as device_id,
  blob2 as action,
  double1 as version_id,
  timestamp as created_at
FROM app_log
WHERE
  app_id = '${params.app_id}' ${deviceFilter} ${searchFilter} ${startFilter} ${endFilter}
GROUP BY app_id, created_at, action, device_id, version_id
${orderFilter}
LIMIT ${params.limit ?? DEFAULT_LIMIT}`

  cloudlog({ requestId: c.get('requestId'), message: 'readStatsCF query', query })
  try {
    return await runQueryToCFA<StatRowCF>(c, query)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error reading stats list', error: serializeError(e), query })
  }
  return [] as StatRowCF[]
}

export async function getAppsFromCF(c: Context): Promise<{ app_id: string }[]> {
  if (!c.env.DB_STOREAPPS)
    return Promise.resolve([])

  const query = `SELECT app_id FROM store_apps WHERE (onprem = 1 OR capgo = 1) AND url != ''`
  cloudlog({ requestId: c.get('requestId'), message: 'getAppsFromCF query', query })
  // use c.env.DB_STOREAPPS and table store_apps
  try {
    const readD1 = c.env.DB_STOREAPPS
      .prepare(query)
      .all()
    const res = await readD1
    if (res.error || !res.results || !res.success)
      cloudlogErr({ requestId: c.get('requestId'), message: 'getAppsFromCF error', error: res.error })
    return res.results as { app_id: string }[]
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error reading app list', error: serializeError(e), query })
  }
  return []
}

export async function countUpdatesFromStoreAppsCF(c: Context): Promise<number> {
  if (!c.env.DB_STOREAPPS)
    return Promise.resolve(0)
  // use countUpdatesFromStoreApps exemple to make it work with Cloudflare
  const query = `SELECT SUM(updates) + SUM(installs) AS count FROM store_apps WHERE onprem = 1 OR capgo = 1`

  cloudlog({ requestId: c.get('requestId'), message: 'countUpdatesFromStoreAppsCF query', query })
  try {
    const readD1 = c.env.DB_STOREAPPS
      .prepare(query)
      .first('count')
    const res = await readD1
    return res
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error counting updates from store apps', error: serializeError(e) })
  }
  return 0
}

export async function countUpdatesFromLogsCF(c: Context): Promise<number> {
  // TODO: This will be a problem in 3 months where the old logs will be deleted automatically by Cloudflare starting 22/08/2024
  const query = `SELECT SUM(_sample_interval) AS count FROM app_log WHERE blob2 = 'get'`

  cloudlog({ requestId: c.get('requestId'), message: 'countUpdatesFromLogsCF query', query })
  try {
    const readAnalytics = await runQueryToCFA<{ count: number }>(c, query)
    return readAnalytics[0].count
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error counting updates from logs', error: serializeError(e) })
  }
  return 0
}

export async function countUpdatesFromLogsExternalCF(c: Context): Promise<number> {
  // TODO: This will be a problem in 3 months where the old logs will be deleted automatically by Cloudflare starting 22/08/2024
  const query = `SELECT SUM(_sample_interval) AS count FROM app_log_external WHERE blob2 = 'get'`

  cloudlog({ requestId: c.get('requestId'), message: 'countUpdatesFromLogsExternalCF query', query })
  try {
    const readAnalytics = await runQueryToCFA<{ count: number }>(c, query)
    return readAnalytics[0].count
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error counting updates from external logs', error: serializeError(e) })
  }
  return 0
}

export async function readActiveAppsCF(c: Context) {
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const query = `SELECT index1 as app_id FROM app_log WHERE timestamp >= toDateTime('${formatDateCF(oneMonthAgo)}') AND timestamp < now() AND blob2 = 'get' GROUP BY app_id`
  cloudlog({ requestId: c.get('requestId'), message: 'readActiveAppsCF query', query })
  try {
    const response = await runQueryToCFA<{ app_id: string }>(c, query)
    const app_ids = response.map(app => app.app_id)
    // deduplicate them
    const unique = Array.from(new Set(app_ids))
    return unique
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error counting active apps', error: serializeError(e) })
  }
  return []
}

export async function readLastMonthUpdatesCF(c: Context) {
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const query = `SELECT sum(if(blob2 = 'get', 1, 0)) AS count FROM app_log WHERE timestamp >= toDateTime('${formatDateCF(oneMonthAgo)}') AND timestamp < now()`
  cloudlog({ requestId: c.get('requestId'), message: 'readLastMonthUpdatesCF query', query })
  try {
    const response = await runQueryToCFA<{ count: number }>(c, query)
    cloudlog({ requestId: c.get('requestId'), message: 'readLastMonthUpdatesCF response', response })
    return response[0].count ?? 0
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error reading last month updates', error: serializeError(e) })
  }
  return 0
}

export async function readLastMonthDevicesCF(c: Context): Promise<number> {
  if (!c.env.DEVICE_USAGE)
    return 0
  const query = `SELECT COUNT(DISTINCT blob1) AS total FROM device_usage WHERE timestamp >= toDateTime('${formatDateCF(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))}') AND timestamp < now()`

  cloudlog({ requestId: c.get('requestId'), message: 'readLastMonthDevicesCF query', query })
  try {
    const res = await runQueryToCFA<{ total: number }>(c, query)
    return res[0].total
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error reading last month devices', error: serializeError(e) })
  }
  return 0
}

export async function getAppsToProcessCF(c: Context, flag: 'to_get_framework' | 'to_get_info' | 'to_get_similar', limit: number) {
  if (!c.env.DB_STOREAPPS)
    return Promise.resolve([] as StoreApp[])
  const query = `SELECT * FROM store_apps WHERE ${flag} = 1 ORDER BY created_at ASC LIMIT ${limit}`

  cloudlog({ requestId: c.get('requestId'), message: 'getAppsToProcessCF query', query })
  try {
    const readD1 = c.env.DB_STOREAPPS
      .prepare(query)
      .all()
    const res = await readD1
    return res.results as StoreApp[]
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error getting apps to process', error: serializeError(e) })
  }
  return [] as StoreApp[]
}

interface TopApp {
  url: string
  title: string
  icon: string
  summary: string
  installs: number
  category: string
}
export async function getTopAppsCF(c: Context, mode: string, limit: number): Promise<TopApp[]> {
  if (!c.env.DB_STOREAPPS)
    return Promise.resolve([] as StoreApp[])
  let modeQuery = ''
  if (mode === 'cordova')
    modeQuery = 'cordova = 1 AND capacitor = 0'

  else if (mode === 'flutter')
    modeQuery = 'flutter = 1'

  else if (mode === 'reactNative')
    modeQuery = 'react_native = 1'

  else if (mode === 'nativeScript')
    modeQuery = 'native_script = 1'

  else if (mode === 'capgo')
    modeQuery = 'capgo = 1'
  else
    modeQuery = 'capacitor = 1'

  const query = `SELECT url, title, icon, summary, installs, category FROM store_apps WHERE ${modeQuery} ORDER BY installs DESC LIMIT ${limit}`

  cloudlog({ requestId: c.get('requestId'), message: 'getTopAppsCF query', query })
  try {
    const readD1 = c.env.DB_STOREAPPS
      .prepare(query)
      .all()
    const res = await readD1
    return res.results as StoreApp[]
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error getting top apps', error: serializeError(e) })
  }
  return [] as StoreApp[]
}

export async function getTotalAppsByModeCF(c: Context, mode: string) {
  if (!c.env.DB_STOREAPPS)
    return Promise.resolve(0)
  let modeQuery = ''
  if (mode === 'cordova')
    modeQuery = 'cordova = 1 AND capacitor = 0'

  else if (mode === 'flutter')
    modeQuery = 'flutter = 1'

  else if (mode === 'reactNative')
    modeQuery = 'react_native = 1'

  else if (mode === 'nativeScript')
    modeQuery = 'native_script = 1'

  else if (mode === 'capgo')
    modeQuery = 'capgo = 1'
  else
    modeQuery = 'capacitor = 1'

  const query = `SELECT COUNT(*) AS total FROM store_apps WHERE ${modeQuery}`

  cloudlog({ requestId: c.get('requestId'), message: 'getTotalAppsByModeCF query', query })
  try {
    const readD1 = c.env.DB_STOREAPPS
      .prepare(query)
      .first('total')
    const res = await readD1
    return res
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error getting total apps by mode', error: serializeError(e) })
  }
  return 0
}

export async function getStoreAppByIdCF(c: Context, appId: string): Promise<StoreApp> {
  if (!c.env.DB_STOREAPPS)
    return Promise.resolve({} as StoreApp)
  const query = `SELECT * FROM store_apps WHERE app_id = '${appId}' LIMIT 1`

  cloudlog({ requestId: c.get('requestId'), message: 'getStoreAppByIdCF query', query })
  try {
    const readD1 = c.env.DB_STOREAPPS
      .prepare(query)
      .first()
    const res = await readD1
    return res
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error getting store app by id', error: serializeError(e) })
  }
  return {} as StoreApp
}

// add function createIfNotExistStoreInfo

export async function createIfNotExistStoreInfo(c: Context, app: Partial<StoreApp>) {
  if (!c.env.DB_STOREAPPS || !app.app_id)
    return Promise.resolve()

  try {
    // Check if app exists
    const existingApp = await c.env.DB_STOREAPPS
      .prepare('SELECT app_id FROM store_apps WHERE app_id = ?')
      .bind(app.app_id)
      .first()

    if (!existingApp) {
      const columns = Object.keys(app)
      const placeholders = columns.map(() => '?').join(', ')
      const values = columns.map(column => app[column as keyof StoreApp])

      const query = `INSERT INTO store_apps (${columns.join(', ')}) VALUES (${placeholders})`
      cloudlog({ requestId: c.get('requestId'), message: 'createIfNotExistStoreInfo query', query, placeholders, values })
      const res = await c.env.DB_STOREAPPS
        .prepare(query)
        .bind(...values)
        .run()

      cloudlog({ requestId: c.get('requestId'), message: 'createIfNotExistStoreInfo result', res })
    }
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error creating store info', error: serializeError(e) })
  }

  return Promise.resolve()
}

export async function saveStoreInfoCF(c: Context, app: Partial<StoreApp>) {
  if (!c.env.DB_STOREAPPS)
    return Promise.resolve()

  const columns = Object.keys(app).filter(column => column !== 'app_id') as (keyof StoreApp)[]

  const placeholders = columns.map(() => '?').join(', ')
  const updates = columns.map(column => `${column} = EXCLUDED.${column}`).join(', ')
  const values = columns.map(column => app[column])

  const query = `INSERT INTO store_apps (app_id, ${columns.join(', ')}) VALUES (?, ${placeholders}) ON CONFLICT(app_id) DO UPDATE SET ${updates}`

  try {
    const res = await c.env.DB_STOREAPPS
      .prepare(query)
      .bind(app.app_id, ...values)
      .run()
    cloudlog({ requestId: c.get('requestId'), message: 'saveStoreInfoCF result', res })
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error saving store info', error: serializeError(e) })
  }

  return Promise.resolve()
}

export function bulkUpdateStoreAppsCF(c: Context, apps: StoreApp[]) {
  if (!c.env.DB_STOREAPPS)
    return Promise.resolve()

  if (!apps.length)
    return Promise.resolve()

  // loop on all apps to insert with saveStoreInfoCF
  const jobs = []
  for (const app of apps)
    jobs.push(saveStoreInfoCF(c, app))

  return Promise.all(jobs)
}

export async function updateStoreApp(c: Context, appId: string, updates: number) {
  if (!c.env.DB_STOREAPPS)
    return Promise.resolve()

  const query = `INSERT INTO store_apps (app_id, updates, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(app_id) DO UPDATE SET updates = updates + ?, updated_at = datetime('now')`

  try {
    const res = await c.env.DB_STOREAPPS
      .prepare(query)
      .bind(appId, updates, updates)
      .run()
    cloudlog({ requestId: c.get('requestId'), message: 'updateStoreApp result', res })
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error updating StoreApp', error: serializeError(e) })
  }

  return Promise.resolve()
}

// Update the interface
interface UpdateStats {
  apps: {
    app_id: string
    failed: number
    set: number
    get: number
    success_rate: number
    healthy: boolean
  }[]
  total: {
    failed: number
    set: number
    get: number
    success_rate: number
    healthy: boolean
  }
}

// Update the function
export async function getUpdateStatsCF(c: Context): Promise<UpdateStats> {
  const query = `
    SELECT
      blob1 AS app_id,
      sum(if(blob3 = 'fail', 1, 0)) AS failed,
      sum(if(blob3 = 'install', 1, 0)) AS set,
      sum(if(blob3 = 'get', 1, 0)) AS get
    FROM version_usage
    WHERE timestamp >= toDateTime(toUnixTimestamp(now()) - 600)
      AND timestamp < toDateTime(toUnixTimestamp(now()) - 540)
    GROUP BY blob1
  `

  cloudlog({ requestId: c.get('requestId'), message: 'getUpdateStatsCF query', query })
  try {
    const result = await runQueryToCFA<{ app_id: string, failed: number, set: number, get: number }>(c, query)

    cloudlog({ requestId: c.get('requestId'), message: 'getUpdateStatsCF result', result })
    const apps = result
      .filter(app => app.get > 0)
      .map((app) => {
        const totalEvents = app.set + app.get
        const successRate = Number(Number(totalEvents > 0 ? (app.get / totalEvents) * 100 : 100).toFixed(2))
        return {
          ...app,
          success_rate: successRate,
          healthy: successRate >= 70,
        }
      })

    const total = apps.reduce((acc, app) => {
      acc.failed += app.failed
      acc.set += app.set
      acc.get += app.get
      return acc
    }, { failed: 0, set: 0, get: 0 })

    const totalEvents = total.set + total.get
    const totalSuccessRate = totalEvents > 0 ? (total.get / totalEvents) * 100 : 100

    return {
      apps,
      total: {
        ...total,
        success_rate: Number(totalSuccessRate.toFixed(0)),
        healthy: totalSuccessRate >= 70,
      },
    }
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error getting update stats', error: serializeError(e) })
    return {
      apps: [],
      total: {
        failed: 0,
        set: 0,
        get: 0,
        success_rate: 0,
        healthy: false,
      },
    }
  }
}
