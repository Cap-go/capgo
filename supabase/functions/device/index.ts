import { Hono } from 'hono/tiny'
import { app } from '../_backend/public/devices.ts'

const functionName = 'device'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
