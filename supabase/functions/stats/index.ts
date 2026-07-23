import { app } from '../_backend/plugins/stats.ts'
import { createAllCatch, createHono } from '../_backend/utils/hono.ts'
import { registerPluginStatsSbFallbacksForDeno } from '../_backend/utils/register_plugin_stats_sb_fallbacks.ts'
import { version } from '../_backend/utils/version.ts'

registerPluginStatsSbFallbacksForDeno()

const functionName = 'stats'
const appGlobal = createHono(functionName, version)

appGlobal.route('/', app)
createAllCatch(appGlobal, functionName)
Deno.serve(appGlobal.fetch)
