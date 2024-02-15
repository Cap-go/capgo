import { Hono } from 'hono'
import { app } from '../_backend/public/channels.ts'

const functionName = 'channel'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
