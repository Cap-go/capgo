import { app } from './_backend/public/devices.ts'

Deno.serve(app.fetch)
