import { Hono } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import type { Context } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import { BRES, middlewareAPISecret } from '../../_utils/hono.ts';
import { DeletePayload } from '../../_utils/supabase.ts';
import { Database } from '../../_utils/supabase.types.ts';

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const table: keyof Database['public']['Tables'] = 'users'
    const body = await c.req.json<DeletePayload<typeof table>>()
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'DELETE') {
      console.log('Not DELETE')
      return c.json({ status: 'Not DELETE' }, 200)
    }
    const record = body.record
    console.log('record', record)
    // delete all user org
    // delete all apps from org
    // delete stripe customer
    return c.json(BRES)
  } catch (e) {
    return c.json({ status: 'Cannot process user', error: JSON.stringify(e) }, 500)
  }
})
