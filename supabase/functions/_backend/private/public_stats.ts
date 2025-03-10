import { useCors } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { Hono } from 'hono/tiny'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.get('/', async (c) => {
  try {
    const date_id = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabaseAdmin(c as any)
      .from('global_stats')
      .select()
      .eq('date_id', date_id)
      .single()
    if (data && !error) {
      return c.json({
        apps: data.apps,
        updates: (data.updates_last_month ?? 0) + (data.updates_external ?? 0),
        stars: data.stars,
      })
    }
    console.log({ requestId: c.get('requestId'), context: 'Supabase error:', error })
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
