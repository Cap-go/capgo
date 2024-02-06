import { app } from '../_backend/public/devices.ts'
import { Hono } from 'hono'

const functionName = 'device'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)

