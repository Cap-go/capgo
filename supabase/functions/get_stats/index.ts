import { Hono } from 'hono/tiny'
import { app } from '../_backend/private/stats.ts'

// DEPRECATED: This is a deprecated function. Please use the new function private/stats instead.
const functionName = 'get_stats'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
