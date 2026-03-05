import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { useCors } from '../utils/hono.ts'
import { existInEnv, getEnv, isStripeConfigured } from '../utils/utils.ts'

const legacySupabaseProjectRef = 'xvwzpoazmxkqosrdewyv'

function getSupabaseProjectId(supabaseUrl: string | null): string | undefined {
  if (!supabaseUrl)
    return undefined

  let host = ''
  try {
    host = new URL(supabaseUrl).hostname
  }
  catch {
    host = supabaseUrl.replace(/^https?:\/\//, '').split('/')[0]
  }

  if (host === 'sb.capgo.app')
    return legacySupabaseProjectRef

  return host.split('.')[0] || undefined
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.get('/', (c) => {
  const supabaseUrl = existInEnv(c, 'SUPABASE_REPLICATE_URL') ? getEnv(c, 'SUPABASE_REPLICATE_URL') : getEnv(c, 'SUPABASE_URL')

  return c.json({
    supaHost: supabaseUrl,
    supbaseId: getSupabaseProjectId(supabaseUrl),
    supaKey: getEnv(c, 'SUPABASE_ANON_KEY'),
    stripeEnabled: isStripeConfigured(c),
  })
})
