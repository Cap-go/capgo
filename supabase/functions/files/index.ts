import type { MiddlewareKeyVariables } from '../_backend/utils/hono.ts'
import { sentry } from '@hono/sentry'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { Hono } from 'hono/tiny'
import { app as files } from '../_backend/private/files.ts'
import { onError } from '../_backend/utils/on_error.ts'

const functionName = 'files'
const appGlobal = new Hono<MiddlewareKeyVariables>().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_SUPABASE')

if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: sentryDsn,
  }))
}

appGlobal.use('*', logger())
appGlobal.use('*', requestId())

appGlobal.route('/', files)
appGlobal.all('*', (c) => {
  console.log('Not found', c.req.url)
  return c.json({ error: 'Not Found' }, 404)
})
appGlobal.onError(onError(functionName))
Deno.serve(appGlobal.fetch)
