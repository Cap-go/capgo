import { app } from './_backend/private/plugins/updates.ts'

Deno.serve(app.fetch)
