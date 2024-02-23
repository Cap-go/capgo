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
    console.log('sending to Clickhouse body', body)
    const searchParams = {
      query: createInsertQuery(table),
      http_write_exception_in_output_format: 1,
    }
    console.log('sending to Clickhouse searchParams', searchParams)
    const response = await ky.post(clickHouseURL(c), {
      credentials: undefined,
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
  ])
}
