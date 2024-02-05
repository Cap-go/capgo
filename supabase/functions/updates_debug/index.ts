import { app } from '../_backend/private/plugins/updates.ts'
import { Hono } from 'npm:hono'

const functionName = 'updates_debug'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
