import { Hono } from 'hono/tiny'
import { app } from '../_backend/private/webapps/partial_upload.ts'

// TODO: deprecated remove when everyone use the new CLI
const functionName = 'partial_upload'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
