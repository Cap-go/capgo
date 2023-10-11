import type { Database } from './supabase.types.ts'
import { getEnv } from './utils.ts'

export function isClickHouseEnabled() {
  return !!clickHouseURl() && clickHouseUser() && clickHousePassword()
}
function clickHouseURl() {
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
  // https://gui1899riv.eu-central-1.aws.clickhouse.cloud:8443

  const devicesReady = devices.map(device => ({
    ...device,
    // remove created_at and updated_at presicion ms use only seconds
    created_at: !device.created_at ? new Date() : device.created_at,
  }))
  console.log('sending device to tinybird', devicesReady)
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
    .then(res => res.json())
    .then(data => console.log(data))
}

export function sendLogToClickHouse(logs: Database['public']['Tables']['stats']['Insert'][]) {
  if (!isClickHouseEnabled())
    return Promise.resolve()

  // make log a string with a newline between each log
  return fetch(
    'https://api.tinybird.co/v0/events?name=stats',
    {
      method: 'POST',
      // add created_at: new Date().toISOString() to each log
      body: log.map(l => ({
        ...l,
        created_at: !l.created_at ? new Date() : l.created_at,
      })).map(l => JSON.stringify(l)).join('\n'),
      headers: { Authorization: `Bearer ${getEnv('CLICKHOUSE_TOKEN_INGEST_LOG')}` },
    },
  )
    .then(res => res.json())
    .then(data => console.log(data))
}
