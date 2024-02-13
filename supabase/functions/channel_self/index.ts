import { Hono } from 'hono'
import { app } from '../_backend/private/plugins/channel_self.ts'

const functionName = 'channel_self'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
