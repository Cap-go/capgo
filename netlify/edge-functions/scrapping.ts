import { sentry } from '@hono/sentry'
import { logger } from 'hono/logger'
import { handle } from 'hono/netlify'
import { requestId } from 'hono/request-id'
import { Hono } from 'hono/tiny'

import { app as framework } from '../../supabase/functions/_backend/scrapping/framework.ts'
import { app as similarApps } from '../../supabase/functions/_backend/scrapping/similar_apps.ts'
import { app as storeInfo } from '../../supabase/functions/_backend/scrapping/store_info.ts'
import { app as topApk } from '../../supabase/functions/_backend/scrapping/top_apk.ts'

const functionName = 'scrapping'
const appGlobal = new Hono().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_NETLIFY')
if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: sentryDsn,
  }))
}

appGlobal.use('*', logger())
appGlobal.use('*', requestId())

// Scrapping API

appGlobal.route('/top_apk', topApk)
appGlobal.route('similar_apps', similarApps)
appGlobal.route('framework', framework)
appGlobal.route('store_info', storeInfo)

export default handle(appGlobal as any)
