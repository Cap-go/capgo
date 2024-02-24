import { handle } from 'https://deno.land/x/hono@v4.0.0/adapter/netlify/mod.ts'
import { Hono } from 'hono/tiny'

// Triggers API
import { app as clear_app_cache } from '../../supabase/functions/_backend/private/triggers/clear_app_cache.ts'
import { app as clear_device_cache } from '../../supabase/functions/_backend/private/triggers/clear_device_cache.ts'
import { app as cron_email } from '../../supabase/functions/_backend/private/triggers/cron_email.ts'
import { app as cron_good_plan } from '../../supabase/functions/_backend/private/triggers/cron_good_plan.ts'
import { app as cron_scrapper } from '../../supabase/functions/_backend/private/triggers/cron_scrapper.ts'
import { app as logsnag_insights } from '../../supabase/functions/_backend/private/triggers/logsnag_insights.ts'
import { app as on_channel_update } from '../../supabase/functions/_backend/private/triggers/on_channel_update.ts'
import { app as on_user_create } from '../../supabase/functions/_backend/private/triggers/on_user_create.ts'
import { app as on_user_update } from '../../supabase/functions/_backend/private/triggers/on_user_update.ts'
import { app as on_user_delete } from '../../supabase/functions/_backend/private/triggers/on_user_delete.ts'
import { app as on_version_create } from '../../supabase/functions/_backend/private/triggers/on_version_create.ts'
import { app as on_version_update } from '../../supabase/functions/_backend/private/triggers/on_version_update.ts'
import { app as on_version_delete } from '../../supabase/functions/_backend/private/triggers/on_version_delete.ts'
import { app as stripe_event } from '../../supabase/functions/_backend/private/triggers/stripe_event.ts'
import { app as get_total_stats } from '../../supabase/functions/_backend/private/triggers/get_total_stats.ts'

const functionName = 'triggers'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/clear_app_cache', clear_app_cache)
appGlobal.route('/clear_device_cache', clear_device_cache)
appGlobal.route('/cron_email', cron_email)
appGlobal.route('/cron_good_plan', cron_good_plan)
appGlobal.route('/cron_scrapper', cron_scrapper)
appGlobal.route('/logsnag_insights', logsnag_insights)
appGlobal.route('/on_channel_update', on_channel_update)
appGlobal.route('/on_user_create', on_user_create)
appGlobal.route('/on_user_update', on_user_update)
appGlobal.route('/on_user_delete', on_user_delete)
appGlobal.route('/on_version_create', on_version_create)
appGlobal.route('/on_version_update', on_version_update)
appGlobal.route('/on_version_delete', on_version_delete)
appGlobal.route('/stripe_event', stripe_event)
appGlobal.route('/get_total_stats', get_total_stats)

export default handle(appGlobal as any)
