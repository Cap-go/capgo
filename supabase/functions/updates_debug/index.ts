import { app } from '../_backend/private/plugins/updates.ts'

const functionName = 'updates_debug'

Deno.serve(app.basePath(`/${functionName}`).fetch)
