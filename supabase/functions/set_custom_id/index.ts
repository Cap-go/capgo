import { Hono } from 'hono/tiny'
import { app } from '../_backend/plugins/custom_ids.ts'

const functionName = 'set_custom_id'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
