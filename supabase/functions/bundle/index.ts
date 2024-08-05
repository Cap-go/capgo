import { sentry } from '@hono/sentry'
import { Hono } from 'hono/tiny'
import { app } from '../_backend/public/bundle/index.ts'

const functionName = 'bundle'
const appGlobal = new Hono().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_SUPABASE')
if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: sentryDsn,
  }))
}

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
