import { sentry } from '@hono/sentry'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { handle } from 'hono/netlify'
import { app } from '../../supabase/functions/_backend/public/bundle/index.ts'

const sentryDsn = Deno.env.get('SENTRY_DSN_NETLIFY')
if (sentryDsn) {
  app.use('*', sentry({
    dsn: sentryDsn,
  }))
}

app.use('*', logger())
app.use('*', requestId())

export default handle(app as any)
