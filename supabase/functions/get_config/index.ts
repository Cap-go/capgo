import { Hono } from 'hono/tiny'
import { app } from '../_backend/private/webapps/config.ts'

// TODO: deprecated remove when everyone use the new CLI
const functionName = 'get_config'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
