import { app } from '../_backend/public/bundle/index.ts'
import { createAllCatch, createHono } from '../_backend/utils/hono.ts'
import { version } from '../_backend/utils/version.ts'

const functionName = 'bundle'
const appGlobal = createHono(functionName, version, Deno.env.get('SENTRY_DSN_SUPABASE'))

appGlobal.route('/', app)
createAllCatch(appGlobal, functionName)
Deno.serve(appGlobal.fetch)
