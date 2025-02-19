import type { MiddlewareHandler } from '@hono/hono'
import { sentry } from '@hono/sentry'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { Hono } from 'hono/tiny'
import { app as files } from '../_backend/private/files.ts'

const functionName = 'files'
const appGlobal = new Hono().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_SUPABASE')

if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: sentryDsn,
  }) as unknown as MiddlewareHandler)
}

appGlobal.use('*', logger())
appGlobal.use('*', requestId())

appGlobal.route('/', files)

Deno.serve(appGlobal.fetch)
