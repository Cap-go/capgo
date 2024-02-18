import { Hono } from 'hono/tiny'
import { app } from '../_backend/private/webapps/config.ts'

const functionName = 'get_config'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
