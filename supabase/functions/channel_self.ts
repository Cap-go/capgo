import { app } from './_backend/private/plugins/channel_self.ts'

Deno.serve(app.fetch)
