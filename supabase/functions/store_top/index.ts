import { Hono } from 'hono'
import { app } from '../_backend/private/webapps/store_top.ts'

const functionName = 'store_top'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
