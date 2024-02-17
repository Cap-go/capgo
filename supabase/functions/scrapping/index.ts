import { Hono } from 'hono/tiny'

// Scrapping API

import { app as topApk } from '../_backend/private/scrapping/top_apk.ts'
import { app as similarApps } from '../_backend/private/scrapping/similar_apps.ts'
import { app as framework } from '../_backend/private/scrapping/framework.ts'
import { app as storeInfo } from '../_backend/private/scrapping/store_info.ts'

const functionName = 'scrapping'
const appGlobal = new Hono().basePath(`/${functionName}`)

// Scrapping API

appGlobal.route('/top_apk', topApk)
appGlobal.route('similar_apps', similarApps)
appGlobal.route('framework', framework)
appGlobal.route('store_info', storeInfo)

Deno.serve(appGlobal.fetch)
