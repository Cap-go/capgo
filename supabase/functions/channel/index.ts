import { Hono } from 'hono/tiny'
import { app } from '../_backend/public/channel.ts'

const functionName = 'channel'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
