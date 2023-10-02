import type { Database } from './supabase.types.ts'
import { getEnv } from './utils.ts'

export function isTinybirdEnabled() {
  return isTinybirdIngestEnabled() && isTinybirdGetLogEnabled() && isTinybirdCountLogEnabled()
}
export function isTinybirdIngestEnabled() {
  return !!getEnv('TINYBIRD_TOKEN_INGEST_LOG')
}
export function isTinybirdGetLogEnabled() {
  return !!getEnv('TINYBIRD_TOKEN_GET_LOG')
}
export function isTinybirdCountLogEnabled() {
  return !!getEnv('TINYBIRD_TOKEN_COUNT_LOG')
}

export function sendLogToTinybird(log: Database['public']['Tables']['stats']['Insert'][]) {
  if (!isTinybirdIngestEnabled())
    return Promise.resolve()

  // make log a string with a newline between each log
  return fetch(
    'https://api.tinybird.co/v0/events?name=stats',
    {
      method: 'POST',
      // add created_at: new Date().toISOString() to each log
      body: log.map(l => ({ ...l, created_at: new Date().toISOString() })).map(l => JSON.stringify(l)).join('\n'),
      headers: { Authorization: `Bearer ${getEnv('TINYBIRD_TOKEN_INGEST_LOG')}` },
    },
  )
    .then(res => res.json())
    .then(data => console.log(data))
}

export async function readLogInTinyBird(app_id: string, min_date: string, max_date: string) {
  if (!isTinybirdGetLogEnabled())
    return Promise.reject(new Error('TINYBIRD_TOKEN_GET_LOG is not set'))
  const url = new URL('https://api.tinybird.co/v0/pipes/get_logs.json')
  url.searchParams.append('app_id', app_id)
  url.searchParams.append('min_date', max_date)
  url.searchParams.append('max_date', min_date)
  const result = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getEnv('TINYBIRD_TOKEN_GET_LOG')}`,
    },
  })
    .then(r => r.json())
    .then(r => r)
    .catch(e => e.toString())

  if (!result.data) {
    console.error(`there is a problem running the query: ${result}`)
  }
  else {
    // as Database['public']['Tables']['stats']['Row'][]
    return result.data as Database['public']['Tables']['stats']['Row'][]
  }
}

export async function countUpdatesInTinyBird(app_id: string, min_date: string, max_date: string) {
  if (!isTinybirdCountLogEnabled())
    return Promise.reject(new Error('TINYBIRD_TOKEN_COUNT_LOG is not set'))
  const url = new URL('https://api.tinybird.co/v0/pipes/count_updates.json')
  url.searchParams.append('app_id', app_id)
  url.searchParams.append('min_date', max_date)
  url.searchParams.append('max_date', min_date)
  const result = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getEnv('TINYBIRD_TOKEN_COUNT_LOG')}`,
    },
  })
    .then(r => r.json())
    .then(r => r)
    .catch(e => e.toString())

  if (!result.data) {
    console.error(`there is a problem running the query: ${result}`)
  }
  else {
    // as Database['public']['Tables']['stats']['Row'][]
    return result.data[0]['count()']
  }
}
