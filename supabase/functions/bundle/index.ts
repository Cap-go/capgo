import { Hono } from 'hono/tiny'
import { app } from '../_backend/public/bundles.ts'

const functionName = 'bundle'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
