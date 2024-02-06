import { app } from '../_backend/public/ok.ts'
import { Hono } from 'hono'

const functionName = 'ok'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)

