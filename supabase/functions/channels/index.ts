import { Hono } from 'hono/tiny'
import { app } from '../_backend/public/channels.ts'

const functionName = 'channel'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)
// TODO: to remove when all migrated
Deno.serve(appGlobal.fetch)
