import type { Database } from './supabase.types.ts'
import { getEnv } from './utils.ts'
import { convertAllDatesToCH } from '../../../src/services/date.ts';

export function isClickHouseEnabled() {
  // console.log(!!clickHouseURL(), !!clickHouseUser(), !!clickHousePassword())
  return !!clickHouseURL()
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
function clickhouseAuthEnabled() {
  return !!clickHouseUser() && !!clickHousePassword()
}

export function sendDeviceToClickHouse(devices: Database['public']['Tables']['devices']['Update'][]) {
  if (!isClickHouseEnabled())
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
  // http://127.0.0.1:8123/?query=INSERT INTO devices SETTINGS async_insert=1, wait_for_async_insert=0 FORMAT JSONEachRow
  return fetch(
    `${clickHouseURL()}/?query=INSERT INTO devices SETTINGS async_insert=1, wait_for_async_insert=0 FORMAT JSONEachRow`,
    {
      method: 'POST',
      body: devicesReady,
      headers: clickhouseAuthEnabled()
        ? {
            'Authorization': clickHouseAuth(),
            'Content-Type': 'text/plain',
          }
        : { 'Content-Type': 'text/plain' },
    },
  )
    .then(res => res.text())
    .then(data => console.log('sendDeviceToClickHouse', data))
    .catch(e => console.log('sendDeviceToClickHouse error', e))
}

interface ClickHouseMeta {
  id: number
  app_id: string
  created_at: string
  size: number
  action: 'add' | 'delete'
}
export function sendMetaToClickHouse(meta: ClickHouseMeta[]) {
  if (!isClickHouseEnabled())
    return Promise.resolve()

  console.log('sending meta to Clickhouse', meta)
  const metasReady = meta
  .map(convertAllDatesToCH)
  .map(l => JSON.stringify(l)).join('\n')
  return fetch(
      `${clickHouseURL()}/?query=INSERT INTO app_versions_meta SETTINGS async_insert=1, wait_for_async_insert=0 FORMAT JSONEachRow`,
      {
        method: 'POST',
        body: metasReady,
        headers: clickhouseAuthEnabled()
          ? {
              'Authorization': clickHouseAuth(),
              'Content-Type': 'text/plain',
            }
          : { 'Content-Type': 'text/plain' },
      },
  )
    .then(res => res.text())
    .then(data => console.log('sendMetaToClickHouse', data))
    .catch(e => console.log('sendMetaToClickHouse error', e))
}

export function sendLogToClickHouse(logs: Database['public']['Tables']['stats']['Insert'][]) {
  if (!isClickHouseEnabled())
    return Promise.resolve()

  // make log a string with a newline between each log
  const logReady = logs
  .map(convertAllDatesToCH)
  .map(l => JSON.stringify(l)).join('\n')
  console.log('sending log to Clickhouse', logReady)
  return fetch(
    `${clickHouseURL()}/?query=INSERT INTO logs SETTINGS async_insert=1, wait_for_async_insert=0 FORMAT JSONEachRow`,
    {
      method: 'POST',
      // add created_at: new Date().toISOString() to each log
      body: logReady,
      headers: {
        // 'Authorization': clickHouseAuth(),
        'Content-Type': 'text/plain',
      },
    },
  )
    .then(res => res.text())
    .then(data => console.log('sendLogToClickHouse', data))
    .catch(e => console.log('sendLogToClickHouse error', e))
}
