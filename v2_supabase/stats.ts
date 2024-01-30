import { app } from '../backend/private/plugins/stats.ts'

Deno.serve(app.fetch)
