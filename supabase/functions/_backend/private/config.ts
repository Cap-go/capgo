import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { useCors } from '../utils/hono.ts'
import { getEnv } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.get('/', (c) => {
  return c.json({
    supaHost: getEnv(c, 'SUPABASE_URL'),
    supbaseId: getEnv(c, 'SUPABASE_URL')?.split('//')[1].split('.')[0].split(':')[0],
    supaKey: getEnv(c, 'SUPABASE_ANON_KEY'),
  })
})
