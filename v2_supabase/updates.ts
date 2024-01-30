import { app } from '../backend/private/plugins/updates.ts'

Deno.serve(app.fetch)
