import { app } from '../_backend/private/plugins/updates.ts'
import { Hono } from 'hono'

const functionName = 'updates'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
