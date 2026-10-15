import { app as register } from '../_backend/auth/register.ts'
import { app as apple } from '../_backend/auth/apple.ts'
import { app as google } from '../_backend/auth/google.ts'
import { createAllCatch, createHono } from '../_backend/utils/hono.ts'
import { version } from '../_backend/utils/version.ts'

const functionName = 'auth'
const appGlobal = createHono(functionName, version)

appGlobal.route('/register', register)
appGlobal.route('/apple', apple)
appGlobal.route('/google', google)
createAllCatch(appGlobal, functionName)
Deno.serve(appGlobal.fetch)
