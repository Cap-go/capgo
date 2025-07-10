import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.get('/', async (c) => {
  const date_id = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabaseAdmin(c)
    .from('global_stats')
    .select()
    .eq('date_id', date_id)
    .single()
  if (data && !error) {
    return c.json({
      apps: data.apps,
      updates: (data.updates ?? 0) + (data.updates_external ?? 0),
      stars: data.stars,
    })
  }
  cloudlog({ requestId: c.get('requestId'), message: 'Supabase error:', error })
  return c.json({
    apps: 1688,
    updates: 1862788600,
    stars: 595,
  })
})
