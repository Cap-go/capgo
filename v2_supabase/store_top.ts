import { app } from '../backend/private/webapps/store_top.ts'

Deno.serve(app.fetch)
