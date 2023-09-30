import type { Database } from './supabase.types.ts'
import { getEnv } from './utils.ts'

export function sendLogToTinybird(log: Database['public']['Tables']['stats']['Insert'][]) {
  if (!getEnv('TINYBIRD_TOKEN'))
    return Promise.resolve()

  return fetch(
    'https://api.tinybird.co/v0/events?name=logs',
    {
      method: 'POST',
      body: JSON.stringify(log),
      headers: { Authorization: `Bearer ${getEnv('TINYBIRD_TOKEN')}` },
    },
  )
    .then(res => res.json())
    .then(data => console.log(data))
}
