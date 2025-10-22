import { app as config } from '../../supabase/functions/_backend/private/config.ts'
import { app as create_device } from '../../supabase/functions/_backend/private/create_device.ts'
import { app as credits } from '../../supabase/functions/_backend/private/credits.ts'
import { app as deleted_failed_version } from '../../supabase/functions/_backend/private/delete_failed_version.ts'
import { app as devices_priv } from '../../supabase/functions/_backend/private/devices.ts'
import { app as events } from '../../supabase/functions/_backend/private/events.ts'
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
import { app as cron_stat_app } from '../../supabase/functions/_backend/triggers/cron_stat_app.ts'
import { app as cron_stat_org } from '../../supabase/functions/_backend/triggers/cron_stat_org.ts'
import { app as cron_sync_sub } from '../../supabase/functions/_backend/triggers/cron_sync_sub.ts'
import { app as logsnag_insights } from '../../supabase/functions/_backend/triggers/logsnag_insights.ts'
import { app as on_app_create } from '../../supabase/functions/_backend/triggers/on_app_create.ts'
import { app as on_channel_update } from '../../supabase/functions/_backend/triggers/on_channel_update.ts'
import { app as on_deploy_history_create } from '../../supabase/functions/_backend/triggers/on_deploy_history_create.ts'
import { app as on_manifest_create } from '../../supabase/functions/_backend/triggers/on_manifest_create.ts'
import { app as on_organization_create } from '../../supabase/functions/_backend/triggers/on_organization_create.ts'
import { app as on_user_create } from '../../supabase/functions/_backend/triggers/on_user_create.ts'
import { app as on_user_delete } from '../../supabase/functions/_backend/triggers/on_user_delete.ts'
import { app as on_user_update } from '../../supabase/functions/_backend/triggers/on_user_update.ts'
import { app as on_version_create } from '../../supabase/functions/_backend/triggers/on_version_create.ts'
import { app as on_version_delete } from '../../supabase/functions/_backend/triggers/on_version_delete.ts'
import { app as on_version_update } from '../../supabase/functions/_backend/triggers/on_version_update.ts'
import { app as queue_consumer } from '../../supabase/functions/_backend/triggers/queue_consumer.ts'
import { app as stripe_event } from '../../supabase/functions/_backend/triggers/stripe_event.ts'
import { createAllCatch, createHono } from '../../supabase/functions/_backend/utils/hono.ts'
import { version } from '../../supabase/functions/_backend/utils/version.ts'

// Public API
const functionName = 'api'
const app = createHono(functionName, version, process.env.SENTRY_DSN)
app.route('/ok', ok)
app.route('/apikey', apikey)
app.route('/bundle', bundle)
app.route('/channel', channel)
app.route('/device', device)
app.route('/organization', organization)
app.route('/statistics', statistics)
app.route('/app', appEndpoint)

// Private API
const functionNamePrivate = 'private'
const appPrivate = createHono(functionNamePrivate, version)
appPrivate.route('/plans', plans)
appPrivate.route('/credits', credits)
appPrivate.route('/store_top', storeTop)
appPrivate.route('/website_stats', publicStats)
appPrivate.route('/config', config)
appPrivate.route('/devices', devices_priv)
appPrivate.route('/log_as', log_as)
appPrivate.route('/stats', stats_priv)
appPrivate.route('/stripe_checkout', stripe_checkout)
appPrivate.route('/stripe_portal', stripe_portal)
appPrivate.route('/delete_failed_version', deleted_failed_version)
appPrivate.route('/verify_replication', verify_replication)
appPrivate.route('/create_device', create_device)
appPrivate.route('/events', events)

// Triggers
const functionNameTriggers = 'triggers'
const appTriggers = createHono(functionNameTriggers, version)
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
appTriggers.route('/on_deploy_history_create', on_deploy_history_create)
appTriggers.route('/stripe_event', stripe_event)
appTriggers.route('/on_organization_create', on_organization_create)
appTriggers.route('/cron_stat_app', cron_stat_app)
appTriggers.route('/cron_stat_org', cron_stat_org)
appTriggers.route('/cron_sync_sub', cron_sync_sub)
appTriggers.route('/queue_consumer', queue_consumer)

app.route('/triggers', appTriggers)
app.route('/private', appPrivate)

createAllCatch(app, functionName)
createAllCatch(appPrivate, functionNamePrivate)
createAllCatch(appTriggers, functionNameTriggers)

export default {
  fetch: app.fetch,
}
export { AttachmentUploadHandler, UploadHandler as TemporaryKeyHandler, UploadHandler } from '../../supabase/functions/_backend/tus/uploadHandler.ts'
