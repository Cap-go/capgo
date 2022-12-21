import { hmac } from 'https://deno.land/x/hmac@v2.0.1/mod.ts'
import type { Details } from '../../../supabase/functions/_utils/types.ts'
import { getEnv, makeHMACContent } from '../../../supabase/functions/_utils/utils.ts'

// upper is ignored during netlify generation phase
// import from here
export const createHmac = (data: string, details: Details) => {
  return hmac('sha256', getEnv('STRIPE_WEBHOOK_SECRET') || '', makeHMACContent(data, details), 'utf8', 'hex')
}
