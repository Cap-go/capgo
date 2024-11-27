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
import { Context, Next, MiddlewareHandler } from "hono";
import { rateLimit } from '@elithrar/workers-hono-rate-limit'
import { z } from 'zod'
// import { middlewareAPISecret } from '../../supabase/functions/_backend/utils/hono.ts'

export { AttachmentUploadHandler, UploadHandler } from '../../supabase/functions/_backend/tus/uploadHandler.ts'

const app = new Hono<{ Bindings: Bindings }>()
const zodDeviceIdAppIdSchema = z.object({
  device_id: z.string(),
  app_id: z.string(),
})

app.use('*', sentry({
  release: version,
}))
app.use('*', logger())
app.use('*', requestId())

export function deviceAppIdRateLimiter(rateLimiterAction: String, methods: string[]) {
  const subMiddlewareKey: MiddlewareHandler<{}> = async (c: Context, next: Next) => {
    console.log('anajkclp', rateLimiterAction)
    let deviceId = ''
    let appId = ''
    try {
      const body = await c.req.json()
      const { device_id, app_id } = zodDeviceIdAppIdSchema.parse(body)
      deviceId = device_id
      appId = app_id
    } catch (e) {
      console.error('publicRateLimiter', e)
      await next()
    }
    console.log('rateLimiterAction', `PUBLIC_DEVICE_APP_ID_${rateLimiterAction}_${c.req.method}_RATE_LIMITER`)
    await rateLimit(c.env[`PUBLIC_DEVICE_APP_ID_${rateLimiterAction}_${c.req.method}_RATE_LIMITER`], () => `${deviceId}-${appId}`)(c, next);
  }
  return subMiddlewareKey
}

// Plugin API
app.route('/plugin/ok', ok)
app.use('/plugin/channel_self', deviceAppIdRateLimiter('CHANNEL_SELF', ['POST', 'DELETE', 'PUT', 'GET']))
app.route('/plugin/channel_self', channel_self)
app.route('/plugin/updates', updates)
app.route('/plugin/updates_v2', updates)
app.route('/plugin/updates_stats', update_stats)
app.route('/plugin/updates_debug', updates)
app.route('/plugin/stats', stats)
app.route('/plugin/latency_drizzle', latency_drizzle)

// TODO: deprecated remove when everyone use the new endpoint
app.use('/channel_self', deviceAppIdRateLimiter('CHANNEL_SELF', ['POST', 'DELETE', 'PUT', 'GET']))
app.route('/channel_self', channel_self)
// Apply rate limiter middleware before routing to ensure it runs first
app.use('/updates*', deviceAppIdRateLimiter('ALL_UPDATES', ['GET']))
app.route('/updates', updates)
app.route('/updates_v2', updates).use('*', deviceAppIdRateLimiter('UPDATES_GET', ['GET']))
app.route('/updates_debug', updates).use('*', deviceAppIdRateLimiter('UPDATES_GET', ['GET']))
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
  if (e instanceof HTTPException) {
    if (e.status === 429) {
      return c.json({ error: 'you are beeing rate limited' }, 429)
    }
    return c.json({ status: 'Internal Server Error', response: e.getResponse(), error: JSON.stringify(e), message: e.message }, 500)
  }
  console.log('app', 'onError', e)
  return c.json({ status: 'Internal Server Error', error: JSON.stringify(e), message: e.message }, 500)
})

export default {
  fetch: app.fetch,
}
