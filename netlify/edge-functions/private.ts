import { handle } from 'https://deno.land/x/hono@v4.0.0/adapter/netlify/mod.ts'
import { Hono } from 'hono/tiny'

import { app as plans } from '../../supabase/functions/_backend/private/webapps/plans.ts'
import { app as storeTop } from '../../supabase/functions/_backend/private/webapps/store_top.ts'
import { app as publicStats } from '../../supabase/functions/_backend/private/webapps/public_stats.ts'
import { app as config } from '../../supabase/functions/_backend/private/webapps/config.ts'
import { app as dashboard } from '../../supabase/functions/_backend/private/webapps/dashboard.ts'
import { app as download_link } from '../../supabase/functions/_backend/private/webapps/download_link.ts'
import { app as log_as } from '../../supabase/functions/_backend/private/webapps/log_as.ts'
import { app as stripe_checkout } from '../../supabase/functions/_backend/private/webapps/stripe_checkout.ts'
import { app as stripe_portal } from '../../supabase/functions/_backend/private/webapps/stripe_portal.ts'
import { app as upload_link } from '../../supabase/functions/_backend/private/webapps/upload_link.ts'
import { app as devices_priv } from '../../supabase/functions/_backend/private/webapps/devices.ts'
import { app as stats_priv } from '../../supabase/functions/_backend/private/webapps/stats.ts'

const functionName = 'private'
const appGlobal = new Hono().basePath(`/${functionName}`)

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

export default handle(appGlobal as any)
