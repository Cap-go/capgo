import type { Database } from './supabase.types.ts'
import { getEnv } from './utils.ts'

export function sendLogToTinybird(log: Database['public']['Tables']['stats']['Insert'][]) {
  if (!getEnv('TINYBIRD_TOKEN'))
    return Promise.resolve()

  // make log a string with a newline between each log
  return fetch(
    'https://api.tinybird.co/v0/events?name=logs',
    {
      method: 'POST',
      body: log.map(l => JSON.stringify(l)).join('\n'),
      headers: { Authorization: `Bearer ${getEnv('TINYBIRD_TOKEN')}` },
    },
  )
    .then(res => res.json())
    .then(data => console.log(data))
}
