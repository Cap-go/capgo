import crypto from 'crypto'
import type { Details } from 'supabase/functions/_utils/types'
import { makeHMACContent } from 'supabase/functions/_utils/utils'
import { getEnv } from './getEnv'

// upper is ignored during netlify generation phase
// import from here
export const createHmac = (data: string, details: Details) => {
  const hmac = crypto.createHmac('sha256', getEnv('STRIPE_WEBHOOK_SECRET'))
  hmac.write(makeHMACContent(data, details))
  hmac.end()
  return hmac.read().toString('hex')
}
