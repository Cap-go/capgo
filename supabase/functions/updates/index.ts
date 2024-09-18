import { sentry } from '@hono/sentry'
import { Hono } from 'hono/tiny'
import { app } from '../_backend/plugins/updates.ts'

const functionName = 'updates'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

const sentryDsn = Deno.env.get('SENTRY_DSN_SUPABASE')
if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: sentryDsn,
  }))
}

Deno.serve(appGlobal.fetch)
