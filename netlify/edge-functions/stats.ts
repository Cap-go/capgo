import { sentry } from '@hono/sentry'
import { logger } from 'hono/logger'
import { handle } from 'hono/netlify'
import { requestId } from 'hono/request-id'
import { app } from '../../supabase/functions/_backend/plugins/stats.ts'

const sentryDsn = Deno.env.get('SENTRY_DSN_NETLIFY')
if (sentryDsn) {
  app.use('*', sentry({
    dsn: sentryDsn,
  }))
}

app.use('*', logger())
app.use('*', requestId())

export default handle(app as any)
