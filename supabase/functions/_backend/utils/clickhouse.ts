import dayjs from 'dayjs'
import ky from 'ky'
import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import { getEnv } from './utils.ts'

export type DeviceWithoutCreatedAt = Omit<Database['public']['Tables']['devices']['Insert'], 'created_at'>

export function isClickHouseEnabled(c: Context) {
  // console.log(!!clickHouseURL(), !!clickHouseUser(), !!clickHousePassword())
  return !!clickHouseURL(c)
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

interface ApiResponse {
  data: AppActivity[]
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
  SUM(logs_daily.bandwidth) AS bandwidth,
  SUM(COALESCE(logs_daily.get, 0)) AS get,
  SUM(COALESCE(logs_daily.fail, 0)) AS fail,
  SUM(COALESCE(logs_daily.install, 0)) AS install,
  SUM(COALESCE(logs_daily.uninstall, 0)) AS uninstall,
  SUM(app_storage_daily.storage_added) AS storage_added,
  SUM(app_storage_daily.storage_deleted) AS storage_deleted
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
          newObj[key] = Number.parseInt(value)
        else
          newObj[key] = value
      })
    return newObj
  })
}

export async function reactActiveApps(c: Context) {
  const query = `SELECT DISTINCT app_id
  FROM logs
  WHERE created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)
    AND created_at < CURRENT_DATE() FORMAT JSON`
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
  } catch (e) {
    console.log('reactActiveApps error', e)
    if (e.name === 'HTTPError') {
      const errorJson = await e.response.json()
      console.log('reactActiveApps errorJson', errorJson)
    }
    return { data: [], meta: [], rows: 0, statistics: 
      {   
        bytes_read: 0,
        elapsed: 0,
        rows_read: 0 
    } 
    } as ApiActiveAppsResponse
  }
}

export async function readMauFromClickHouse(c: Context, startDate: string, endDate: string, apps: string[]) {
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
      .then(res => res.json<ApiResponse>())
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
  if (!isClickHouseEnabled(c))
    return Promise.resolve()

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
      version_build: device.version_build,
      version: versionId || device.version, // Use the provided versionId if available
      platform: device.platform,
    }
    return JSON.stringify(convertAllDatesToCH(stat))
  }).join('\n')

  // Prepare the daily_device data for insertion
  const dailyDeviceReady = JSON.stringify({
    device_id: device.device_id,
    app_id: device.app_id,
    date: formatDateCH(new Date().toISOString()).split(' ')[0], // Extract the date part only
  })
  return Promise.all([
    sendClickHouse(c, deviceReady, 'devices'),
    sendClickHouse(c, statsData, 'logs'),
    sendClickHouse(c, dailyDeviceReady, 'daily_device'),
  ]).catch((error) => {
    console.log(`[sendStatsAndDevice] rejected with error: ${error}`)
  })
}
