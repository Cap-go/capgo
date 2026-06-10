import type { ExecutionContext, ScheduledController } from '@cloudflare/workers-types'
import type { Bindings } from '../../supabase/functions/_backend/utils/cloudflare.ts'
import { app as channel_self } from '../../supabase/functions/_backend/plugins/channel_self.ts'
import { app as stats } from '../../supabase/functions/_backend/plugins/stats.ts'
import { app as updates } from '../../supabase/functions/_backend/plugins/updates.ts'
import { app as latency } from '../../supabase/functions/_backend/private/latency.ts'
import { app as ok } from '../../supabase/functions/_backend/public/ok.ts'
import { BRES, createAllCatch, createHono, useCors } from '../../supabase/functions/_backend/utils/hono.ts'
import { flushQueuedPluginNotifications } from '../../supabase/functions/_backend/utils/plugin_notification_flush.ts'
import { version } from '../../supabase/functions/_backend/utils/version.ts'

const functionName = 'plugin'
const scheduledFunctionName = 'plugin-scheduled'
const app = createHono(functionName, version)
const scheduledApp = createHono(scheduledFunctionName, version)

app.use('*', async (c, next) => {
  c.set('skipSupabaseStatsFallback', true)
  c.set('skipSupabaseNotificationWrites', true)
  c.set('queuePluginNotifications', true)
  c.set('skipChannelSelfPostgresFallback', true)
  c.set('requireReadReplica', true)
  await next()
})

app.use('*', useCors)

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

scheduledApp.post('/flush-plugin-notifications', async (c) => {
  const result = await flushQueuedPluginNotifications(c)
  return c.json({ ...BRES, ...result })
})

createAllCatch(app, functionName)
createAllCatch(scheduledApp, scheduledFunctionName)

export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    const request = new Request('https://plugin-scheduled.capgo.internal/flush-plugin-notifications', { method: 'POST' })
    ctx.waitUntil(Promise.resolve(scheduledApp.fetch(request, env, ctx)))
  },
}
