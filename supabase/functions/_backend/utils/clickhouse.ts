import dayjs from 'dayjs'
import ky from 'ky'
import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import { getEnv } from './utils.ts'
import { getAppsFromSupabase } from './supabase.ts'
import { createStatsDevices, createStatsLogs } from './stats.ts'

export type DeviceWithoutCreatedAt = Omit<Database['public']['Tables']['devices']['Insert'], 'created_at'>

export function isClickHouseEnabled(c: Context) {
  // console.log(!!clickHouseURL(), !!clickHouseUser(), !!clickHousePassword())
  return !!clickHouseURL(c)
  // return false
}
function clickHouseURL(c: Context) {
  return getEnv(c, 'CLICKHOUSE_URL')
}
function clickHouseUser(c: Context) {
  return getEnv(c, 'CLICKHOUSE_USER')
}
function clickHousePassword(c: Context) {
  return getEnv(c, 'CLICKHOUSE_PASSWORD')
}
function clickHouseAuth(c: Context) {
  return `Basic ${btoa(`${clickHouseUser(c)}:${clickHousePassword(c)}`)}`
}
function clickhouseAuthEnabled(c: Context) {
  return !!clickHouseUser(c) && !!clickHousePassword(c)
}

export function formatDateCH(date: string | undefined) {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss.000')
}

function getHeaders(c: Context) {
  return clickhouseAuthEnabled(c)
    ? {
        'Authorization': clickHouseAuth(c),
        'Content-Type': 'text/plain',
      }
    : { 'Content-Type': 'text/plain' }
}

// Function to create the query string for each table
function createInsertQuery(tableName: string) {
  return `INSERT INTO ${tableName} SETTINGS async_insert=1, wait_for_async_insert=0 FORMAT JSONEachRow`
}

async function sendClickHouse(c: Context, body: string, table: string) {
  if (!isClickHouseEnabled(c))
    return Promise.resolve()
  try {
    console.log('sending to Clickhouse body', table, body)
    const searchParams = {
      query: createInsertQuery(table),
      http_write_exception_in_output_format: 1,
    }
    console.log('sending to Clickhouse searchParams', searchParams)
    const response = await ky.post(clickHouseURL(c), {
      body,
      searchParams,
      headers: getHeaders(c),
    })
      .then(res => res.text())
    console.log('sendClickHouse ok', response)
    return response
  }
  catch (e) {
    console.log('sendClickHouse error', e)
    if (e.name === 'HTTPError') {
      const errorJson = await e.response.json()
      console.log('sendClickHouse errorJson', errorJson)
    }
    return e
  }
}

export function convertAllDatesToCH(obj: any) {
  // look in all objects for dates fields ( created_at or updated_at ) and convert them if need
  const datesFields = ['created_at', 'updated_at']
  const newObj = { ...obj }
  datesFields.forEach((field) => {
    if (newObj[field])
      newObj[field] = formatDateCH(newObj[field])
  })
  return newObj
}

export function sendDeviceToClickHouse(c: Context, devices: Database['public']['Tables']['devices']['Update'][]) {
  if (!isClickHouseEnabled(c))
    return Promise.resolve()

  // make log a string with a newline between each logdated_at: !device.updated_at ? new Date() : device.updated_at,

  // remove date_id from devices
  const devicesReady = devices.map(device => ({
    ...device,
    date_id: undefined,
    created_at: undefined,
    last_mau: undefined,
    updated_at: new Date(),
  }))
    .map(convertAllDatesToCH)
    .map(l => JSON.stringify(l)).join('\n')
  console.log('sending device to Clickhouse', devicesReady)
  return sendClickHouse(c, devicesReady, 'devices')
}

export interface AppActivity {
  app_id: string
  first_log_date: string // or Date if you prefer to work with Date objects
  mau: number // The JSON has "mau" as a string, but the meta indicates it's a UInt64, so it should be a number
  bandwidth: number
  storage_added: number
  storage_deleted: number
}

interface MetaInfo {
  name: string
  type: string
}

interface Statistics {
  bytes_read: number
  elapsed: number
  rows_read: number
}

interface ApiActivityResponse {
  data: AppActivity[]
  meta: MetaInfo[]
  rows: number
  statistics: Statistics
}

interface ApiResponse {
  data: any[]
  meta: MetaInfo[]
  rows: number
  statistics: Statistics
}

export interface AppActives {
  app_id: string
}

export interface ApiActiveAppsResponse {
  data: AppActives[]
  meta: MetaInfo[]
  rows: number
  statistics?: Statistics
}

function mauQuery(startDate: string, endDate: string, apps: string[]) {
  const startDateFormatted = new Date(startDate).toISOString().split('T')[0]
  const endDateFormatted = new Date(endDate).toISOString().split('T')[0]
  const appsFormatted = apps.map(app => `'${app}'`).join(',')
  console.log('mauQuery', startDateFormatted, endDateFormatted, appsFormatted)
  return `WITH 
  '${startDateFormatted}' AS start_period,
  '${endDateFormatted}' AS end_period,
  [${appsFormatted}] AS app_id_list
SELECT 
  first_device_logs.app_id as app_id,
  first_device_logs.first_log_date AS date,
  COUNT(DISTINCT first_device_logs.device_id) as mau,
  0 AS bandwidth,
  SUM(COALESCE(logs_daily.get, 0)) AS get,
  SUM(COALESCE(logs_daily.fail, 0)) AS fail,
  SUM(COALESCE(logs_daily.install, 0)) AS install,
  SUM(COALESCE(logs_daily.uninstall, 0)) AS uninstall,
  MAX(app_storage_daily.storage_added) AS storage_added,
  MAX(app_storage_daily.storage_deleted) AS storage_deleted
FROM 
  (SELECT 
      daily_device.app_id,
      daily_device.device_id,
      MIN(daily_device.date) as first_log_date
  FROM daily_device
  WHERE 
      daily_device.date >= start_period AND 
      daily_device.date < end_period AND
      daily_device.app_id IN app_id_list
  GROUP BY daily_device.app_id, daily_device.device_id) as first_device_logs
LEFT JOIN logs_daily ON first_device_logs.app_id = logs_daily.app_id AND first_device_logs.first_log_date = logs_daily.date
LEFT JOIN app_storage_daily ON first_device_logs.app_id = app_storage_daily.app_id AND first_device_logs.first_log_date = app_storage_daily.date
GROUP BY 
  first_device_logs.app_id, 
  first_device_logs.first_log_date
ORDER BY 
  first_device_logs.app_id, 
  first_device_logs.first_log_date FORMAT JSON`
}

function convertDataWithMeta(data: any[], meta: MetaInfo[]) {
  return data.map((d) => {
    const newObj: any = {}
    Object.entries(d)
      .forEach(([key, value]) => {
        const index = meta.findIndex(m => m.name === key)
        if (meta[index].type === 'UInt64' || meta[index].type === 'Int64' || meta[index].type === 'Int32' || meta[index].type === 'UInt32')
          newObj[key] = Number.parseInt(value as string)
        else
          newObj[key] = value
      })
    return newObj
  })
}

async function executeClickHouseQuery(c: Context, query: string, params: Record<string, any> = {}): Promise<ApiResponse> {
  if (!isClickHouseEnabled(c))
    return Promise.reject(new Error('Disabled clickhouse'))
  console.log('Sending to ClickHouse body', query)

  const searchParams = new URLSearchParams()
  searchParams.append('query', query)
  searchParams.append('http_write_exception_in_output_format', '1')

  Object.entries(params).forEach(([key, value]) => {
    searchParams.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value))
  })

  console.log('Sending to ClickHouse searchParams', searchParams)

  try {
    const response = await ky.post(clickHouseURL(c), {
      searchParams,
      headers: getHeaders(c),
    }).json<ApiResponse>()

    console.log('Query executed successfully', response)
    response.data = convertDataWithMeta(response.data, response.meta)
    return response
  }
  catch (error) {
    console.error('Error executing ClickHouse query', error)

    if (error.name === 'HTTPError') {
      const errorJson = await error.response.json()
      console.error('Error details', errorJson)
    }

    // Return a default response in case of an error
    return {
      data: [],
      meta: [],
      rows: 0,
      statistics: {
        bytes_read: 0,
        elapsed: 0,
        rows_read: 0,
      },
    }
  }
}

export async function getAppsToProcess(c: Context, flag: 'to_get_framework' | 'to_get_info' | 'to_get_similar', limit: number) {
  if (!isClickHouseEnabled(c))
    return Promise.reject(new Error('Disabled clickhouse'))
  const query = `
    SELECT *
    FROM store_apps
    WHERE ${flag} = 1
    ORDER BY created_at ASC
    LIMIT {param_limit:UInt64}
  `

  const params = prefixParams({ limit })

  const result = await executeClickHouseQuery(c, query, params)
  return result.data
}

export async function getTopApps(c: Context, mode: string, limit: number) {
  if (!isClickHouseEnabled(c))
    return Promise.reject(new Error('Disabled clickhouse'))
  const query = `
    SELECT url, title, icon, summary, installs, category
    FROM store_apps
    WHERE 1=1
      ${mode === 'cordova' ? 'AND cordova = 1 AND capacitor = 0' : ''}
      ${mode === 'flutter' ? 'AND flutter = 1' : ''}
      ${mode === 'reactNative' ? 'AND react_native = 1' : ''}
      ${mode === 'nativeScript' ? 'AND native_script = 1' : ''}
      ${mode === 'capgo' ? 'AND capgo = 1' : ''}
      ${mode !== 'cordova' && mode !== 'flutter' && mode !== 'reactNative' && mode !== 'nativeScript' && mode !== 'capgo' ? 'AND capacitor = 1' : ''}
    ORDER BY installs DESC
    LIMIT {param_limit:UInt64}
  `

  const params = prefixParams({ limit })

  const result = await executeClickHouseQuery(c, query, params)
  return result.data
}

export async function getTotalAppsByMode(c: Context, mode: string) {
  if (!isClickHouseEnabled(c))
    return Promise.reject(new Error('Disabled clickhouse'))
  const query = `
    SELECT COUNT(*) AS total
    FROM store_apps
    WHERE 1=1
      ${mode === 'cordova' ? 'AND cordova = 1 AND capacitor = 0' : ''}
      ${mode === 'flutter' ? 'AND flutter = 1' : ''}
      ${mode === 'reactNative' ? 'AND react_native = 1' : ''}
      ${mode === 'nativeScript' ? 'AND native_script = 1' : ''}
      ${mode === 'capgo' ? 'AND capgo = 1' : ''}
      ${mode !== 'cordova' && mode !== 'flutter' && mode !== 'reactNative' && mode !== 'nativeScript' && mode !== 'capgo' ? 'AND capacitor = 1' : ''}
  `

  const result = await executeClickHouseQuery(c, query)
  return result.data[0].total
}

export async function getStoreAppById(c: Context, appId: string) {
  if (!isClickHouseEnabled(c))
    return Promise.reject(new Error('Disabled clickhouse'))
  const query = `
    SELECT *
    FROM store_apps
    WHERE app_id = {param_app_id:String}
    LIMIT 1
  `

  const params = prefixParams({ app_id: appId })

  const result = await executeClickHouseQuery(c, query, params)
  return result.data[0]
}

function prefixParams(params: Record<string, any>): Record<string, any> {
  const prefixedParams: Record<string, any> = {}
  for (const [key, value] of Object.entries(params))
    prefixedParams[`param_${key}`] = value

  return prefixedParams
}

export async function saveStoreInfo(c: Context, app: Database['public']['Tables']['store_apps']['Insert']) {
  if (!isClickHouseEnabled(c))
    return Promise.resolve()
  // Save a single app in ClickHouse
  const columns: (keyof Database['public']['Tables']['store_apps']['Insert'])[] = Object.keys({ updates: 0, ...app }) as (keyof Database['public']['Tables']['store_apps']['Insert'])[]
  const values = columns.map((column) => {
    const value = app[column]
    if (column === 'updates')
      return `sumState(${value})`
    else
      return `'${value}'`
  }).join(', ')

  const query = `
    INSERT INTO store_apps (${columns.join(', ')})
    VALUES (${values})
    SETTINGS async_insert=1, wait_for_async_insert=0
  `

  try {
    await executeClickHouseQuery(c, query)
    console.log('saveStoreInfo success')
  }
  catch (error) {
    console.error('saveStoreInfo error', error)
    throw error
  }
}

export async function bulkUpdateStoreApps(apps: (Database['public']['Tables']['store_apps']['Insert'])[]) {
  if (!isClickHouseEnabled(c))
    return Promise.resolve()
  // Update a list of apps in ClickHouse (internal use only)
  if (!apps.length)
    return

  const noDup = apps.filter((value, index, self) => index === self.findIndex(t => (t.app_id === value.app_id)))
  console.log('bulkUpdateStoreApps', noDup.length)

  const columns = Object.keys(noDup[0])
  const values = noDup.map((app) => {
    const convertedApp = convertAllDatesToCH({ updates: 0, ...app })
    return `(${columns.map((column) => {
      const value = convertedApp[column]
      if (column === 'updates')
        return `sumState(${value})`
      else
        return `'${value}'`
    }).join(', ')})`
  }).join(', ')

  const query = `
    INSERT INTO store_apps (${columns.join(', ')})
    VALUES ${values}
    SETTINGS async_insert=1, wait_for_async_insert=0
  `

  try {
    await executeClickHouseQuery(c, query)
    console.log('bulkUpdateStoreApps success')
  }
  catch (error) {
    console.error('bulkUpdateStoreApps error', error)
  }
}

export async function updateInClickHouse(c: Context, appId: string, updates: number) {
  if (!isClickHouseEnabled(c))
    return Promise.resolve()
  if (!isClickHouseEnabled(c))
    return Promise.resolve()

  const query = `
    INSERT INTO store_apps (app_id, updates)
    SELECT {app_id:String}, sumState({updates:UInt64})
    WHERE app_id = {app_id:String}
    SETTINGS async_insert=1, wait_for_async_insert=0
  `

  const params = prefixParams({
    updates,
    app_id: appId,
  })

  await executeClickHouseQuery(c, query, params)
}

async function countUpdatesFromClickHouse(c: Context): Promise<number> {
  if (!isClickHouseEnabled(c))
    return Promise.resolve(0)
  const query = `
    SELECT SUM(updates) + SUM(installs) AS count
    FROM store_apps
    WHERE onprem = 1 OR capgo = 1
  `

  try {
    const response = await executeClickHouseQuery(c, query)
    return response.data[0].count || 0
  }
  catch (error) {
    console.error('Error counting updates from ClickHouse', error)
    return 0
  }
}

async function countUpdatesFromLogs(c: Context): Promise<number> {
  if (!isClickHouseEnabled(c))
    return Promise.resolve(0)
  const query = `
    SELECT COUNT(*) AS count
    FROM logs
    WHERE action = 'set'
  `

  try {
    const response = await executeClickHouseQuery(c, query)
    return response.data[0].count || 0
  }
  catch (error) {
    console.error('Error counting updates from logs', error)
    return 0
  }
}

async function getAppsFromClickHouse(c: Context): Promise<string[]> {
  if (!isClickHouseEnabled(c))
    return []
  const query = `
    SELECT DISTINCT app_id
    FROM store_apps
    WHERE (onprem = 1 OR capgo = 1) AND url != ''
  `

  try {
    const response = await executeClickHouseQuery(c, query)
    return response.data.map(row => row.app_id)
  }
  catch (error) {
    console.error('Error getting apps from ClickHouse', error)
    return []
  }
}

export async function countAllApps(c: Context): Promise<number> {
  const [clickHouseApps, supabaseApps] = await Promise.all([
    getAppsFromClickHouse(c),
    getAppsFromSupabase(c),
  ])

  const allApps = [...new Set([...clickHouseApps, ...supabaseApps])]
  return allApps.length
}

export async function countAllUpdates(c: Context): Promise<number> {
  const [storeAppsCount, logsCount] = await Promise.all([
    countUpdatesFromClickHouse(c),
    countUpdatesFromLogs(c),
  ])

  return storeAppsCount + logsCount
}

export async function reactActiveApps(c: Context) {
  const query = `SELECT DISTINCT app_id
  FROM logs
  WHERE created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)
    AND created_at < CURRENT_DATE() and action = 'get' FORMAT JSON`
  console.log('sending to Clickhouse body', query)
  const searchParams = {
    query,
    http_write_exception_in_output_format: 1,
  }
  console.log('sending to Clickhouse searchParams', searchParams)
  try {
    const response = await ky.post(clickHouseURL(c), {
      searchParams,
      headers: getHeaders(c),
    })
      .then(res => res.json<ApiActiveAppsResponse>())
    console.log('reactActiveApps ok', response)
    response.data = convertDataWithMeta(response.data, response.meta)
    console.log('reactActiveApps ok type', response)
    return response
  }
  catch (e) {
    console.log('reactActiveApps error', e)
    if (e.name === 'HTTPError') {
      const errorJson = await e.response.json()
      console.log('reactActiveApps errorJson', errorJson)
    }
    return { data: [], meta: [], rows: 0, statistics:
      {
        bytes_read: 0,
        elapsed: 0,
        rows_read: 0,
      } } as ApiActiveAppsResponse
  }
}

interface ApiCountResponse {
  data: { count: number }[]
  meta: any[]
  rows: number
  statistics: {
    bytes_read: number
    elapsed: number
    rows_read: number
  }
}

export async function countFromClickHouse(c: Context, table: string, appId: string) {
  const query = `
  SELECT COUNT(*) as count
  FROM ${table}
  WHERE app_id = {app_id:String}
  FORMAT JSON
  `
  const params: Record<string, any> = {
    param_app_id: appId,
  }
  console.log('sending to Clickhouse body', query)
  const searchParams = new URLSearchParams()
  searchParams.append('query', query)
  searchParams.append('http_write_exception_in_output_format', '1')
  Object.entries(params).forEach(([key, value]) => {
    searchParams.append(key, Array.isArray(value) ? JSON.stringify(value) : value)
  })
  console.log('sending to Clickhouse searchParams', searchParams)
  try {
    const response = await ky.post(clickHouseURL(c), {
      searchParams,
      headers: getHeaders(c),
    })
      .then(res => res.json<ApiCountResponse>())
    console.log('countFromClickHouse ok', response)
    response.data = convertDataWithMeta(response.data, response.meta)
    console.log('countFromClickHouse ok type', response)
    return response.data[0].count
  }
  catch (e) {
    console.log('countFromClickHouse error', e)
    if (e.name === 'HTTPError') {
      const errorJson = await e.response.json()
      console.log('countFromClickHouse errorJson', errorJson)
    }
    return 0
  }
}

export async function readMauFromClickHouse(c: Context, startDate: string, endDate: string, apps: string[]) {
  if (!isClickHouseEnabled(c))
    return { data: null, meta: null, rows: 0, statistics: null }
  try {
    const query = mauQuery(startDate, endDate, apps)
    console.log('sending to Clickhouse body', query)
    const searchParams = {
      query,
      http_write_exception_in_output_format: 1,
    }
    console.log('sending to Clickhouse searchParams', searchParams)
    const response = await ky.post(clickHouseURL(c), {
      searchParams,
      headers: getHeaders(c),
    })
      .then(res => res.json<ApiActivityResponse>())
    console.log('readMauFromClickHouse ok', response)
    response.data = convertDataWithMeta(response.data, response.meta)
    console.log('readMauFromClickHouse ok type', response)
    return response
  }
  catch (e) {
    console.log('readMauFromClickHouse error', e)
    if (e.name === 'HTTPError') {
      const errorJson = await e.response.json()
      console.log('readMauFromClickHouse errorJson', errorJson)
    }
    return { data: null, meta: null, rows: 0, statistics: null }
  }
}

interface ClickHouseMeta {
  id: number
  app_id: string
  created_at: string
  size: number
  action: 'add' | 'delete'
}
export function sendMetaToClickHouse(c: Context, meta: ClickHouseMeta[]) {
  if (!isClickHouseEnabled(c))
    return Promise.resolve()

  console.log('sending meta to Clickhouse', meta)
  const metasReady = meta
    .map(convertAllDatesToCH)
    .map(l => JSON.stringify(l)).join('\n')

  return sendClickHouse(c, metasReady, 'app_versions_meta')
}

export interface StatsActions {
  action: string
  versionId?: number
}

export function sendStatsAndDevice(c: Context, device: DeviceWithoutCreatedAt, statsActions: StatsActions[]) {
  // Prepare the device data for insertion
  const deviceData = convertAllDatesToCH({ ...device, updated_at: new Date().toISOString() })
  const deviceReady = JSON.stringify(deviceData)

  // Prepare the stats data for insertion
  const statsData = statsActions.map(({ action, versionId }) => {
    const stat: Database['public']['Tables']['stats']['Insert'] = {
      created_at: new Date().toISOString(),
      device_id: device.device_id,
      action,
      app_id: device.app_id,
      version_build: device.version_build ?? '',
      version: versionId || device.version, // Use the provided versionId if available
      platform: device.platform ?? 'android',
    }
    createStatsLogs(c, stat.app_id, stat.device_id, stat.action, stat.version)
    return JSON.stringify(convertAllDatesToCH(stat))
  }).join('\n')

  // Prepare the daily_device data for insertion
  const dailyDeviceReady = JSON.stringify({
    device_id: device.device_id,
    app_id: device.app_id,
    date: formatDateCH(new Date().toISOString()).split(' ')[0], // Extract the date part only
  })
  createStatsDevices(c, device.app_id, device.device_id, device.version, device.platform ?? '', device.plugin_version ?? '', device.os_version ?? '', device.version_build ?? '', device.custom_id ?? '', device.is_prod ?? true, device.is_emulator ?? false)

  if (!isClickHouseEnabled(c))
    return Promise.resolve()
  const jobs = Promise.all([
    sendClickHouse(c, deviceReady, 'devices'),
    sendClickHouse(c, statsData, 'logs'),
    sendClickHouse(c, dailyDeviceReady, 'daily_device'),
  ]).catch((error) => {
    console.log(`[sendStatsAndDevice] rejected with error: ${error}`)
  })
  if (c.executionCtx.waitUntil)
    return c.executionCtx.waitUntil(jobs)

  return jobs
}
