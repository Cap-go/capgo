import { app } from './_backend/private/webapps/store_top.ts'

Deno.serve(app.fetch)
