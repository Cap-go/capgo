import { app } from '../backend/public/channels.ts'

Deno.serve(app.fetch)
