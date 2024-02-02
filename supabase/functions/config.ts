import { app } from './_backend/public/bundles.ts'

Deno.serve(app.fetch)
