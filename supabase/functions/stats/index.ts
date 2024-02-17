import { Hono } from 'hono/tiny'
import { app } from '../_backend/private/plugins/stats.ts'

const functionName = 'stats'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
