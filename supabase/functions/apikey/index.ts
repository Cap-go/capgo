import type { MiddlewareKeyVariables } from '../_backend/utils/hono.ts'
import { sentry } from '@hono/sentry'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { Hono } from 'hono/tiny'
import { app } from '../_backend/public/apikey/index.ts'

const functionName = 'apikey'
const appGlobal = new Hono<MiddlewareKeyVariables>().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_SUPABASE')
if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: sentryDsn,
  }))
}

appGlobal.use('*', logger())
appGlobal.use('*', requestId())
appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
