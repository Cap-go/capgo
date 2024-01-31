import { Hono } from 'hono'

// Public API
import { app as ok } from '../backend/public/ok.ts'
import { app as bundle } from '../backend/public/bundles.ts'
import { app as devices } from '../backend/public/devices.ts'
import { app as channels } from '../backend/public/channels.ts'

// Plugin API
import { app as channel_self } from '../backend/private/plugins/channel_self.ts'
import { app as updates } from '../backend/private/plugins/updates.ts'
import { app as stats } from '../backend/private/plugins/stats.ts'

// Webapps API
import { app as plans } from '../backend/private/webapps/plans.ts'
import { app as storeTop } from '../backend/private/webapps/store_top.ts'
import { app as publicStats } from '../backend/private/webapps/public_stats.ts'
import { app as config } from '../backend/private/webapps/config.ts'
import { app as dashboard } from '../backend/private/webapps/dashboard.ts'
import { app as download_link } from '../backend/private/webapps/download_link.ts'
import { app as log_as } from '../backend/private/webapps/log_as.ts'
import { app as stripe_checkout } from '../backend/private/webapps/stripe_checkout.ts'
import { app as stripe_portal } from '../backend/private/webapps/stripe_portal.ts'
import { app as upload_link } from '../backend/private/webapps/upload_link.ts'
import { app as devices_priv } from '../backend/private/webapps/devices.ts'
import { app as stats_priv } from '../backend/private/webapps/stats.ts'

// Triggers API
import { app as clear_app_cache } from '../backend/private/triggers/clear_app_cache.ts'
import { app as clear_device_cache } from '../backend/private/triggers/clear_device_cache.ts'
import { app as cron_email } from '../backend/private/triggers/cron_email.ts'
import { app as cron_good_plan } from '../backend/private/triggers/cron_good_plan.ts'
import { app as cron_scrapper } from '../backend/private/triggers/cron_scrapper.ts'
import { app as logsnag_insights } from '../backend/private/triggers/logsnag_insights.ts'
import { app as on_channel_update } from '../backend/private/triggers/on_channel_update.ts'
import { app as on_user_create } from '../backend/private/triggers/on_user_create.ts'
import { app as on_user_update } from '../backend/private/triggers/on_user_update.ts'
import { app as on_user_delete } from '../backend/private/triggers/on_user_delete.ts'
import { app as on_version_create } from '../backend/private/triggers/on_version_create.ts'
import { app as on_version_update } from '../backend/private/triggers/on_version_update.ts'
import { app as on_version_delete } from '../backend/private/triggers/on_version_delete.ts'
import { app as stripe_event } from '../backend/private/triggers/stripe_event.ts'
import { app as test_consistency } from '../backend/private/triggers/test_consistency.ts'


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
app.route('/stats', stats)

// Webapps API
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
appTriggers.route('/test_consistency', test_consistency)

app.route('/triggers', appTriggers)
app.route('/private', appFront)

export default app
