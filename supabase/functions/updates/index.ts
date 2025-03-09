import { sentry } from '@hono/sentry'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { app } from '../_backend/plugins/updates.ts'
import { honoFactory } from '../_backend/utils/hono.ts'

const functionName = 'updates'

const appGlobal = honoFactory.createApp().basePath(`/${functionName}`)

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
