import type { Database } from '../_backend/utils/supabase.types.ts'
import type { MiddlewareKeyVariables } from '../_backend/utils/hono.ts'
import { sentry } from '@hono/sentry'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { Hono } from 'hono/tiny'
import { createClient } from '@supabase/supabase-js'
import { BRES } from '../_backend/utils/hono.ts'

const functionName = 'auth_callback'
const app = new Hono()

app.post('/', async (c) => {
  try {
    const payload = await c.req.json()
    
    if (payload.type === 'EMAIL_CHANGE' && payload.event === 'CONFIRMED') {
      console.log(`Email change confirmed for user ${payload.id}: ${payload.email}`)
      
      const supabaseAdmin = createClient<Database>(
        Deno.env.get('SUPABASE_URL') || '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
          }
        }
      )
      
      const { error } = await supabaseAdmin
        .from('users')
        .update({ email: payload.email })
        .eq('id', payload.id)
      
      if (error) {
        console.error(`Error updating user email: ${error.message}`)
        return c.json({ status: 'Error updating user email', error: error.message }, 500)
      }
      
      console.log(`Successfully synced email for user ${payload.id}`)
    }
    
    return c.json(BRES)
  } catch (e: unknown) {
    const error = e as Error
    console.error(`Error processing auth callback: ${error.message}`)
    return c.json({ status: 'Error processing auth callback', error: error.message }, 500)
  }
})

const appGlobal = new Hono<MiddlewareKeyVariables>().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_SUPABASE')
if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: Deno.env.get('SENTRY_DSN_SUPABASE'),
  }))
}

appGlobal.use('*', logger())
appGlobal.use('*', requestId())
appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
