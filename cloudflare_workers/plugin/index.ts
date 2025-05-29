import type { MiddlewareKeyVariables } from 'supabase/functions/_backend/utils/hono.ts'
import { requestId } from '@hono/hono/request-id'
import { sentry } from '@hono/sentry'
import { logger } from 'hono/logger'
import { Hono } from 'hono/tiny'
import { version } from '../../package.json'
import { app as channel_self } from '../../supabase/functions/_backend/plugins/channel_self.ts'
import { app as stats } from '../../supabase/functions/_backend/plugins/stats.ts'
import { app as updates } from '../../supabase/functions/_backend/plugins/updates.ts'
import { app as updates_lite } from '../../supabase/functions/_backend/plugins/updates_lite.ts'
import { app as latency_drizzle } from '../../supabase/functions/_backend/private/latency_drizzle.ts'
import { app as ok } from '../../supabase/functions/_backend/public/ok.ts'
import { onError } from 'supabase/functions/_backend/utils/on_error.ts'

export { AttachmentUploadHandler, UploadHandler } from '../../supabase/functions/_backend/tus/uploadHandler.ts'

const app = new Hono<MiddlewareKeyVariables>()

app.use('*', sentry({
  release: version,
}))
app.use('*', logger())
app.use('*', (requestId as any)())

// Plugin API
app.route('/plugin/ok', ok)
app.route('/plugin/channel_self', channel_self)
app.route('/plugin/updates', updates)
app.route('/plugin/updates_v2', updates)
app.route('/plugin/stats', stats)
app.route('/plugin/latency_drizzle', latency_drizzle)

// TODO: deprecated remove when everyone use the new endpoint
app.route('/channel_self', channel_self)
app.route('/updates', updates)
app.route('/updates_v2', updates)
app.route('/updates_lite', updates_lite)
app.route('/updates_lite_v2', updates_lite)
app.route('/stats', stats)
app.all('*', (c) => {
  console.log('Not found', c.req.url)
  return c.json({ error: 'Not Found' }, 404)
})
app.onError(onError('Worker Plugin'))

export default {
  fetch: app.fetch,
}
