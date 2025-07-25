import { app as clear_app_cache } from '../_backend/triggers/clear_app_cache.ts'
import { app as clear_device_cache } from '../_backend/triggers/clear_device_cache.ts'
import { app as cron_clear_versions } from '../_backend/triggers/cron_clear_versions.ts'
import { app as cron_email } from '../_backend/triggers/cron_email.ts'
import { app as cron_plan } from '../_backend/triggers/cron_plan.ts'
import { app as cron_stats } from '../_backend/triggers/cron_stats.ts'
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
import { createHono } from '../_backend/utils/hono.ts'
import { version } from '../_backend/utils/version.ts'

const functionName = 'triggers'
const appGlobal = createHono(functionName, version, Deno.env.get('SENTRY_DSN_SUPABASE'))

appGlobal.route('/clear_app_cache', clear_app_cache)
appGlobal.route('/clear_device_cache', clear_device_cache)
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
appGlobal.route('/cron_stats', cron_stats)
appGlobal.route('/cron_plan', cron_plan)
appGlobal.route('/cron_clear_versions', cron_clear_versions)
appGlobal.route('/on_organization_delete', on_organization_delete)
appGlobal.route('/on_deploy_history_create', on_deploy_history_create)
appGlobal.route('/queue_consumer', queue_consumer)

// createAllCatch(appGlobal, functionName)
Deno.serve(appGlobal.fetch)
