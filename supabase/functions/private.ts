import { Hono } from 'https://deno.land/x/hono/mod.ts'

// Webapps API
import { app as plans } from './_backend/private/webapps/plans.ts'
import { app as storeTop } from './_backend/private/webapps/store_top.ts'
import { app as publicStats } from './_backend/private/webapps/public_stats.ts'
import { app as config } from './_backend/private/webapps/config.ts'
import { app as dashboard } from './_backend/private/webapps/dashboard.ts'
import { app as download_link } from './_backend/private/webapps/download_link.ts'
import { app as log_as } from './_backend/private/webapps/log_as.ts'
import { app as stripe_checkout } from './_backend/private/webapps/stripe_checkout.ts'
import { app as stripe_portal } from './_backend/private/webapps/stripe_portal.ts'
import { app as upload_link } from './_backend/private/webapps/upload_link.ts'
import { app as devices_priv } from './_backend/private/webapps/devices.ts'
import { app as stats_priv } from './_backend/private/webapps/stats.ts'

const app = new Hono()

// Webapps API

app.route('/plans', plans)
app.route('/store_top', storeTop)
app.route('/website_stats', publicStats)
app.route('/config', config)
app.route('/dashboard', dashboard)
app.route('/devices', devices_priv)
app.route('/download_link', download_link)
app.route('/log_as', log_as)
app.route('/stats', stats_priv)
app.route('/stripe_checkout', stripe_checkout)
app.route('/stripe_portal', stripe_portal)
app.route('/upload_link', upload_link)

Deno.serve(app.fetch)
