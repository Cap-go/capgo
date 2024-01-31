import { Hono } from 'hono'
import type { Context } from 'hono'
import { middlewareKey } from '../../_utils/hono.ts'
import { supabaseAdmin } from '../../_utils/supabase.ts'
// website_stats

export const app = new Hono()

app.post('/', middlewareKey, async (c: Context) => {
  try {
    const date_id = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabaseAdmin(c)
      .from('global_stats')
      .select()
      .eq('date_id', date_id)
      .single()
    if (data && !error)
      return c.json(data)
    console.log('Supabase error:', error)
    return c.json({
      apps: 750,
      updates: 23500638,
      stars: 358,
    })
  } catch (e) {
    return c.json({ status: 'Cannot get public stats', error: JSON.stringify(e) }, 500) 
  }
})
