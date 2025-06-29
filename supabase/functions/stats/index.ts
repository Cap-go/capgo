import type { MiddlewareKeyVariables } from '../_backend/utils/hono.ts'
import { sentry } from '@hono/sentry'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { Hono } from 'hono/tiny'
import { app } from '../_backend/plugins/stats.ts'
import { cloudlog } from '../_backend/utils/loggin.ts'
import { onError } from '../_backend/utils/on_error.ts'

const functionName = 'stats'
const appGlobal = new Hono<MiddlewareKeyVariables>().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_SUPABASE')
if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: sentryDsn,
  }) as any)
}

appGlobal.use('*', logger())
appGlobal.use('*', requestId())
appGlobal.route('/', app)
appGlobal.all('*', (c) => {
  cloudlog({ requestId: c.get('requestId'), message: 'Not found', url: c.req.url })
  return c.json({ error: 'Not Found' }, 404)
})
appGlobal.onError(onError(functionName))
Deno.serve(appGlobal.fetch)
