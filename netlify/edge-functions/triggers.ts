import type { MiddlewareKeyVariables } from '../../supabase/functions/_backend/utils/hono.ts'
import { sentry } from '@hono/sentry'
import { logger } from 'hono/logger'
import { handle } from 'hono/netlify'

import { requestId } from 'hono/request-id'
import { Hono } from 'hono/tiny'
// Triggers API
import { app as clear_app_cache } from '../../supabase/functions/_backend/triggers/clear_app_cache.ts'
import { app as clear_device_cache } from '../../supabase/functions/_backend/triggers/clear_device_cache.ts'
import { app as cron_email } from '../../supabase/functions/_backend/triggers/cron_email.ts'
import { app as cron_plan } from '../../supabase/functions/_backend/triggers/cron_plan.ts'
import { app as cron_stats } from '../../supabase/functions/_backend/triggers/cron_stats.ts'
import { app as logsnag_insights } from '../../supabase/functions/_backend/triggers/logsnag_insights.ts'
import { app as on_channel_update } from '../../supabase/functions/_backend/triggers/on_channel_update.ts'
import { app as on_deploy_history_create } from '../../supabase/functions/_backend/triggers/on_deploy_history_create.ts'
import { app as on_manifest_create } from '../../supabase/functions/_backend/triggers/on_manifest_create.ts'
import { app as on_user_create } from '../../supabase/functions/_backend/triggers/on_user_create.ts'
import { app as on_user_delete } from '../../supabase/functions/_backend/triggers/on_user_delete.ts'
import { app as on_user_update } from '../../supabase/functions/_backend/triggers/on_user_update.ts'
import { app as on_version_create } from '../../supabase/functions/_backend/triggers/on_version_create.ts'
import { app as on_version_delete } from '../../supabase/functions/_backend/triggers/on_version_delete.ts'
import { app as on_version_update } from '../../supabase/functions/_backend/triggers/on_version_update.ts'
import { app as stripe_event } from '../../supabase/functions/_backend/triggers/stripe_event.ts'

const functionName = 'triggers'
const appGlobal = new Hono<MiddlewareKeyVariables>().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_NETLIFY')
if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: sentryDsn,
  }))
}

appGlobal.use('*', logger())
appGlobal.use('*', requestId())

appGlobal.route('/clear_app_cache', clear_app_cache)
appGlobal.route('/clear_device_cache', clear_device_cache)
appGlobal.route('/cron_email', cron_email)
appGlobal.route('/logsnag_insights', logsnag_insights)
appGlobal.route('/on_channel_update', on_channel_update)
appGlobal.route('/on_user_create', on_user_create)
appGlobal.route('/on_user_update', on_user_update)
appGlobal.route('/on_user_delete', on_user_delete)
appGlobal.route('/on_version_create', on_version_create)
appGlobal.route('/on_version_update', on_version_update)
appGlobal.route('/on_version_delete', on_version_delete)
appGlobal.route('/on_manifest_create', on_manifest_create)
appGlobal.route('/stripe_event', stripe_event)
appGlobal.route('/cron_stats', cron_stats)
appGlobal.route('/cron_plan', cron_plan)
appGlobal.route('/on_deploy_history_create', on_deploy_history_create)

export default handle(appGlobal as any)
