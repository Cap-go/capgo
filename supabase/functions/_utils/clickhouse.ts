import type { Database } from './supabase.types.ts'
import { getEnv } from './utils.ts'

export function isClickHouseEnabled() {
  return !!clickHouseURL() && clickHouseUser() && clickHousePassword()
}
function clickHouseURL() {
  return getEnv('CLICKHOUSE_URL')
}
function clickHouseUser() {
  return getEnv('CLICKHOUSE_USER')
}
function clickHousePassword() {
  return getEnv('CLICKHOUSE_PASSWORD')
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
    `${clickHouseURL()}/?async_insert=1&query=INSERT INTO devices FORMAT JSONEachRow`,
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
    `${clickHouseURL()}/?async_insert=1&query=INSERT INTO logs FORMAT JSONEachRow`,
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
