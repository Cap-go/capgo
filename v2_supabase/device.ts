import { app } from '../backend/public/devices.ts'

Deno.serve(app.fetch)
