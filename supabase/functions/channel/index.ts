import { app } from '../_backend/public/channels.ts'
import { Hono } from 'hono'

const functionName = 'channel'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
