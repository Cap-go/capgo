import { Hono } from 'hono'
import { app } from '../_backend/private/webapps/public_stats.ts'

const functionName = 'webstie_stats'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
