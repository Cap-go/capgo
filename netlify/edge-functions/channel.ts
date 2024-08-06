import { sentry } from '@hono/sentry'
import { handle } from 'https://deno.land/x/hono@v4.4.3/adapter/netlify/mod.ts'
import { app } from '../../supabase/functions/_backend/public/channel/index.ts'

const sentryDsn = Deno.env.get('SENTRY_DSN_NETLIFY')
if (sentryDsn) {
  app.use('*', sentry({
    dsn: sentryDsn,
  }))
}

export default handle(app as any)
