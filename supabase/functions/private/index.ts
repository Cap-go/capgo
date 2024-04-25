import { Hono } from 'hono/tiny'
import { sentry } from '@hono/sentry'

// Webapps API
import { app as plans } from '../_backend/private/plans.ts'
import { app as storeTop } from '../_backend/private/store_top.ts'
import { app as publicStats } from '../_backend/private/public_stats.ts'
import { app as config } from '../_backend/private/config.ts'
import { app as dashboard } from '../_backend/private/dashboard.ts'
import { app as download_link } from '../_backend/private/download_link.ts'
import { app as log_as } from '../_backend/private/log_as.ts'
import { app as stripe_checkout } from '../_backend/private/stripe_checkout.ts'
import { app as stripe_portal } from '../_backend/private/stripe_portal.ts'
import { app as upload_link } from '../_backend/private/upload_link.ts'
import { app as deleted_failed_version } from '../_backend/private/delete_failed_version.ts'
import { app as devices_priv } from '../_backend/private/devices.ts'
import { app as stats_priv } from '../_backend/private/stats.ts'
import { app as get_total_stats } from '../_backend/triggers/get_total_stats.ts'
import { app as set_org_email } from '../_backend/private/set_org_email.ts'

const functionName = 'private'
const appGlobal = new Hono().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_SUPABASE')
if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: Deno.env.get('SENTRY_DSN_SUPABASE'),
  }))
}
// Webapps API

appGlobal.route('/plans', plans)
appGlobal.route('/store_top', storeTop)
appGlobal.route('/website_stats', publicStats)
appGlobal.route('/config', config)
appGlobal.route('/dashboard', dashboard)
appGlobal.route('/devices', devices_priv)
appGlobal.route('/download_link', download_link)
appGlobal.route('/log_as', log_as)
appGlobal.route('/stats', stats_priv)
appGlobal.route('/stripe_checkout', stripe_checkout)
appGlobal.route('/stripe_portal', stripe_portal)
appGlobal.route('/upload_link', upload_link)
appGlobal.route('/delete_failed_version', deleted_failed_version)
appGlobal.route('/get_total_stats', get_total_stats)
appGlobal.route('/set_org_email', set_org_email)

Deno.serve(appGlobal.fetch)
