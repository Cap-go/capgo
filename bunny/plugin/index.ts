import * as BunnySDK from '@bunny.net/edgescript-sdk'
import { app as channel_self } from '../../supabase/functions/_backend/plugins/channel_self.ts'
import { app as stats } from '../../supabase/functions/_backend/plugins/stats.ts'
import { app as updates } from '../../supabase/functions/_backend/plugins/updates.ts'
import { app as updates_lite } from '../../supabase/functions/_backend/plugins/updates_lite.ts'
import { app as latency_drizzle } from '../../supabase/functions/_backend/private/latency_drizzle.ts'
import { app as ok } from '../../supabase/functions/_backend/public/ok.ts'
import { createAllCatch, createHono } from '../../supabase/functions/_backend/utils/hono.ts'
import { version } from '../../supabase/functions/_backend/utils/version.ts'

const functionName = 'plugin'
const app = createHono(functionName, version, process.env.SENTRY_DSN)

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
createAllCatch(app, functionName)

const listener = BunnySDK.net.tcp.unstable_new()
console.log('Listening on: ', BunnySDK.net.tcp.toString(listener))
BunnySDK.net.http.serve(
  (req: Request): Response | Promise<Response> => {
    console.log(`[INFO]: ${req.method} - ${req.url}`)
    return app.fetch(req)
  },
)
