import { app } from '../backend/private/webapps/plans.ts'

Deno.serve(app.fetch)
