import { app } from './_backend/private/webapps/public_stats.ts'

Deno.serve(app.fetch)
