import { handle } from 'https://deno.land/x/hono@v4.0.0-rc.3/adapter/netlify/mod.ts'
import { app } from '../backend/public/bundles.ts'

export default handle(app as any)
