import { app } from './_backend/public/channels.ts'

Deno.serve(app.fetch)
