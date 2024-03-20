import { Hono } from 'hono/tiny'

// Public API
import { app as ok } from '../supabase/functions/_backend/public/ok.ts'
import { app as bundle } from '../supabase/functions/_backend/public/bundles.ts'
import { app as devices } from '../supabase/functions/_backend/public/devices.ts'
import { app as channels } from '../supabase/functions/_backend/public/channels.ts'

// Plugin API
import { app as channel_self } from '../supabase/functions/_backend/private/plugins/channel_self.ts'
import { app as updates } from '../supabase/functions/_backend/private/plugins/updates.ts'
import { app as stats } from '../supabase/functions/_backend/private/plugins/stats.ts'
import { app as setCustomId } from '../supabase/functions/_backend/private/plugins/custom_ids.ts'

// Webapps API
import { app as plans } from '../supabase/functions/_backend/private/webapps/plans.ts'
import { app as storeTop } from '../supabase/functions/_backend/private/webapps/store_top.ts'
import { app as publicStats } from '../supabase/functions/_backend/private/webapps/public_stats.ts'
import { app as config } from '../supabase/functions/_backend/private/webapps/config.ts'
import { app as dashboard } from '../supabase/functions/_backend/private/webapps/dashboard.ts'
import { app as download_link } from '../supabase/functions/_backend/private/webapps/download_link.ts'
import { app as log_as } from '../supabase/functions/_backend/private/webapps/log_as.ts'
import { app as stripe_checkout } from '../supabase/functions/_backend/private/webapps/stripe_checkout.ts'
import { app as stripe_portal } from '../supabase/functions/_backend/private/webapps/stripe_portal.ts'
import { app as upload_link } from '../supabase/functions/_backend/private/webapps/upload_link.ts'
import { app as devices_priv } from '../supabase/functions/_backend/private/webapps/devices.ts'
import { app as stats_priv } from '../supabase/functions/_backend/private/webapps/stats.ts'

// Triggers API
import { app as clear_app_cache } from '../supabase/functions/_backend/private/triggers/clear_app_cache.ts'
import { app as clear_device_cache } from '../supabase/functions/_backend/private/triggers/clear_device_cache.ts'
import { app as cron_email } from '../supabase/functions/_backend/private/triggers/cron_email.ts'
import { app as cron_good_plan } from '../supabase/functions/_backend/private/triggers/cron_good_plan.ts'
import { app as cron_scrapper } from '../supabase/functions/_backend/private/triggers/cron_scrapper.ts'
import { app as logsnag_insights } from '../supabase/functions/_backend/private/triggers/logsnag_insights.ts'
import { app as on_channel_update } from '../supabase/functions/_backend/private/triggers/on_channel_update.ts'
import { app as on_user_create } from '../supabase/functions/_backend/private/triggers/on_user_create.ts'
import { app as on_user_update } from '../supabase/functions/_backend/private/triggers/on_user_update.ts'
import { app as on_user_delete } from '../supabase/functions/_backend/private/triggers/on_user_delete.ts'
import { app as on_version_create } from '../supabase/functions/_backend/private/triggers/on_version_create.ts'
import { app as on_version_update } from '../supabase/functions/_backend/private/triggers/on_version_update.ts'
import { app as on_version_delete } from '../supabase/functions/_backend/private/triggers/on_version_delete.ts'
import { app as stripe_event } from '../supabase/functions/_backend/private/triggers/stripe_event.ts'
import { app as get_total_stats } from '../supabase/functions/_backend/private/triggers/get_total_stats.ts'


const app = new Hono()
const appTriggers = new Hono()
const appFront = new Hono()

// Public API
app.route('/ok', ok)
app.route('/bundle', bundle)
app.route('/channels', channels)
app.route('/device', devices)

// Plugin API
app.route('/channel_self', channel_self)
app.route('/updates', updates)
// if endpoind fail in cloudflare, use this
// app.post('/updates', async (c) => {
//   // TODO remove temporary fix until we find why this is not working
//   const body = await c.req.json()
//   const response = await ky.post('https://xvwzpoazmxkqosrdewyv.supabase.co/functions/v1/updates', { json: body })
//   const data = await response.json()
//   return c.json(data)
// })
app.route('/updates_debug', updates)
app.route('/stats', stats)
app.route('/set_custom_id', setCustomId)
app.route('/get_config', config) // TODO: deprecated remove when everyone use the new CLI
app.route('/upload_link', upload_link) // TODO: deprecated remove when everyone use the new CLI

// PRIVATE API
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

export default app
