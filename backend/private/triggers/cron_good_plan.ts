// @transform node import 'hono' to deno 'npm:hono'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { BRES, middlewareAPISecret } from '../../_utils/hono.ts';
import { supabaseAdmin } from '../../_utils/supabase.ts';


export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const { data: users } = await supabaseAdmin(c)
      .from('users')
      .select()

    if (!users || !users.length)
      return c.json({ status: 'error', message: 'no apps' })
    const all = []
    for (const user of users) {
      all.push(supabaseAdmin(c)
        .from('users')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', user.id))
    }
    await Promise.all(all)
    return c.json(BRES)
  } catch (e) {
    return c.json({ status: 'Cannot process googd plan', error: JSON.stringify(e) }, 500)
  }
})
