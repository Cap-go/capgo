import { app } from '../_backend/private/plugins/stats.ts'
import { Hono } from 'hono'

const functionName = 'stats'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
