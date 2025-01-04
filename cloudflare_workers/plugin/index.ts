import type { Context, MiddlewareHandler, Next } from 'hono'
import type { Bindings } from '../../supabase/functions/_backend/utils/cloudflare.ts'
import { rateLimit, wasRateLimited } from '@elithrar/workers-hono-rate-limit'
import { requestId } from '@hono/hono/request-id'
import { sentry } from '@hono/sentry'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { Hono } from 'hono/tiny'
import { z } from 'zod'
import { version } from '../../package.json'
import { app as channel_self } from '../../supabase/functions/_backend/plugins/channel_self.ts'
import { app as stats } from '../../supabase/functions/_backend/plugins/stats.ts'
import { app as updates } from '../../supabase/functions/_backend/plugins/updates.ts'
import { app as latency_drizzle } from '../../supabase/functions/_backend/private/latency_drizzle.ts'
import { app as update_stats } from '../../supabase/functions/_backend/private/updates_stats.ts'
import { app as ok } from '../../supabase/functions/_backend/public/ok.ts'
import { sendStatsAndDevice } from '../../supabase/functions/_backend/utils/stats.ts'
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
app.use('*', (requestId as any)())

const zodDeviceSchema = z.object({
  app_id: z.string(),
  device_id: z.string(),
  plugin_version: z.string(),
  version: z.number().optional().default(0),
  custom_id: z.string().optional(),
  is_emulator: z.boolean().optional(),
  is_prod: z.boolean().optional(),
  version_build: z.string(),
  os_version: z.string().optional(),
  platform: z.enum(['ios', 'android']),
  updated_at: z.string().optional().default(new Date().toISOString()),
})

export function deviceAppIdRateLimiter(rateLimiterAction: string, _methods: { limit: number, period: number, method: string }[]) {
  const subMiddlewareKey: MiddlewareHandler<{}> = async (c: Context, next: Next) => {
    let deviceId = ''
    let appId = ''
    try {
      const body = await c.req.json()
      const { device_id, app_id } = zodDeviceIdAppIdSchema.parse(body)
      deviceId = device_id
      appId = app_id
    }
    catch (e) {
      console.error('publicRateLimiter', e)
      await next()
    }
    const rateLimiterKey = `PUBLIC_API_DEVICE_${rateLimiterAction}_${c.req.method}_RATE_LIMITER`
    if (c.env[rateLimiterKey])
      await rateLimit(c.env[rateLimiterKey], () => `${deviceId}-${appId}`)(c, next)
    if (wasRateLimited(c)) {
      const device = zodDeviceSchema.safeParse(await c.req.json())
      console.log('deviceAppIdRateLimiter', JSON.stringify(device))
      if (device.success) {
        try {
          // this as any should work. There are different honot types for hono and @hono/hono
          await sendStatsAndDevice(c as any, device.data, [{ action: 'rateLimited' }])
        }
        catch (e) {
          console.error('deviceAppIdRateLimiter', `Error sending stats and device: ${e}`)
        }
      }
    }
  }
  return subMiddlewareKey
}

// Plugin API
app.route('/plugin/ok', ok)
// app.use('/plugin/channel_self', deviceAppIdRateLimiter('CHANNEL_SELF', [{ limit: 20, period: 10, method: 'POST' }, { limit: 20, period: 10, method: 'DELETE' }, { limit: 20, period: 10, method: 'PUT' }, { limit: 20, period: 10, method: 'GET' }]))
app.route('/plugin/channel_self', channel_self)
app.route('/plugin/updates', updates)
app.route('/plugin/updates_v2', updates)
app.route('/plugin/updates_stats', update_stats)
app.route('/plugin/updates_debug', updates)
app.route('/plugin/stats', stats)
app.route('/plugin/latency_drizzle', latency_drizzle)

// TODO: deprecated remove when everyone use the new endpoint
// app.use('/channel_self', deviceAppIdRateLimiter('CHANNEL_SELF', [{ limit: 20, period: 10, method: 'POST' }, { limit: 20, period: 10, method: 'DELETE' }, { limit: 20, period: 10, method: 'PUT' }, { limit: 20, period: 10, method: 'GET' }]))
app.route('/channel_self', channel_self)
// Apply rate limiter middleware before routing to ensure it runs first
// app.use('/updates*', deviceAppIdRateLimiter('ALL_UPDATES', [{ limit: 20, period: 10, method: 'POST' }]))
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
