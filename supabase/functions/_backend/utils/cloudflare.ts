import type { AnalyticsEngineDataPoint, D1Database, Hyperdrive } from '@cloudflare/workers-types'
import type { Context } from 'hono'
import type { DeviceComparable } from './deviceComparison.ts'
import type { Database } from './supabase.types.ts'
import type { DeviceRes, DeviceWithoutCreatedAt, ReadDevicesParams, ReadStatsParams } from './types.ts'
import dayjs from 'dayjs'
import { sql } from 'drizzle-orm'
import { CacheHelper } from './cache.ts'
import { hasComparableDeviceChanged, toComparableDevice } from './deviceComparison.ts'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { getDrizzleClient, getPgClient } from './pg.ts'
import { DEFAULT_LIMIT } from './types.ts'
import { getEnv } from './utils.ts'

// type is require for the bindings no interface
// eslint-disable-next-line ts/consistent-type-definitions
export type Bindings = {
  DEVICE_USAGE: AnalyticsEngineDataPoint
  BANDWIDTH_USAGE: AnalyticsEngineDataPoint
  VERSION_USAGE: AnalyticsEngineDataPoint
  APP_LOG: AnalyticsEngineDataPoint
  DEVICE_INFO: AnalyticsEngineDataPoint
  DB_STOREAPPS: D1Database
  DB_REPLICA_EU: D1Database
  DB_REPLICA_AS: D1Database
  DB_REPLICA_US: D1Database
  DB_REPLICA_OC: D1Database
  HYPERDRIVE_CAPGO_DIRECT_EU: Hyperdrive // Add Hyperdrive binding
  HYPERDRIVE_CAPGO_DIRECT_AS: Hyperdrive // Add Hyperdrive binding
  HYPERDRIVE_CAPGO_DIRECT_NA: Hyperdrive // Add Hyperdrive binding
  HYPERDRIVE_CAPGO_SESSION_EU: Hyperdrive // Add Hyperdrive binding
  HYPERDRIVE_CAPGO_SESSION_AS: Hyperdrive // Add Hyperdrive binding
  HYPERDRIVE_CAPGO_SESSION_NA: Hyperdrive // Add Hyperdrive binding
  HYPERDRIVE_CAPGO_TRANSACTION_EU: Hyperdrive // Add Hyperdrive binding
  HYPERDRIVE_CAPGO_TRANSACTION_AS: Hyperdrive // Add Hyperdrive binding
  HYPERDRIVE_CAPGO_TRANSACTION_NA: Hyperdrive // Add Hyperdrive binding
  ATTACHMENT_UPLOAD_HANDLER: DurableObjectNamespace
}

const TRACK_DEVICE_USAGE_CACHE_PATH = '/.track-device-usage-cache'
const TRACK_DEVICE_USAGE_CACHE_MAX_AGE_SECONDS = 29 * 24 * 60 * 60 // 29 days

/**
 * Track device usage (MAU) in Cloudflare Analytics Engine
 *
 * This function sends MAU statistics to Cloudflare Analytics Engine with both app_id and org_id
 * for organization-level analytics and activity detection. The org_id allows for:
 * - Organization-level MAU queries and filtering
 * - Activity detection for organizations with recent MAU stats
 * - Better analytics segmentation by organization
 *
 * Uses caching to only write once per device per 29 days to reduce Analytics Engine costs
 * while maintaining accurate MAU counts.
 *
 * @param c - Hono context
 * @param device_id - Unique device identifier
 * @param app_id - Application identifier
 * @param org_id - Organization identifier (optional, defaults to empty string)
 */
export async function trackDeviceUsageCF(c: Context, device_id: string, app_id: string, org_id: string) {
  if (!c.env.DEVICE_USAGE)
    return

  try {
    const usageCache = new CacheHelper(c)
    const usageCacheRequest = usageCache.buildRequest(TRACK_DEVICE_USAGE_CACHE_PATH, {
      app_id,
      device_id,
    })

    // Check if device was already tracked within the cache period (29 days)
    if (usageCache.available) {
      const cachedUsage = await usageCache.matchJson<{ t: number }>(usageCacheRequest)
      if (cachedUsage) {
        // Device already tracked within 29 days, skip write
        return
      }
    }

    // Write to Analytics Engine
    c.env.DEVICE_USAGE.writeDataPoint({
      blobs: [device_id, org_id],
      indexes: [app_id],
    })

    // Cache the write for 29 days
    if (usageCache.available) {
      await usageCache.putJson(usageCacheRequest, { t: Date.now() }, TRACK_DEVICE_USAGE_CACHE_MAX_AGE_SECONDS)
    }
  }
  catch {
    // On error, still try to write to Analytics Engine without caching
    c.env.DEVICE_USAGE.writeDataPoint({
      blobs: [device_id, org_id],
      indexes: [app_id],
    })
  }
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

export function trackLogsCF(c: Context, app_id: string, device_id: string, action: string, version_name: string) {
  if (!c.env.APP_LOG)
    return Promise.resolve()

  c.env.APP_LOG.writeDataPoint({
    blobs: [device_id, action, version_name],
    indexes: [app_id],
  })

  return Promise.resolve()
}

export function trackLogsCFExternal(c: Context, app_id: string, device_id: string, action: Database['public']['Enums']['stats_action'], version_name: string) {
  if (!c.env.APP_LOG_EXTERNAL)
    return Promise.resolve()

  c.env.APP_LOG_EXTERNAL.writeDataPoint({
    blobs: [device_id, action, version_name],
    indexes: [app_id],
  })

  return Promise.resolve()
}

function getD1WriteStoreAppSession(c: Context) {
  return c.env.DB_STOREAPPS
}

function getD1ReadStoreAppSession(c: Context) {
  return c.env.DB_STOREAPPS.withSession('first-unconstrained')
}

const TRACK_DEVICE_CACHE_PATH = '/.track-device-cache'
const TRACK_DEVICE_CACHE_MAX_AGE_SECONDS = 31536000

type DeviceCachePayload = DeviceComparable & {
  app_id: string
  device_id: string
  cached_at: string
}

export async function trackDevicesCF(c: Context, device: DeviceWithoutCreatedAt) {
  cloudlog({ requestId: c.get('requestId'), message: 'trackDevicesCF', device })

  // Analytics Engine DEVICE_INFO is required for tracking devices
  if (!c.env.DEVICE_INFO) {
    cloudlog({ requestId: c.get('requestId'), message: 'DEVICE_INFO not available, skipping trackDevicesCF' })
    return
  }

  try {
    const trackDeviceCache = new CacheHelper(c)
    const trackDeviceCacheRequest = trackDeviceCache.buildRequest(TRACK_DEVICE_CACHE_PATH, {
      app_id: device.app_id,
      device_id: device.device_id,
    })
    const cachedDevice = trackDeviceCache.available
      ? await trackDeviceCache.matchJson<DeviceCachePayload>(trackDeviceCacheRequest)
      : null
    // TODO: re-enable caching after 10 december, to let the new DB get populated
    if (cachedDevice && !hasComparableDeviceChanged(cachedDevice, device) && false) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'Cache hit – device unchanged, skipping write',
        context: {
          device_id: device.device_id,
          app_id: device.app_id,
        },
      })
      return
    }

    const comparableDevice = toComparableDevice(device)

    // Write to Analytics Engine - this is the primary store now
    cloudlog({ requestId: c.get('requestId'), message: 'Writing to Analytics Engine DEVICE_INFO' })
    // Platform: 0 = android, 1 = ios
    const platformValue = comparableDevice.platform?.toLowerCase() === 'ios' ? 1 : 0
    c.env.DEVICE_INFO.writeDataPoint({
      blobs: [
        device.device_id,
        comparableDevice.version_name ?? '',
        comparableDevice.plugin_version ?? '',
        comparableDevice.os_version ?? '',
        comparableDevice.custom_id ?? '',
        comparableDevice.version_build ?? '',
        comparableDevice.default_channel ?? '',
      ],
      doubles: [
        platformValue,
        comparableDevice.is_prod ? 1 : 0,
        comparableDevice.is_emulator ? 1 : 0,
      ],
      indexes: [device.app_id],
    })

    // Update cache
    if (trackDeviceCache.available) {
      const cachePayload: DeviceCachePayload = {
        ...comparableDevice,
        app_id: device.app_id,
        device_id: device.device_id,
        cached_at: new Date().toISOString(),
      }
      await trackDeviceCache.putJson(trackDeviceCacheRequest, cachePayload, TRACK_DEVICE_CACHE_MAX_AGE_SECONDS)
    }
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error tracking device', error: serializeError(e), device })
  }
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

  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/analytics_engine/sql`, {
      method: 'POST',
      headers,
      body: query,
    })

    if (!response.ok) {
      const errorJson = await response.json()
      cloudlogErr({ requestId: c.get('requestId'), message: 'runQueryToCFA HTTPError', status: response.status, error: errorJson })
      throw new Error('runQueryToCFA encountered an error')
    }

    const res = await response.json() as AnalyticsApiResponse & { data: T[] }
    return convertDataToJsTypes<T>(res)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'runQueryToCFA error', error: serializeError(e) })
    throw new Error('runQueryToCFA encountered an error')
  }
}

export interface DeviceUsageCF {
  date: string
  mau: number
  app_id: string
  org_id?: string
}

export interface DeviceUsageAllCF {
  date: string
  device_id: string
  app_id: string
  org_id: string
}

export async function readDeviceUsageCF(c: Context, app_id: string, period_start: string, period_end: string) {
  if (!c.env.DEVICE_USAGE)
    return [] as DeviceUsageCF[]
  const query = `SELECT
    formatDateTime(toStartOfInterval(timestamp, INTERVAL '1' DAY), '%Y-%m-%d') AS date,
    blob1 AS device_id,
    index1 AS app_id,
    blob2 AS org_id
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
      const { date, app_id, org_id } = curr
      if (!acc[date]) {
        acc[date] = {
          date,
          mau: 0,
          app_id,
          org_id,
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

export async function countDevicesCF(c: Context, app_id: string, customIdMode: boolean) {
  // Use Analytics Engine DEVICE_INFO for counting devices
  const customIdFilter = customIdMode ? `AND blob5 != ''` : ''
  const query = `SELECT COUNT(DISTINCT blob1) AS total
FROM device_info
WHERE index1 = '${app_id}' ${customIdFilter}`

  cloudlog({ requestId: c.get('requestId'), message: 'countDevicesCF query', query })
  try {
    const res = await runQueryToCFA<{ total: number }>(c, query)
    return res[0]?.total ?? 0
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error reading device count from Analytics Engine', error: serializeError(e), query })
  }
  return 0
}

interface DeviceInfoCF {
  device_id: string
  version_name: string
  plugin_version: string
  os_version: string
  custom_id: string
  version_build: string
  default_channel: string
  platform: number // 0 = android, 1 = ios
  is_prod: number // 0 or 1
  is_emulator: number // 0 or 1
  updated_at: string
}

export async function readDevicesCF(c: Context, params: ReadDevicesParams, customIdMode: boolean): Promise<DeviceRes[]> {
  // Use Analytics Engine DEVICE_INFO for reading devices
  // Schema: blob1=device_id, blob2=version_name, blob3=plugin_version, blob4=os_version,
  //         blob5=custom_id, blob6=version_build, blob7=default_channel
  //         double1=platform (0=android, 1=ios), double2=is_prod, double3=is_emulator
  //         index1=app_id, timestamp=updated_at

  const limit = params.limit ?? DEFAULT_LIMIT
  const conditions: string[] = [`index1 = '${params.app_id}'`]

  if (customIdMode) {
    conditions.push(`blob5 != ''`)
  }

  if (params.deviceIds?.length) {
    cloudlog({ requestId: c.get('requestId'), message: 'deviceIds', deviceIds: params.deviceIds })
    if (params.deviceIds.length === 1) {
      conditions.push(`blob1 = '${params.deviceIds[0]}'`)
    }
    else {
      const devicesList = params.deviceIds.map(id => `'${id}'`).join(', ')
      conditions.push(`blob1 IN (${devicesList})`)
    }
  }

  if (params.search) {
    cloudlog({ requestId: c.get('requestId'), message: 'search', search: params.search })
    const searchLower = params.search.toLowerCase()
    if (params.deviceIds?.length) {
      conditions.push(`position('${searchLower}' IN toLower(blob5)) > 0`)
    }
    else {
      // Search in device_id, custom_id, or version_name
      conditions.push(`(position('${searchLower}' IN toLower(blob1)) > 0 OR position('${searchLower}' IN toLower(blob5)) > 0 OR position('${searchLower}' IN toLower(blob2)) > 0)`)
    }
  }

  if (params.version_name) {
    conditions.push(`blob2 = '${params.version_name}'`)
  }

  // Cursor-based pagination using timestamp
  let cursorFilter = ''
  if (params.cursor) {
    // Cursor format: "timestamp|device_id"
    const [cursorTime, cursorDeviceId] = params.cursor.split('|')
    if (cursorTime && cursorDeviceId) {
      cursorFilter = `AND (timestamp < toDateTime('${cursorTime}') OR (timestamp = toDateTime('${cursorTime}') AND blob1 > '${cursorDeviceId}'))`
    }
  }

  // Query to get latest record per device_id using argMax
  const query = `SELECT
  argMax(blob1, timestamp) AS device_id,
  argMax(blob2, timestamp) AS version_name,
  argMax(blob3, timestamp) AS plugin_version,
  argMax(blob4, timestamp) AS os_version,
  argMax(blob5, timestamp) AS custom_id,
  argMax(blob6, timestamp) AS version_build,
  argMax(blob7, timestamp) AS default_channel,
  argMax(double1, timestamp) AS platform,
  argMax(double2, timestamp) AS is_prod,
  argMax(double3, timestamp) AS is_emulator,
  max(timestamp) AS updated_at
FROM device_info
WHERE ${conditions.join(' AND ')} ${cursorFilter}
GROUP BY blob1
ORDER BY updated_at DESC, device_id ASC
LIMIT ${limit + 1}`

  cloudlog({ requestId: c.get('requestId'), message: 'readDevicesCF query', query })
  try {
    const res = await runQueryToCFA<DeviceInfoCF>(c, query)
    cloudlog({ requestId: c.get('requestId'), message: 'readDevicesCF res', resLength: res.length })

    // Convert Analytics Engine results to Database device format
    const results = res.map(row => ({
      app_id: params.app_id,
      device_id: row.device_id,
      version: null, // version ID not stored in Analytics Engine
      version_name: row.version_name || null,
      platform: row.platform === 1 ? 'ios' : 'android',
      plugin_version: row.plugin_version,
      os_version: row.os_version,
      version_build: row.version_build,
      is_prod: Boolean(row.is_prod),
      is_emulator: Boolean(row.is_emulator),
      custom_id: row.custom_id,
      updated_at: row.updated_at,
      default_channel: row.default_channel || null,
      created_at: null, // Not stored in Analytics Engine
    })) as DeviceRes[]

    return results
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error reading device list from Analytics Engine', error: serializeError(e), query })
  }
  return [] as DeviceRes[]
}

interface StatRowCF {
  app_id: string
  device_id: string
  action: string
  version_name: string
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

  let actionsFilter = ''
  if (params.actions?.length) {
    cloudlog({ requestId: c.get('requestId'), message: 'actions filter', actions: params.actions })
    if (params.actions.length === 1) {
      actionsFilter = `AND action = '${params.actions[0]}'`
    }
    else {
      const actionsList = params.actions.map(a => `'${a}'`).join(',')
      actionsFilter = `AND action IN (${actionsList})`
    }
  }

  let searchFilter = ''
  if (params.search) {
    const searchLower = params.search.toLowerCase()
    if (params.deviceIds?.length)
      searchFilter = `AND (position('${searchLower}' IN toLower(action)) > 0 OR position('${searchLower}' IN toLower(blob3)) > 0)`
    else
      searchFilter = `AND (position('${searchLower}' IN toLower(device_id)) > 0 OR position('${searchLower}' IN toLower(action)) > 0 OR position('${searchLower}' IN toLower(blob3)) > 0)`
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
  blob3 as version_name,
  timestamp as created_at
FROM app_log
WHERE
  app_id = '${params.app_id}' ${deviceFilter} ${actionsFilter} ${searchFilter} ${startFilter} ${endFilter}
GROUP BY app_id, created_at, action, device_id, version_name
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
  // use c.env.DB_STORE_APPS and table store_apps
  try {
    const readD1 = getD1ReadStoreAppSession(c)
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
  // use countUpdatesFromStoreApps example to make it work with Cloudflare
  const query = `SELECT SUM(updates) + SUM(installs) AS count FROM store_apps WHERE onprem = 1 OR capgo = 1`

  cloudlog({ requestId: c.get('requestId'), message: 'countUpdatesFromStoreAppsCF query', query })
  try {
    const readD1 = getD1ReadStoreAppSession(c)
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
    const readD1 = getD1ReadStoreAppSession(c)
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
    const readD1 = getD1ReadStoreAppSession(c)
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
    const readD1 = getD1ReadStoreAppSession(c)
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
    const readD1 = getD1ReadStoreAppSession(c)
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
    const existingApp = await getD1ReadStoreAppSession(c)
      .prepare('SELECT app_id FROM store_apps WHERE app_id = ?')
      .bind(app.app_id)
      .first()

    if (existingApp) {
      return false
    }
    const columns = Object.keys(app)
    const placeholders = columns.map(() => '?').join(', ')
    const values = columns.map(column => app[column as keyof StoreApp])

    const query = `INSERT INTO store_apps (${columns.join(', ')}) VALUES (${placeholders})`
    cloudlog({ requestId: c.get('requestId'), message: 'createIfNotExistStoreInfo query', query, placeholders, values })
    const res = await getD1WriteStoreAppSession(c)
      .prepare(query)
      .bind(...values)
      .run()

    cloudlog({ requestId: c.get('requestId'), message: 'createIfNotExistStoreInfo result', res })
    return true
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
    const res = await getD1WriteStoreAppSession(c)
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
    const res = await getD1WriteStoreAppSession(c)
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

// Note: Device cleanup is no longer needed as Analytics Engine handles data retention automatically

// ============================================================================
// ADMIN ANALYTICS FUNCTIONS
// ============================================================================

/**
 * Admin dashboard analytics interfaces and functions for platform-wide statistics
 */

export interface AdminUploadMetrics {
  date: string
  uploads: number
  app_id?: string
}

export interface AdminDistributionMetrics {
  date: string
  downloads: number // 'get' actions
  installs: number
  app_id?: string
}

export interface AdminFailureMetrics {
  date: string
  failures: number
  failure_rate: number // percentage
  app_id?: string
}

export interface AdminSuccessRate {
  installs: number
  fails: number
  success_rate: number // percentage
  total_actions: number
}

export interface AdminPlatformOverview {
  mau: number
  active_apps: number
  active_orgs: number
  success_rate: number
  total_bandwidth: number
  android_devices: number
  ios_devices: number
  total_devices: number
  period_start: string
  period_end: string
}

export interface AdminOrgMetrics {
  org_id: string
  mau: number
  bandwidth: number
  updates: number
  apps_count: number
}

export interface AdminMauTrend {
  date: string
  mau: number
}

export interface AdminSuccessRateTrend {
  date: string
  installs: number
  fails: number
  success_rate: number
}

export interface AdminAppsTrend {
  date: string
  apps_created: number
}

export interface AdminBundlesTrend {
  date: string
  bundles_created: number
}

export interface AdminDeploymentsTrend {
  date: string
  deployments: number
}

/**
 * Get upload metrics for admin dashboard
 * Returns daily unique version uploads, optionally filtered by app_id
 */
export async function getAdminUploadMetrics(
  c: Context,
  start_date: string,
  end_date: string,
  app_id?: string,
): Promise<AdminUploadMetrics[]> {
  if (!c.env.VERSION_USAGE)
    return []

  const appFilter = app_id ? `AND blob1 = '${app_id}'` : ''

  const query = `SELECT
    formatDateTime(toStartOfInterval(timestamp, INTERVAL '1' DAY), '%Y-%m-%d') AS date,
    COUNT(DISTINCT blob2) AS uploads
    ${app_id ? `, blob1 AS app_id` : ''}
  FROM version_usage
  WHERE timestamp >= toDateTime('${formatDateCF(start_date)}')
    AND timestamp < toDateTime('${formatDateCF(end_date)}')
    ${appFilter}
  GROUP BY date ${app_id ? ', app_id' : ''}
  ORDER BY date ASC`

  cloudlog({ requestId: c.get('requestId'), message: 'getAdminUploadMetrics query', query })

  try {
    return await runQueryToCFA<AdminUploadMetrics>(c, query)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error in getAdminUploadMetrics', error: serializeError(e), query })
    return []
  }
}

/**
 * Get distribution metrics for admin dashboard
 * Returns daily download (get) and install counts
 */
export async function getAdminDistributionMetrics(
  c: Context,
  start_date: string,
  end_date: string,
  app_id?: string,
): Promise<AdminDistributionMetrics[]> {
  if (!c.env.VERSION_USAGE)
    return []

  const appFilter = app_id ? `AND blob1 = '${app_id}'` : ''

  const query = `SELECT
    formatDateTime(toStartOfInterval(timestamp, INTERVAL '1' DAY), '%Y-%m-%d') AS date,
    sum(if(blob3 = 'get', 1, 0)) AS downloads,
    sum(if(blob3 = 'install', 1, 0)) AS installs
    ${app_id ? `, blob1 AS app_id` : ''}
  FROM version_usage
  WHERE timestamp >= toDateTime('${formatDateCF(start_date)}')
    AND timestamp < toDateTime('${formatDateCF(end_date)}')
    ${appFilter}
  GROUP BY date ${app_id ? ', app_id' : ''}
  ORDER BY date ASC`

  cloudlog({ requestId: c.get('requestId'), message: 'getAdminDistributionMetrics query', query })

  try {
    return await runQueryToCFA<AdminDistributionMetrics>(c, query)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error in getAdminDistributionMetrics', error: serializeError(e), query })
    return []
  }
}

/**
 * Get failure metrics for admin dashboard
 * Returns daily failure counts and failure rates
 */
export async function getAdminFailureMetrics(
  c: Context,
  start_date: string,
  end_date: string,
  app_id?: string,
): Promise<AdminFailureMetrics[]> {
  if (!c.env.VERSION_USAGE)
    return []

  const appFilter = app_id ? `AND blob1 = '${app_id}'` : ''

  const query = `SELECT
    formatDateTime(toStartOfInterval(timestamp, INTERVAL '1' DAY), '%Y-%m-%d') AS date,
    sum(if(blob3 = 'fail', 1, 0)) AS failures,
    sum(if(blob3 = 'install', 1, 0)) AS installs,
    if(installs + failures > 0, (failures / (installs + failures)) * 100, 0) AS failure_rate
    ${app_id ? `, blob1 AS app_id` : ''}
  FROM version_usage
  WHERE timestamp >= toDateTime('${formatDateCF(start_date)}')
    AND timestamp < toDateTime('${formatDateCF(end_date)}')
    ${appFilter}
  GROUP BY date ${app_id ? ', app_id' : ''}
  ORDER BY date ASC`

  cloudlog({ requestId: c.get('requestId'), message: 'getAdminFailureMetrics query', query })

  try {
    return await runQueryToCFA<AdminFailureMetrics>(c, query)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error in getAdminFailureMetrics', error: serializeError(e), query })
    return []
  }
}

/**
 * Get platform success rate for admin dashboard
 * Returns overall install vs fail statistics
 */
export async function getAdminSuccessRate(
  c: Context,
  start_date: string,
  end_date: string,
  app_id?: string,
): Promise<AdminSuccessRate | null> {
  if (!c.env.VERSION_USAGE)
    return null

  const appFilter = app_id ? `AND blob1 = '${app_id}'` : ''

  const query = `SELECT
    sum(if(blob3 = 'install', 1, 0)) AS installs,
    sum(if(blob3 = 'fail', 1, 0)) AS fails,
    if(installs + fails > 0, (installs / (installs + fails)) * 100, 0) AS success_rate,
    installs + fails AS total_actions
  FROM version_usage
  WHERE timestamp >= toDateTime('${formatDateCF(start_date)}')
    AND timestamp < toDateTime('${formatDateCF(end_date)}')
    ${appFilter}`

  cloudlog({ requestId: c.get('requestId'), message: 'getAdminSuccessRate query', query })

  try {
    const result = await runQueryToCFA<AdminSuccessRate>(c, query)
    return result[0] || null
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error in getAdminSuccessRate', error: serializeError(e), query })
    return null
  }
}

/**
 * Get platform overview metrics for admin dashboard
 * Returns MAU, active apps, bandwidth, and device platform distribution
 */
export async function getAdminPlatformOverview(
  c: Context,
  start_date: string,
  end_date: string,
  org_id?: string,
): Promise<AdminPlatformOverview | null> {
  try {
    const orgFilter = org_id ? `AND blob2 = '${org_id}'` : ''

    // Query 1: MAU from DEVICE_USAGE
    const mauQuery = `SELECT COUNT(DISTINCT blob1) AS mau
      FROM device_usage
      WHERE timestamp >= toDateTime('${formatDateCF(start_date)}')
        AND timestamp < toDateTime('${formatDateCF(end_date)}')
        ${orgFilter}`

    // Query 2: Active apps from APP_LOG
    const appsQuery = `SELECT COUNT(DISTINCT index1) AS active_apps
      FROM app_log
      WHERE timestamp >= toDateTime('${formatDateCF(start_date)}')
        AND timestamp < toDateTime('${formatDateCF(end_date)}')
        AND blob2 = 'get'`

    // Query 3: Total bandwidth from BANDWIDTH_USAGE
    const bandwidthQuery = `SELECT sum(double1) AS total_bandwidth
      FROM bandwidth_usage
      WHERE timestamp >= toDateTime('${formatDateCF(start_date)}')
        AND timestamp < toDateTime('${formatDateCF(end_date)}')`

    // Query 4: Device platform distribution from DEVICE_INFO
    const platformQuery = `SELECT
        sum(if(double1 = 0, 1, 0)) AS android_devices,
        sum(if(double1 = 1, 1, 0)) AS ios_devices,
        COUNT(DISTINCT blob1) AS total_devices
      FROM device_info
      WHERE timestamp >= toDateTime('${formatDateCF(start_date)}')
        AND timestamp < toDateTime('${formatDateCF(end_date)}')`

    // Query 5: Active organizations count
    const orgsQuery = `SELECT COUNT(DISTINCT blob2) AS active_orgs
      FROM device_usage
      WHERE timestamp >= toDateTime('${formatDateCF(start_date)}')
        AND timestamp < toDateTime('${formatDateCF(end_date)}')
        AND blob2 != ''`

    // Query 6: Success rate from VERSION_USAGE
    const successRateQuery = `SELECT
      sum(if(blob3 = 'install', 1, 0)) AS installs,
      sum(if(blob3 = 'fail', 1, 0)) AS fails
    FROM version_usage
    WHERE timestamp >= toDateTime('${formatDateCF(start_date)}')
      AND timestamp < toDateTime('${formatDateCF(end_date)}')`

    const [mauResult, appsResult, bandwidthResult, platformResult, orgsResult, successResult] = await Promise.all([
      c.env.DEVICE_USAGE ? runQueryToCFA<{ mau: number }>(c, mauQuery) : Promise.resolve([{ mau: 0 }]),
      c.env.APP_LOG ? runQueryToCFA<{ active_apps: number }>(c, appsQuery) : Promise.resolve([{ active_apps: 0 }]),
      c.env.BANDWIDTH_USAGE ? runQueryToCFA<{ total_bandwidth: number }>(c, bandwidthQuery) : Promise.resolve([{ total_bandwidth: 0 }]),
      c.env.DEVICE_INFO ? runQueryToCFA<{ android_devices: number, ios_devices: number, total_devices: number }>(c, platformQuery) : Promise.resolve([{ android_devices: 0, ios_devices: 0, total_devices: 0 }]),
      c.env.DEVICE_USAGE ? runQueryToCFA<{ active_orgs: number }>(c, orgsQuery) : Promise.resolve([{ active_orgs: 0 }]),
      c.env.VERSION_USAGE ? runQueryToCFA<{ installs: number, fails: number }>(c, successRateQuery) : Promise.resolve([{ installs: 0, fails: 0 }]),
    ])

    // Log results for debugging
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Admin platform overview query results',
      mauResult,
      appsResult,
      bandwidthResult,
      platformResult,
      orgsResult,
      successResult,
      start_date,
      end_date,
    })

    // Calculate success rate in JavaScript
    const installs = successResult[0]?.installs || 0
    const fails = successResult[0]?.fails || 0
    const total = installs + fails
    const success_rate = total > 0 ? (installs / total) * 100 : 0

    return {
      mau: mauResult[0]?.mau || 0,
      active_apps: appsResult[0]?.active_apps || 0,
      active_orgs: orgsResult[0]?.active_orgs || 0,
      success_rate,
      total_bandwidth: bandwidthResult[0]?.total_bandwidth || 0,
      android_devices: platformResult[0]?.android_devices || 0,
      ios_devices: platformResult[0]?.ios_devices || 0,
      total_devices: platformResult[0]?.total_devices || 0,
      period_start: start_date,
      period_end: end_date,
    }
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error in getAdminPlatformOverview', error: serializeError(e) })
    return null
  }
}

/**
 * Get per-organization metrics for admin dashboard
 * Returns MAU, bandwidth, and update counts grouped by organization
 */
export async function getAdminOrgMetrics(
  c: Context,
  start_date: string,
  end_date: string,
  limit = 100,
): Promise<AdminOrgMetrics[]> {
  if (!c.env.DEVICE_USAGE)
    return []

  const query = `SELECT
    blob2 AS org_id,
    COUNT(DISTINCT blob1) AS mau,
    COUNT(DISTINCT index1) AS apps_count
  FROM device_usage
  WHERE timestamp >= toDateTime('${formatDateCF(start_date)}')
    AND timestamp < toDateTime('${formatDateCF(end_date)}')
    AND blob2 != ''
  GROUP BY org_id
  ORDER BY mau DESC
  LIMIT ${limit}`

  cloudlog({ requestId: c.get('requestId'), message: 'getAdminOrgMetrics query', query })

  try {
    const orgMau = await runQueryToCFA<{ org_id: string, mau: number, apps_count: number }>(c, query)

    // Get bandwidth per org
    if (c.env.BANDWIDTH_USAGE) {
      const bandwidthQuery = `SELECT
        du.blob2 AS org_id,
        sum(bu.double1) AS bandwidth,
        COUNT(*) AS updates
      FROM bandwidth_usage bu
      LEFT JOIN device_usage du ON bu.blob1 = du.blob1
      WHERE bu.timestamp >= toDateTime('${formatDateCF(start_date)}')
        AND bu.timestamp < toDateTime('${formatDateCF(end_date)}')
        AND du.blob2 != ''
      GROUP BY org_id
      ORDER BY bandwidth DESC
      LIMIT ${limit}`

      const bandwidthResult = await runQueryToCFA<{ org_id: string, bandwidth: number, updates: number }>(c, bandwidthQuery)

      // Merge results
      const bandwidthMap = new Map(bandwidthResult.map(b => [b.org_id, b]))

      return orgMau.map(org => ({
        org_id: org.org_id,
        mau: org.mau,
        apps_count: org.apps_count,
        bandwidth: bandwidthMap.get(org.org_id)?.bandwidth || 0,
        updates: bandwidthMap.get(org.org_id)?.updates || 0,
      }))
    }

    return orgMau.map(org => ({
      org_id: org.org_id,
      mau: org.mau,
      apps_count: org.apps_count,
      bandwidth: 0,
      updates: 0,
    }))
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error in getAdminOrgMetrics', error: serializeError(e), query })
    return []
  }
}

/**
 * Get MAU trend over time for admin dashboard
 * Returns daily unique device counts, optionally filtered by org_id
 */
export async function getAdminMauTrend(
  c: Context,
  start_date: string,
  end_date: string,
  org_id?: string,
): Promise<AdminMauTrend[]> {
  if (!c.env.DEVICE_USAGE)
    return []

  const orgFilter = org_id ? `AND blob2 = '${org_id}'` : ''

  const query = `SELECT
    formatDateTime(toStartOfInterval(timestamp, INTERVAL '1' DAY), '%Y-%m-%d') AS date,
    COUNT(DISTINCT blob1) AS mau
  FROM device_usage
  WHERE timestamp >= toDateTime('${formatDateCF(start_date)}')
    AND timestamp < toDateTime('${formatDateCF(end_date)}')
    ${orgFilter}
  GROUP BY date
  ORDER BY date ASC`

  cloudlog({ requestId: c.get('requestId'), message: 'getAdminMauTrend query', query })

  try {
    const result = await runQueryToCFA<AdminMauTrend>(c, query)
    return result
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error in getAdminMauTrend', error: serializeError(e), query })
    return []
  }
}

/**
 * Get success rate trend over time for admin dashboard
 * Returns daily install vs fail counts with calculated success rate
 */
export async function getAdminSuccessRateTrend(
  c: Context,
  start_date: string,
  end_date: string,
  app_id?: string,
): Promise<AdminSuccessRateTrend[]> {
  if (!c.env.VERSION_USAGE)
    return []

  const appFilter = app_id ? `AND blob1 = '${app_id}'` : ''

  const query = `SELECT
    formatDateTime(toStartOfInterval(timestamp, INTERVAL '1' DAY), '%Y-%m-%d') AS date,
    sum(if(blob3 = 'install', 1, 0)) AS installs,
    sum(if(blob3 = 'fail', 1, 0)) AS fails
  FROM version_usage
  WHERE timestamp >= toDateTime('${formatDateCF(start_date)}')
    AND timestamp < toDateTime('${formatDateCF(end_date)}')
    ${appFilter}
  GROUP BY date
  ORDER BY date ASC`

  cloudlog({ requestId: c.get('requestId'), message: 'getAdminSuccessRateTrend query', query })

  try {
    const rawResult = await runQueryToCFA<{ date: string, installs: number, fails: number }>(c, query)
    // Calculate success_rate in JavaScript for each day
    const result: AdminSuccessRateTrend[] = rawResult.map(row => ({
      date: row.date,
      installs: row.installs,
      fails: row.fails,
      success_rate: (row.installs + row.fails) > 0 ? (row.installs / (row.installs + row.fails)) * 100 : 0,
    }))
    return result
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error in getAdminSuccessRateTrend', error: serializeError(e), query })
    return []
  }
}

/**
 * Get app activity trend over time (active apps per day)
 * Queries APP_LOG to count distinct apps with activity
 */
export async function getAdminAppsTrend(
  c: Context,
  start_date: string,
  end_date: string,
): Promise<AdminAppsTrend[]> {
  if (!c.env.APP_LOG)
    return []

  const query = `SELECT
    formatDateTime(toStartOfInterval(timestamp, INTERVAL '1' DAY), '%Y-%m-%d') AS date,
    COUNT(DISTINCT index1) AS apps_created
  FROM app_log
  WHERE timestamp >= toDateTime('${formatDateCF(start_date)}')
    AND timestamp < toDateTime('${formatDateCF(end_date)}')
  GROUP BY date
  ORDER BY date ASC`

  cloudlog({ requestId: c.get('requestId'), message: 'getAdminAppsTrend query', query })

  try {
    const result = await runQueryToCFA<AdminAppsTrend>(c, query)
    return result
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error in getAdminAppsTrend', error: serializeError(e), query })
    return []
  }
}

/**
 * Get bundle uploads trend over time (unique versions uploaded per day)
 * Queries VERSION_USAGE to count distinct version uploads
 */
export async function getAdminBundlesTrend(
  c: Context,
  start_date: string,
  end_date: string,
): Promise<AdminBundlesTrend[]> {
  if (!c.env.VERSION_USAGE)
    return []

  const query = `SELECT
    formatDateTime(toStartOfInterval(timestamp, INTERVAL '1' DAY), '%Y-%m-%d') AS date,
    COUNT(DISTINCT blob2) AS bundles_created
  FROM version_usage
  WHERE timestamp >= toDateTime('${formatDateCF(start_date)}')
    AND timestamp < toDateTime('${formatDateCF(end_date)}')
  GROUP BY date
  ORDER BY date ASC`

  cloudlog({ requestId: c.get('requestId'), message: 'getAdminBundlesTrend query', query })

  try {
    const result = await runQueryToCFA<AdminBundlesTrend>(c, query)
    return result
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error in getAdminBundlesTrend', error: serializeError(e), query })
    return []
  }
}

/**
 * Get deployments trend over time (channel_devices updates)
 * Queries APP_LOG for deployment events
 */
export async function getAdminDeploymentsTrend(
  c: Context,
  start_date: string,
  end_date: string,
  app_id?: string,
): Promise<AdminDeploymentsTrend[]> {
  try {
    const pgClient = getPgClient(c, true) // Read-only query
    const drizzleClient = getDrizzleClient(pgClient)

    // Query channel_devices table from Postgres (deployments are stored in Supabase, not Cloudflare)
    const appFilter = app_id ? sql`AND app_id = ${app_id}` : sql``

    const query = sql`
      SELECT
        DATE(created_at) AS date,
        COUNT(*)::int AS deployments
      FROM channel_devices
      WHERE created_at >= ${start_date}::timestamp
        AND created_at < ${end_date}::timestamp
        ${appFilter}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `

    cloudlog({ requestId: c.get('requestId'), message: 'getAdminDeploymentsTrend query', start_date, end_date, app_id })

    const result = await drizzleClient.execute(query)

    const data: AdminDeploymentsTrend[] = result.rows.map((row: any) => ({
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date,
      deployments: Number(row.deployments),
    }))

    cloudlog({ requestId: c.get('requestId'), message: 'getAdminDeploymentsTrend result', resultCount: data.length })

    return data
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error in getAdminDeploymentsTrend', error: serializeError(e) })
    return []
  }
}
