import { app as files } from '../_backend/private/files.ts'
import { createAllCatch, createHono } from '../_backend/utils/hono.ts'
import { version } from '../_backend/utils/version.ts'

const functionName = 'files'
const appGlobal = createHono(functionName, version, Deno.env.get('SENTRY_DSN_SUPABASE'))

appGlobal.route('/', files)
createAllCatch(appGlobal, functionName)
Deno.serve(appGlobal.fetch)
