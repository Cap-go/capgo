import { app } from '../backend/private/webapps/public_stats.ts'

Deno.serve(app.fetch)
