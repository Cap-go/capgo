import type { MiddlewareKeyVariables } from 'supabase/functions/_backend/utils/hono.ts'
import { requestId } from '@hono/hono/request-id'
import { sentry } from '@hono/sentry'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { Hono } from 'hono/tiny'
import { version } from '../../package.json'
import { app as config } from '../../supabase/functions/_backend/private/config.ts'
import { app as create_device } from '../../supabase/functions/_backend/private/create_device.ts'
import { app as deleted_failed_version } from '../../supabase/functions/_backend/private/delete_failed_version.ts'
import { app as devices_priv } from '../../supabase/functions/_backend/private/devices.ts'
import { app as events } from '../../supabase/functions/_backend/private/events.ts'
import { app as latency } from '../../supabase/functions/_backend/private/latency.ts'
import { app as latency_postres } from '../../supabase/functions/_backend/private/latency_postres.ts'
import { app as log_as } from '../../supabase/functions/_backend/private/log_as.ts'
import { app as plans } from '../../supabase/functions/_backend/private/plans.ts'
import { app as publicStats } from '../../supabase/functions/_backend/private/public_stats.ts'
import { app as stats_priv } from '../../supabase/functions/_backend/private/stats.ts'
import { app as storeTop } from '../../supabase/functions/_backend/private/store_top.ts'
import { app as stripe_checkout } from '../../supabase/functions/_backend/private/stripe_checkout.ts'
import { app as stripe_portal } from '../../supabase/functions/_backend/private/stripe_portal.ts'
import { app as verify_replication } from '../../supabase/functions/_backend/private/verify_replication.ts'
import { app as apikey } from '../../supabase/functions/_backend/public/apikey/index.ts'
import { app as appEndpoint } from '../../supabase/functions/_backend/public/app/index.ts'
import { app as bundle } from '../../supabase/functions/_backend/public/bundle/index.ts'
import { app as channel } from '../../supabase/functions/_backend/public/channel/index.ts'
import { app as device } from '../../supabase/functions/_backend/public/device/index.ts'
import { app as ok } from '../../supabase/functions/_backend/public/ok.ts'
import { app as organization } from '../../supabase/functions/_backend/public/organization/index.ts'
import { app as statistics } from '../../supabase/functions/_backend/public/statistics/index.ts'
import { app as clear_app_cache } from '../../supabase/functions/_backend/triggers/clear_app_cache.ts'
import { app as clear_device_cache } from '../../supabase/functions/_backend/triggers/clear_device_cache.ts'
import { app as cron_clear_versions } from '../../supabase/functions/_backend/triggers/cron_clear_versions.ts'
import { app as cron_email } from '../../supabase/functions/_backend/triggers/cron_email.ts'
import { app as cron_plan } from '../../supabase/functions/_backend/triggers/cron_plan.ts'
import { app as cron_stats } from '../../supabase/functions/_backend/triggers/cron_stats.ts'
import { app as logsnag_insights } from '../../supabase/functions/_backend/triggers/logsnag_insights.ts'
import { app as on_app_create } from '../../supabase/functions/_backend/triggers/on_app_create.ts'
import { app as on_channel_update } from '../../supabase/functions/_backend/triggers/on_channel_update.ts'
import { app as on_manifest_create } from '../../supabase/functions/_backend/triggers/on_manifest_create.ts'
import { app as on_organization_create } from '../../supabase/functions/_backend/triggers/on_organization_create.ts'
import { app as on_user_create } from '../../supabase/functions/_backend/triggers/on_user_create.ts'
import { app as on_user_delete } from '../../supabase/functions/_backend/triggers/on_user_delete.ts'
import { app as on_user_update } from '../../supabase/functions/_backend/triggers/on_user_update.ts'
import { app as on_version_create } from '../../supabase/functions/_backend/triggers/on_version_create.ts'
import { app as on_version_delete } from '../../supabase/functions/_backend/triggers/on_version_delete.ts'
import { app as on_version_update } from '../../supabase/functions/_backend/triggers/on_version_update.ts'
import { app as stripe_event } from '../../supabase/functions/_backend/triggers/stripe_event.ts'

const app = new Hono<MiddlewareKeyVariables>()
const appTriggers = new Hono<MiddlewareKeyVariables>()
const appPrivate = new Hono<MiddlewareKeyVariables>()

app.use('*', sentry({
  release: version,
}))
app.use('*', logger())
app.use('*', (requestId as any)())

// Public API
app.route('/ok', ok)
app.route('/apikey', apikey)
app.route('/bundle', bundle)
app.route('/channel', channel)
app.route('/device', device)
app.route('/organization', organization)
app.route('/statistics', statistics)
app.route('/app', appEndpoint)

// Private API
appPrivate.route('/plans', plans)
appPrivate.route('/store_top', storeTop)
appPrivate.route('/website_stats', publicStats)
appPrivate.route('/config', config)
appPrivate.route('/devices', devices_priv)
appPrivate.route('/log_as', log_as)
appPrivate.route('/stats', stats_priv)
appPrivate.route('/stripe_checkout', stripe_checkout)
appPrivate.route('/stripe_portal', stripe_portal)
appPrivate.route('/delete_failed_version', deleted_failed_version)
appPrivate.route('/latency', latency)
appPrivate.route('/latency_postres', latency_postres)
appPrivate.route('/verify_replication', verify_replication)
appPrivate.route('/create_device', create_device)
appPrivate.route('/events', events)

// Triggers
appTriggers.route('/clear_app_cache', clear_app_cache)
appTriggers.route('/clear_device_cache', clear_device_cache)
appTriggers.route('/cron_email', cron_email)
appTriggers.route('/cron_clear_versions', cron_clear_versions)
appTriggers.route('/logsnag_insights', logsnag_insights)
appTriggers.route('/on_channel_update', on_channel_update)
appTriggers.route('/on_app_create', on_app_create)
appTriggers.route('/on_user_create', on_user_create)
appTriggers.route('/on_user_update', on_user_update)
appTriggers.route('/on_user_delete', on_user_delete)
appTriggers.route('/on_version_create', on_version_create)
appTriggers.route('/on_version_update', on_version_update)
appTriggers.route('/on_version_delete', on_version_delete)
appTriggers.route('/on_manifest_create', on_manifest_create)
appTriggers.route('/stripe_event', stripe_event)
appTriggers.route('/on_organization_create', on_organization_create)
appTriggers.route('/cron_stats', cron_stats)
appTriggers.route('/cron_plan', cron_plan)

app.route('/triggers', appTriggers)
app.route('/private', appPrivate)

app.onError((e, c) => {
  console.log('app onError', e)
  c.get('sentry').captureException(e)
  if (e instanceof HTTPException) {
    if (e.status === 429) {
      return c.json({ error: 'you are beeing rate limited' }, 429)
    }
    return c.json({ status: 'Internal Server Error', response: e.getResponse(), error: JSON.stringify(e), message: e.message }, 500)
  }
  return c.json({ status: 'Internal Server Error', error: JSON.stringify(e), message: e.message }, 500)
})

export default {
  fetch: app.fetch,
}
export { AttachmentUploadHandler, UploadHandler as TemporaryKeyHandler, UploadHandler } from '../../supabase/functions/_backend/tus/uploadHandler.ts'
