import { Hono } from 'hono'
import type { Context } from 'hono'
import { getEnv } from '../../utils/utils.ts'
import { middlewareCors } from '../../utils/hono.ts';

export const app = new Hono()

app.get('/', middlewareCors, (c: Context) => {
  try {
    return c.json({
      supaHost: getEnv(c, 'SUPABASE_URL'),
      supbaseId: getEnv(c, 'SUPABASE_URL')?.split('//')[1].split('.')[0].split(':')[0],
      supaKey: getEnv(c, 'SUPABASE_ANON_KEY'),
      signKey: getEnv(c, 'DEFAULT_SIGN_KEY'),
    })
  }
  catch (e) {
    return c.json({ status: 'Cannot get config', error: JSON.stringify(e) }, 500)
  }
})
