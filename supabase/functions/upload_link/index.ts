import { Hono } from 'hono'
import { app } from '../_backend/private/webapps/upload_link.ts'

const functionName = 'ok'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
