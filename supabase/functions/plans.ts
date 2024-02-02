import { app } from './_backend/private/webapps/plans.ts'

Deno.serve(app.fetch)
