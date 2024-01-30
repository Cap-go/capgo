import { app } from '../backend/public/bundles.ts'

Deno.serve(app.fetch)
