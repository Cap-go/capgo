import { app } from '../_backend/private/plugins/channel_self.ts'
import { Hono } from 'hono'

const functionName = 'channel_self'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
