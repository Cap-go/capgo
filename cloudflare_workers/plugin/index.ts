import { version } from '../../supabase/functions/_backend/utils/version.ts'
import { app as channel_self } from '../../supabase/functions/_backend/plugins/channel_self.ts'
import { app as stats } from '../../supabase/functions/_backend/plugins/stats.ts'
import { app as updates } from '../../supabase/functions/_backend/plugins/updates.ts'
import { app as updates_lite } from '../../supabase/functions/_backend/plugins/updates_lite.ts'
import { app as latency_drizzle } from '../../supabase/functions/_backend/private/latency_drizzle.ts'
import { app as ok } from '../../supabase/functions/_backend/public/ok.ts'
import { createAllCatch, createHono } from '../../supabase/functions/_backend/utils/hono.ts'

export { AttachmentUploadHandler, UploadHandler } from '../../supabase/functions/_backend/tus/uploadHandler.ts'

const functionName = 'plugin'
const app = createHono(functionName, version, Deno.env.get('SENTRY_DSN_SUPABASE'))

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

export default {
  fetch: app.fetch,
}
