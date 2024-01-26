import { Hono } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import type { Context } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import { getEnv } from '../../_utils/utils.ts'

export const app = new Hono()

app.get('/', (c: Context) => {
  try {
    return c.json({
      supaHost: getEnv(c, 'SUPABASE_URL'),
      supbaseId: getEnv(c, 'SUPABASE_URL')?.split('//')[1].split('.')[0].split(':')[0],
      supaKey: getEnv(c, 'SUPABASE_ANON_KEY'),
      signKey: getEnv(c, 'DEFAULT_SIGN_KEY'),
    })
  } catch (e) {
    return c.json({ status: 'Cannot get config', error: JSON.stringify(e) }, 500) 
  }
})
