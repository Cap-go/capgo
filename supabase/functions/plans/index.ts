import { app } from '../_backend/private/webapps/plans.ts'
import { Hono } from 'hono'

const functionName = 'plans'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)

