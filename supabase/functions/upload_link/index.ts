import { Hono } from 'hono/tiny'
import { app } from '../_backend/private/upload_link.ts'

const functionName = 'upload_link'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
