import { Hono } from 'hono'
import { app } from '../_backend/private/webapps/plans.ts'

const functionName = 'plans'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
