import type { Bindings } from '../../supabase/functions/_backend/utils/cloudflare.ts'
import { requestId } from '@hono/hono/request-id'
import { sentry } from '@hono/sentry'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { Hono } from 'hono/tiny'
import { version } from '../../package.json'
import { app as channel_self } from '../../supabase/functions/_backend/plugins/channel_self.ts'
import { app as stats } from '../../supabase/functions/_backend/plugins/stats.ts'
import { app as updates } from '../../supabase/functions/_backend/plugins/updates.ts'
import { app as latency_drizzle } from '../../supabase/functions/_backend/private/latency_drizzle.ts'

import { app as update_stats } from '../../supabase/functions/_backend/private/updates_stats.ts'
import { app as ok } from '../../supabase/functions/_backend/public/ok.ts'
// import { middlewareAPISecret } from '../../supabase/functions/_backend/utils/hono.ts'

export { AttachmentUploadHandler, UploadHandler } from '../../supabase/functions/_backend/tus/uploadHandler.ts'

const app = new Hono<{ Bindings: Bindings }>()

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
app.route('/plugin/updates_stats', update_stats)
app.route('/plugin/updates_debug', updates)
app.route('/plugin/stats', stats)
app.route('/plugin/latency_drizzle', latency_drizzle)

// TODO: deprecated remove when everyone use the new endpoint
app.route('/channel_self', channel_self)
app.route('/updates', updates)
app.route('/updates_v2', updates)
app.route('/updates_debug', updates)
app.route('/stats', stats)

// app.post('/test_d1', middlewareAPISecret, async (c) => {
//   try {
//     const body = await c.req.json()
//     if (body.request) {
//       const requestD1 = c.env.DB_REPLICATE
//         .prepare(body.request)
//         .all()

//       const res = await requestD1
//       console.log('test d1 res', res)
//       return c.json({ res })
//     }
//     else if (body.query && body.bind) {
//       console.log('test d1 query', body.query)
//       console.log('test d1 bind', body.bind, body.bind.length)
//       const requestD1 = c.env.DB_REPLICATE
//         .prepare(body.query)
//         .bind(...body.bind)
//         .run()

//       const res = await requestD1
//       console.log('test d1 res', res)
//       return c.json({ res })
//     }
//     else {
//       return c.json({ error: 'Missing request' })
//     }
//   }
//   catch (e) {
//     console.error('Error d1', e)
//     return c.json({ error: 'Error', e: JSON.stringify(e) })
//   }
// })

app.onError((e, c) => {
  c.get('sentry').captureException(e)
  if (e instanceof HTTPException)
    return c.json({ status: 'Internal Server Error', response: e.getResponse(), error: JSON.stringify(e), message: e.message }, 500)
  console.log('app', 'onError', e)
  return c.json({ status: 'Internal Server Error', error: JSON.stringify(e), message: e.message }, 500)
})

export default {
  fetch: app.fetch,
}
