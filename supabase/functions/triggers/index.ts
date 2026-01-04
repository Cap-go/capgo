import { app as credit_usage_alerts } from '../_backend/triggers/credit_usage_alerts.ts'
import { app as cron_clean_orphan_images } from '../_backend/triggers/cron_clean_orphan_images.ts'
import { app as cron_clear_versions } from '../_backend/triggers/cron_clear_versions.ts'
import { app as cron_email } from '../_backend/triggers/cron_email.ts'
import { app as cron_stat_app } from '../_backend/triggers/cron_stat_app.ts'
import { app as cron_stat_org } from '../_backend/triggers/cron_stat_org.ts'
import { app as cron_sync_sub } from '../_backend/triggers/cron_sync_sub.ts'
import { app as logsnag_insights } from '../_backend/triggers/logsnag_insights.ts'
import { app as on_app_create } from '../_backend/triggers/on_app_create.ts'
import { app as on_app_delete } from '../_backend/triggers/on_app_delete.ts'
import { app as on_channel_update } from '../_backend/triggers/on_channel_update.ts'
import { app as on_deploy_history_create } from '../_backend/triggers/on_deploy_history_create.ts'
import { app as on_manifest_create } from '../_backend/triggers/on_manifest_create.ts'
import { app as on_organization_create } from '../_backend/triggers/on_organization_create.ts'
import { app as on_organization_delete } from '../_backend/triggers/on_organization_delete.ts'
import { app as on_user_create } from '../_backend/triggers/on_user_create.ts'
import { app as on_user_delete } from '../_backend/triggers/on_user_delete.ts'
import { app as on_user_update } from '../_backend/triggers/on_user_update.ts'
import { app as on_version_create } from '../_backend/triggers/on_version_create.ts'
import { app as on_version_delete } from '../_backend/triggers/on_version_delete.ts'
import { app as on_version_update } from '../_backend/triggers/on_version_update.ts'
import { app as queue_consumer } from '../_backend/triggers/queue_consumer.ts'
import { app as stripe_event } from '../_backend/triggers/stripe_event.ts'
import { app as webhook_delivery } from '../_backend/triggers/webhook_delivery.ts'
import { app as webhook_dispatcher } from '../_backend/triggers/webhook_dispatcher.ts'
import { createAllCatch, createHono } from '../_backend/utils/hono.ts'
import { version } from '../_backend/utils/version.ts'

const functionName = 'triggers'
const appGlobal = createHono(functionName, version, Deno.env.get('SENTRY_DSN_SUPABASE'))

appGlobal.route('/cron_email', cron_email)
appGlobal.route('/logsnag_insights', logsnag_insights)
appGlobal.route('/on_channel_update', on_channel_update)
appGlobal.route('/on_user_create', on_user_create)
appGlobal.route('/on_user_update', on_user_update)
appGlobal.route('/on_user_delete', on_user_delete)
appGlobal.route('/on_app_create', on_app_create)
appGlobal.route('/on_app_delete', on_app_delete)
appGlobal.route('/on_version_create', on_version_create)
appGlobal.route('/on_version_update', on_version_update)
appGlobal.route('/on_version_delete', on_version_delete)
appGlobal.route('/on_manifest_create', on_manifest_create)
appGlobal.route('/stripe_event', stripe_event)
appGlobal.route('/on_organization_create', on_organization_create)
appGlobal.route('/cron_stat_app', cron_stat_app)
appGlobal.route('/cron_stat_org', cron_stat_org)
appGlobal.route('/cron_sync_sub', cron_sync_sub)
appGlobal.route('/cron_clear_versions', cron_clear_versions)
appGlobal.route('/cron_clean_orphan_images', cron_clean_orphan_images)
appGlobal.route('/credit_usage_alerts', credit_usage_alerts)
appGlobal.route('/on_organization_delete', on_organization_delete)
appGlobal.route('/on_deploy_history_create', on_deploy_history_create)
appGlobal.route('/queue_consumer', queue_consumer)
appGlobal.route('/webhook_delivery', webhook_delivery)
appGlobal.route('/webhook_dispatcher', webhook_dispatcher)

createAllCatch(appGlobal, functionName)
Deno.serve(appGlobal.fetch)
