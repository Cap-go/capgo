import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { useCors } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

// website_stats

export const app = new Hono()

app.use('/', useCors)

app.get('/', async (c: Context) => {
  try {
    const date_id = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabaseAdmin(c)
      .from('global_stats')
      .select()
      .eq('date_id', date_id)
      .single()
    if (data && !error)
      return c.json(data)
    console.log(c.get('requestId'), 'Supabase error:', error)
    return c.json({
      apps: 750,
      updates: 23500638,
      stars: 358,
    })
  }
  catch (e) {
    return c.json({ status: 'Cannot get public stats', error: JSON.stringify(e) }, 500)
  }
})
