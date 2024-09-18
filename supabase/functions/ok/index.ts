import { sentry } from '@hono/sentry'
import { Hono } from 'hono/tiny'
import { app } from '../_backend/public/ok.ts'

const functionName = 'ok'
const appGlobal = new Hono().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_SUPABASE')
if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: Deno.env.get('SENTRY_DSN_SUPABASE'),
  }))
}
appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
