import { sentry } from '@hono/sentry'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { Hono } from 'hono/tiny'
import { app as files_config } from '../_backend/private/files_config.ts'

const functionName = 'files'
const appGlobal = new Hono().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_SUPABASE')

if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: sentryDsn,
  }))
}

appGlobal.use('*', logger())
appGlobal.use('*', requestId())

appGlobal.route('/config', files_config)

Deno.serve(appGlobal.fetch)
