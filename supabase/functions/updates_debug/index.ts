import { Hono } from 'hono/tiny'
import { app } from '../_backend/plugins/updates.ts'

const functionName = 'updates_debug'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
