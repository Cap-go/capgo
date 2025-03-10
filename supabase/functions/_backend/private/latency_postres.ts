import { Hono } from 'hono/tiny'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { BRES } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.get('/', async (c) => {
  try {
    const { data, error: dbError } = await supabaseAdmin(c as any)
      .from('apps')
      .select('id')
      .limit(1)
      .single()
    if (dbError || !data)
      return c.json({ status: 'Cannot post ok', error: JSON.stringify(dbError) }, 400)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot post ok', error: JSON.stringify(e) }, 500)
  }
})
