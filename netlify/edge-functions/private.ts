import { sentry } from '@hono/sentry'
import { handle } from 'https://deno.land/x/hono@v4.4.3/adapter/netlify/mod.ts'
import { Hono } from 'hono/tiny'

import { app as plans } from '../../supabase/functions/_backend/private/plans.ts'
import { app as storeTop } from '../../supabase/functions/_backend/private/store_top.ts'
import { app as publicStats } from '../../supabase/functions/_backend/private/public_stats.ts'
import { app as config } from '../../supabase/functions/_backend/private/config.ts'
import { app as download_link } from '../../supabase/functions/_backend/private/download_link.ts'
import { app as log_as } from '../../supabase/functions/_backend/private/log_as.ts'
import { app as stripe_checkout } from '../../supabase/functions/_backend/private/stripe_checkout.ts'
import { app as stripe_portal } from '../../supabase/functions/_backend/private/stripe_portal.ts'
import { app as upload_link } from '../../supabase/functions/_backend/private/upload_link.ts'
import { app as devices_priv } from '../../supabase/functions/_backend/private/devices.ts'
import { app as stats_priv } from '../../supabase/functions/_backend/private/stats.ts'
import { app as latency } from '../../supabase/functions/_backend/private/latency.ts'
import { app as latency_drizzle } from '../../supabase/functions/_backend/private/latency_drizzle.ts'
import { app as latency_postres } from '../../supabase/functions/_backend/private/latency_postres.ts'

const functionName = 'private'
const appGlobal = new Hono().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_NETLIFY')
if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: sentryDsn,
  }))
}
// Webapps API

appGlobal.route('/plans', plans)
appGlobal.route('/store_top', storeTop)
appGlobal.route('/website_stats', publicStats)
appGlobal.route('/config', config)
appGlobal.route('/devices', devices_priv)
appGlobal.route('/download_link', download_link)
appGlobal.route('/log_as', log_as)
appGlobal.route('/stats', stats_priv)
appGlobal.route('/stripe_checkout', stripe_checkout)
appGlobal.route('/stripe_portal', stripe_portal)
appGlobal.route('/upload_link', upload_link)
appGlobal.route('/latency', latency)
appGlobal.route('/latency_drizzle', latency_drizzle)
appGlobal.route('/latency_postres', latency_postres)

export default handle(appGlobal as any)
