import type { MiddlewareKeyVariables } from '../_backend/utils/hono.ts'
import { sentry } from '@hono/sentry'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'

import { Hono } from 'hono/tiny'
import { app as config } from '../_backend/private/config.ts'
import { app as create_device } from '../_backend/private/create_device.ts'
import { app as deleted_failed_version } from '../_backend/private/delete_failed_version.ts'
import { app as devices_priv } from '../_backend/private/devices.ts'
import { app as download_link } from '../_backend/private/download_link.ts'
import { app as events } from '../_backend/private/events.ts'
import { app as latency } from '../_backend/private/latency.ts'
import { app as latency_drizzle } from '../_backend/private/latency_drizzle.ts'
import { app as latency_postres } from '../_backend/private/latency_postres.ts'
import { app as log_as } from '../_backend/private/log_as.ts'
// Webapps API
import { app as plans } from '../_backend/private/plans.ts'
import { app as publicStats } from '../_backend/private/public_stats.ts'
import { app as set_org_email } from '../_backend/private/set_org_email.ts'
import { app as stats_priv } from '../_backend/private/stats.ts'
import { app as storeTop } from '../_backend/private/store_top.ts'
import { app as stripe_checkout } from '../_backend/private/stripe_checkout.ts'
import { app as stripe_portal } from '../_backend/private/stripe_portal.ts'
import { app as upload_link } from '../_backend/private/upload_link.ts'
import { sendDiscordAlert } from '../_backend/utils/discord.ts'
import { backgroundTask } from '../_backend/utils/utils.ts'

const functionName = 'private'
const appGlobal = new Hono<MiddlewareKeyVariables>().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_SUPABASE')
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
appGlobal.route('/create_device', create_device)
appGlobal.route('/download_link', download_link)
appGlobal.route('/log_as', log_as)
appGlobal.route('/stats', stats_priv)
appGlobal.route('/stripe_checkout', stripe_checkout)
appGlobal.route('/stripe_portal', stripe_portal)
appGlobal.route('/upload_link', upload_link)
appGlobal.route('/delete_failed_version', deleted_failed_version)
appGlobal.route('/set_org_email', set_org_email)
appGlobal.route('/latency', latency)
appGlobal.route('/latency_drizzle', latency_drizzle)
appGlobal.route('/latency_postres', latency_postres)
appGlobal.route('/events', events)
appGlobal.all('*', (c) => {
  console.log('Not found', c.req.url)
  return c.json({ error: 'Not Found' }, 404)
})
appGlobal.onError(async (e, c) => {
  console.log('app onError', e)
  c.get('sentry')?.captureException(e)
  if (e instanceof HTTPException) {
    console.log('HTTPException found', e.status)
    if (e.status === 429) {
      return c.json({ error: 'you are beeing rate limited' }, e.status)
    }
    return c.json({ status: 'Internal Server Error', response: e.getResponse(), error: JSON.stringify(e), message: e.message }, e.status)
  }
  await backgroundTask(c as any, sendDiscordAlert(c as any, {
    content: `Function: ${functionName}`,
    embeds: [
      {
        title: `Failed to process ${functionName}`,
        description: `Function: ${functionName}`,
        fields: [
          {
            name: 'Error',
            value: JSON.stringify(e),
          },
        ],
      },
    ],
  }))
  return c.json({ status: 'Internal Server Error', error: JSON.stringify(e), message: e.message }, 500)
})
Deno.serve(appGlobal.fetch)
