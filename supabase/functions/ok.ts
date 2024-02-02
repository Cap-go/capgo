import { app } from './_backend/public/ok.ts'

Deno.serve(app.fetch)
