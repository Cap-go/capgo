import type { Database } from './supabase.types.ts'
import { getEnv } from './utils.ts'

export function isClickHouseEnabled() {
  return !!clickHouseURl() && clickHouseUser() && clickHousePassword()
}
function clickHouseURl() {
  return getEnv('CLICKHOUSE_URL') || 'https://gui1899riv.eu-central-1.aws.clickhouse.cloud:8443'
}
function clickHouseUser() {
  return getEnv('CLICKHOUSE_USER') || 'default'
}
function clickHousePassword() {
  return getEnv('CLICKHOUSE_PASSWORD') || '6FDfroNAL_llY'
}
function clickHouseAuth() {
  return `Basic ${btoa(`${clickHouseUser()}:${clickHousePassword()}`)}`
}

export function sendDeviceToClickHouse(devices: Database['public']['Tables']['devices']['Update'][]) {
  if (!isClickHouseEnabled())
    return Promise.resolve()

  // make log a string with a newline between each logdated_at: !device.updated_at ? new Date() : device.updated_at,

  // remove date_id from devices
  const devicesReady = devices.map(device => ({
    ...device,
    date_id: undefined,
    last_mau: !device.last_mau ? new Date(0).toISOString() : device.last_mau,
    // remove created_at and updated_at presicion ms use only seconds
    created_at: !device.created_at ? new Date().toISOString() : device.created_at,
  })).map(l => JSON.stringify(l)).join('\n')
  console.log('sending device to Clickhouse', devicesReady)
  return fetch(
    `${clickHouseURl()}/?query=INSERT INTO devices FORMAT JSONEachRow`,
    {
      method: 'POST',
      body: devicesReady,
      headers: {
        'Authorization': clickHouseAuth(),
        'Content-Type': 'text/plain',
      },
    },
  )
    .then(res => res.text())
    .then(data => console.log('sendDeviceToClickHouse', data))
    .catch(e => console.log('sendDeviceToClickHouse error', e))
}

export function sendLogToClickHouse(logs: Database['public']['Tables']['stats']['Insert'][]) {
  if (!isClickHouseEnabled())
    return Promise.resolve()

  // make log a string with a newline between each log
  const logReady = logs.map(l => ({
    ...l,
    // remove created_at and updated_at presicion ms use only seconds
    created_at: !l.created_at ? new Date().toISOString() : l.created_at,
  })).map(l => JSON.stringify(l)).join('\n')
  console.log('sending log to Clickhouse', logReady)
  return fetch(
    `${clickHouseURl()}/?query=INSERT INTO logs FORMAT JSONEachRow`,
    {
      method: 'POST',
      // add created_at: new Date().toISOString() to each log
      body: logReady,
      headers: {
        'Authorization': clickHouseAuth(),
        'Content-Type': 'text/plain',
      },
    },
  )
    .then(res => res.text())
    .then(data => console.log('sendLogToClickHouse', data))
    .catch(e => console.log('sendLogToClickHouse error', e))
}

// app_id?: string
// created_at?: string | null
// custom_id?: string
// date_id?: string | null
// device_id?: string
// is_emulator?: boolean | null
// is_prod?: boolean | null
// last_mau?: string | null
// os_version?: string | null
// platform?: Database["public"]["Enums"]["platform_os"] | null
// plugin_version?: string
// updated_at?: string | null
// version?: number
// version_build?: string | null
// sendDeviceToClickHouse([{
//   app_id: '1',
//   created_at: new Date().toISOString(),
//   custom_id: '',
//   date_id: '1',
//   device_id: '1',
//   is_emulator: false,
//   is_prod: true,
//   last_mau: new Date(0).toISOString(),
//   os_version: '',
//   platform: 'android',
//   plugin_version: '1',
//   updated_at: new Date().toISOString(),
//   version: 1,
//   version_build: '1',
// }])

// action: string
// app_id: string
// created_at?: string | null
// device_id: string
// platform: Database["public"]["Enums"]["platform_os"]
// version: number
// version_build: string
// sendLogToClickHouse([{
//   action: 'set',
//   app_id: '1',
//   created_at: new Date().toISOString(),
//   device_id: '1',
//   platform: 'android',
//   version: 1,
//   version_build: '1',
// }])
