import { app as files } from '../_backend/files/files.ts'
import { app as preview } from '../_backend/files/preview.ts'

import { createAllCatch, createHono } from '../_backend/utils/hono.ts'
import { version } from '../_backend/utils/version.ts'

const functionName = 'files'
const appGlobal = createHono(functionName, version, Deno.env.get('SENTRY_DSN_SUPABASE'))

appGlobal.route('/', files)
appGlobal.route('/preview', preview)
createAllCatch(appGlobal, functionName)
Deno.serve(appGlobal.fetch)
