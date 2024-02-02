import { app } from './_backend/private/plugins/stats.ts'

Deno.serve(app.fetch)
