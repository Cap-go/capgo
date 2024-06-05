import { sentry } from '@hono/sentry'
import { Hono } from 'hono/tiny'

// Scrapping API

import { app as topApk } from '../_backend/scrapping/top_apk.ts'
import { app as similarApps } from '../_backend/scrapping/similar_apps.ts'
import { app as framework } from '../_backend/scrapping/framework.ts'
import { app as storeInfo } from '../_backend/scrapping/store_info.ts'

const functionName = 'scrapping'
const appGlobal = new Hono().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_SUPABASE')
if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: sentryDsn,
  }))
}

// Scrapping API

appGlobal.route('/top_apk', topApk)
appGlobal.route('similar_apps', similarApps)
appGlobal.route('framework', framework)
appGlobal.route('store_info', storeInfo)

Deno.serve(appGlobal.fetch)
