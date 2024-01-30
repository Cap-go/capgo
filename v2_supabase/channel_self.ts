import { app } from '../backend/private/plugins/channel_self.ts'

Deno.serve(app.fetch)
