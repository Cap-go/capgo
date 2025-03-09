import { sentry } from '@hono/sentry'
import { logger } from 'hono/logger'
import { handle } from 'hono/netlify'
import { requestId } from 'hono/request-id'

import { honoFactory } from 'supabase/functions/_backend/utils/hono.ts'
import { app as config } from '../../supabase/functions/_backend/private/config.ts'
import { app as devices_priv } from '../../supabase/functions/_backend/private/devices.ts'
import { app as download_link } from '../../supabase/functions/_backend/private/download_link.ts'
import { app as latency } from '../../supabase/functions/_backend/private/latency.ts'
import { app as latency_drizzle } from '../../supabase/functions/_backend/private/latency_drizzle.ts'
import { app as latency_postres } from '../../supabase/functions/_backend/private/latency_postres.ts'
import { app as log_as } from '../../supabase/functions/_backend/private/log_as.ts'
import { app as plans } from '../../supabase/functions/_backend/private/plans.ts'
import { app as publicStats } from '../../supabase/functions/_backend/private/public_stats.ts'
import { app as stats_priv } from '../../supabase/functions/_backend/private/stats.ts'
import { app as storeTop } from '../../supabase/functions/_backend/private/store_top.ts'
import { app as stripe_checkout } from '../../supabase/functions/_backend/private/stripe_checkout.ts'
import { app as stripe_portal } from '../../supabase/functions/_backend/private/stripe_portal.ts'
import { app as upload_link } from '../../supabase/functions/_backend/private/upload_link.ts'

const functionName = 'private'
const appGlobal = honoFactory.createApp().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_NETLIFY')
if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: sentryDsn,
  }))
}

appGlobal.use('*', logger())
appGlobal.use('*', requestId())

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

export default handle(appGlobal)
