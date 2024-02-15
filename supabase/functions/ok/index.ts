import { Hono } from 'hono'
import { app } from '../_backend/public/ok.ts'

const functionName = 'ok'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
