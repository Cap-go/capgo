import { handle } from 'https://deno.land/x/hono@v4.0.0/adapter/netlify/mod.ts'
import { Hono } from 'hono/tiny'

import { app as topApk } from '../../supabase/functions/_backend/private/scrapping/top_apk.ts'
import { app as similarApps } from '../../supabase/functions/_backend/private/scrapping/similar_apps.ts'
import { app as framework } from '../../supabase/functions/_backend/private/scrapping/framework.ts'
import { app as storeInfo } from '../../supabase/functions/_backend/private/scrapping/store_info.ts'

const functionName = 'scrapping'
const appGlobal = new Hono().basePath(`/${functionName}`)

// Scrapping API

appGlobal.route('/top_apk', topApk)
appGlobal.route('similar_apps', similarApps)
appGlobal.route('framework', framework)
appGlobal.route('store_info', storeInfo)

export default handle(appGlobal as any)
