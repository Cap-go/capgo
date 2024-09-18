import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { useCors } from '../utils/hono.ts'
import { getEnv } from '../utils/utils.ts'

export const app = new Hono()

app.use('/', useCors)

app.get('/', (c: Context) => {
  try {
    return c.json({
      supaHost: getEnv(c, 'SUPABASE_URL'),
      supbaseId: getEnv(c, 'SUPABASE_URL')?.split('//')[1].split('.')[0].split(':')[0],
      supaKey: getEnv(c, 'SUPABASE_ANON_KEY'),
    })
  }
  catch (e) {
    return c.json({ status: 'Cannot get config', error: JSON.stringify(e) }, 500)
  }
})
