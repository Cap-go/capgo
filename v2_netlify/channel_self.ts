import { handle } from 'https://deno.land/x/hono@v4.0.0-rc.3/adapter/netlify/mod.ts'
import { app } from '../backend/private/plugins/channel_self.ts'

export default handle(app as any)
