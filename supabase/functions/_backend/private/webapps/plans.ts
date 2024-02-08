import { Hono } from 'hono'
import type { Context } from 'hono'
import { middlewareCors } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

export const app = new Hono()

app.get('/', middlewareCors, async (c: Context) => {
  try {
    const { data: plans } = await supabaseAdmin(c)
      .from('plans')
      .select()
      .order('price_m')
    return c.json(plans || [])
  }
  catch (e) {
    return c.json({ status: 'Cannot get plans', error: JSON.stringify(e) }, 500)
  }
})
