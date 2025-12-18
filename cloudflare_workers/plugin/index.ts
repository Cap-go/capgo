import { env } from 'node:process'
import { app as channel_self } from '../../supabase/functions/_backend/plugins/channel_self.ts'
import { app as stats } from '../../supabase/functions/_backend/plugins/stats.ts'
import { app as updates } from '../../supabase/functions/_backend/plugins/updates.ts'
import { app as latency } from '../../supabase/functions/_backend/private/latency.ts'
import { app as ok } from '../../supabase/functions/_backend/public/ok.ts'
import { createAllCatch, createHono } from '../../supabase/functions/_backend/utils/hono.ts'
import { version } from '../../supabase/functions/_backend/utils/version.ts'

const functionName = 'plugin'
const app = createHono(functionName, version, env.SENTRY_DSN)

// TODO: deprecated remove when everyone use the new endpoint
app.route('/plugin/ok', ok)
app.route('/plugin/channel_self', channel_self)
app.route('/plugin/updates', updates)
app.route('/plugin/stats', stats)

// Plugin API
app.route('/channel_self', channel_self)
app.route('/updates', updates)
app.route('/stats', stats)
app.route('/ok', ok)
app.route('/latency', latency)

createAllCatch(app, functionName)

export default {
  fetch: app.fetch,
}
