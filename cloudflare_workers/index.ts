import { Hono } from 'hono/tiny'

// Public API
import { app as ok } from '../supabase/functions/_backend/public/ok.ts'
import { app as bundle } from '../supabase/functions/_backend/public/bundles.ts'
import { app as devices } from '../supabase/functions/_backend/public/devices.ts'
import { app as channels } from '../supabase/functions/_backend/public/channel.ts'

// Plugin API
import { app as channel_self } from '../supabase/functions/_backend/plugins/channel_self.ts'
import { app as updates } from '../supabase/functions/_backend/plugins/updates.ts'
import { app as stats } from '../supabase/functions/_backend/plugins/stats.ts'
import { app as setCustomId } from '../supabase/functions/_backend/plugins/custom_ids.ts'

// Private API
import { app as plans } from '../supabase/functions/_backend/private/plans.ts'
import { app as storeTop } from '../supabase/functions/_backend/private/store_top.ts'
import { app as publicStats } from '../supabase/functions/_backend/private/public_stats.ts'
import { app as config } from '../supabase/functions/_backend/private/config.ts'
import { app as dashboard } from '../supabase/functions/_backend/private/dashboard.ts'
import { app as download_link } from '../supabase/functions/_backend/private/download_link.ts'
import { app as log_as } from '../supabase/functions/_backend/private/log_as.ts'
import { app as stripe_checkout } from '../supabase/functions/_backend/private/stripe_checkout.ts'
import { app as stripe_portal } from '../supabase/functions/_backend/private/stripe_portal.ts'
import { app as upload_link } from '../supabase/functions/_backend/private/upload_link.ts'
import { app as deleted_failed_version } from '../supabase/functions/_backend/private/delete_failed_version.ts'
import { app as devices_priv } from '../supabase/functions/_backend/private/devices.ts'
import { app as stats_priv } from '../supabase/functions/_backend/private/stats.ts'

// Triggers API
import { app as clear_app_cache } from '../supabase/functions/_backend/triggers/clear_app_cache.ts'
import { app as clear_device_cache } from '../supabase/functions/_backend/triggers/clear_device_cache.ts'
import { app as cron_email } from '../supabase/functions/_backend/triggers/cron_email.ts'
import { app as cron_good_plan } from '../supabase/functions/_backend/triggers/cron_good_plan.ts'
import { app as cron_scrapper } from '../supabase/functions/_backend/triggers/cron_scrapper.ts'
import { app as logsnag_insights } from '../supabase/functions/_backend/triggers/logsnag_insights.ts'
import { app as on_channel_update } from '../supabase/functions/_backend/triggers/on_channel_update.ts'
import { app as on_user_create } from '../supabase/functions/_backend/triggers/on_user_create.ts'
import { app as on_user_update } from '../supabase/functions/_backend/triggers/on_user_update.ts'
import { app as on_user_delete } from '../supabase/functions/_backend/triggers/on_user_delete.ts'
import { app as on_version_create } from '../supabase/functions/_backend/triggers/on_version_create.ts'
import { app as on_version_update } from '../supabase/functions/_backend/triggers/on_version_update.ts'
import { app as on_version_delete } from '../supabase/functions/_backend/triggers/on_version_delete.ts'
import { app as stripe_event } from '../supabase/functions/_backend/triggers/stripe_event.ts'
import { app as get_total_stats } from '../supabase/functions/_backend/triggers/get_total_stats.ts'
// import { app as testAnalytics } from '../supabase/functions/_backend/private/test.ts'
import { Bindings } from 'supabase/functions/_backend/utils/cloudflare.ts'

const app = new Hono<{ Bindings: Bindings }>()
const appTriggers = new Hono<{ Bindings: Bindings }>()
const appFront = new Hono<{ Bindings: Bindings }>()

// Public API
app.route('/ok', ok)
app.route('/bundle', bundle)
app.route('/channels', channels) // TODO: deprecated remove when everyone use the new endpoint
app.route('/channel', channels)
app.route('/device', devices)

// Plugin API
app.route('/channel_self', channel_self)
app.route('/updates', updates)
app.route('/updates_debug', updates)
app.route('/stats', stats)
app.route('/set_custom_id', setCustomId)

// Private API
appFront.route('/plans', plans)
appFront.route('/store_top', storeTop)
appFront.route('/website_stats', publicStats)
appFront.route('/config', config)
appFront.route('/dashboard', dashboard)
appFront.route('/devices', devices_priv)
appFront.route('/download_link', download_link)
appFront.route('/log_as', log_as)
appFront.route('/stats', stats_priv)
appFront.route('/stripe_checkout', stripe_checkout)
appFront.route('/stripe_portal', stripe_portal)
appFront.route('/upload_link', upload_link)
appFront.route('/delete_failed_version', deleted_failed_version)

// Triggers

appTriggers.route('/clear_app_cache', clear_app_cache)
appTriggers.route('/clear_device_cache', clear_device_cache)
appTriggers.route('/cron_email', cron_email)
appTriggers.route('/cron_good_plan', cron_good_plan)
appTriggers.route('/cron_scrapper', cron_scrapper)
appTriggers.route('/logsnag_insights', logsnag_insights)
appTriggers.route('/on_channel_update', on_channel_update)
appTriggers.route('/on_user_create', on_user_create)
appTriggers.route('/on_user_update', on_user_update)
appTriggers.route('/on_user_delete', on_user_delete)
appTriggers.route('/on_version_create', on_version_create)
appTriggers.route('/on_version_update', on_version_update)
appTriggers.route('/on_version_delete', on_version_delete)
appTriggers.route('/stripe_event', stripe_event)
appTriggers.route('/get_total_stats', get_total_stats)


app.route('/triggers', appTriggers)
app.route('/private', appFront)
// app.route('/test', testAnalytics)

export default app
