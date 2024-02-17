import { Hono } from 'hono/tiny'
import { app } from '../_backend/private/plugins/updates.ts'

const functionName = 'updates'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
