import type { Bindings } from '../../supabase/functions/_backend/utils/cloudflare.ts'
import { requestId } from '@hono/hono/request-id'
import { sentry } from '@hono/sentry'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { Hono } from 'hono/tiny'
// import { Context, Next, MiddlewareHandler } from "hono";
// import { rateLimit, wasRateLimited } from '@elithrar/workers-hono-rate-limit'
import { version } from '../../package.json'
import { app as download_link } from '../../supabase/functions/_backend/private/download_link.ts'
import { app as files } from '../../supabase/functions/_backend/private/files.ts'
import { app as upload_link } from '../../supabase/functions/_backend/private/upload_link.ts'
// import { readDevices, sendStatsAndDevice } from 'supabase/functions/_backend/utils/stats.ts'
// import { filterDeviceKeys } from 'supabase/functions/_backend/public/device/get.ts'

export { AttachmentUploadHandler, UploadHandler } from '../../supabase/functions/_backend/tus/uploadHandler.ts'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', sentry({
  release: version,
}))
app.use('*', logger())
app.use('*', (requestId as any)())

// export function readRateLimiter() {
//   const subMiddlewareKey: MiddlewareHandler<{}> = async (c: Context, next: Next) => {
//     const deviceId = c.req.query('device_id')
//     if (!deviceId)
//       return next()

//     const urlElements = c.req.url.split('/')
//     const appsElementIndex = urlElements.findIndex(element => element === 'apps')
//     const appId = urlElements.at(appsElementIndex + 1)
  
//     if (!appId) {
//       return next()
//     }

//     const key = `${appId}/${deviceId}`

//     const rateLimiterKey = `FILES_READ_RATE_LIMITER`
//     if (c.env[rateLimiterKey])
//       await rateLimit(c.env[rateLimiterKey], () => key)(c, next);

//     // TODO: make it async
//     if (wasRateLimited(c)) {
//       // let's read the device from the db
//       const res = await readDevices(c as any, appId, 0, 1, undefined, [deviceId.toLowerCase()])

//       if (!res || !res.length) {
//         return
//       }
      
//       const dataDevice = filterDeviceKeys(res as any)[0]
//       await sendStatsAndDevice(c as any, dataDevice, [{ action: 'rateLimited' }])
//     }
//   }
//   return subMiddlewareKey
// }

// export function uploadRateLimiter() {
//   const subMiddlewareKey: MiddlewareHandler<{}> = async (c: Context, next: Next) => {
//     // Skip rate limiting for OPTIONS requests
//     if (c.req.method === 'OPTIONS') {
//       return next()
//     }

//     const capgkey = c.req.header('capgkey')
//     if (!capgkey) {
//       return next()
//     }

//     const urlElements = c.req.url.split('/')
//     const appsElementIndex = urlElements.findIndex(element => element === 'apps')
//     const appId = urlElements.at(appsElementIndex + 1)
  
//     if (!appId) {
//       return next()
//     }

//     const key = `${capgkey}_${appId}`
//     const rateLimiterKey = `FILES_UPLOAD_RATE_LIMITER`
//     if (c.env[rateLimiterKey])
//       await rateLimit(c.env[rateLimiterKey], () => key)(c, next);
//   }
//   return subMiddlewareKey
// }

// Apply middleware to all /read/ routes to check if request has key and device_id query params
// app.use('*/read/*', readRateLimiter())

// Apply middleware to all /upload/ routes to check capgkey header and appId
// app.use('*/upload/*', uploadRateLimiter())

// Files API
app.route('/files', files)

// TODO: remove deprecated path when all users have been migrated
app.route('/private/download_link', download_link)
app.route('/private/upload_link', upload_link)
app.route('/private/files', files)

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
