import { app } from '../backend/public/ok.ts'

Deno.serve(app.fetch)
