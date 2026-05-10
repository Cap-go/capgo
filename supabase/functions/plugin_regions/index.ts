import { app } from '../_backend/public/plugin_regions.ts'
import { createAllCatch, createHono } from '../_backend/utils/hono.ts'
import { version } from '../_backend/utils/version.ts'

const functionName = 'plugin_regions'
const appGlobal = createHono(functionName, version)
appGlobal.route('/', app)

createAllCatch(appGlobal, functionName)

Deno.serve(appGlobal.fetch)
