import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, simpleError } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.get('/', async (c) => {
  const { data, error: dbError } = await supabaseAdmin(c)
    .from('apps')
    .select('id')
    .limit(1)
    .single()
  if (dbError || !data)
    throw simpleError('cannot_post_ok', 'Cannot post ok', { }, dbError)
  return c.json(BRES)
})
