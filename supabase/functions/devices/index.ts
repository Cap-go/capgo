import { app } from '../_backend/public/bundles.ts'
import { Hono } from 'hono'

const functionName = 'devices'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)

