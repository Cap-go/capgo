import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { getEnv } from '../utils/utils.ts'
import { useCors } from '../utils/hono.ts'

export const app = new Hono()

app.use('/', useCors)

app.get('/', (c: Context) => {
  try {
    return c.json({
      supaHost: getEnv(c, 'SUPABASE_URL'),
      supbaseId: getEnv(c, 'SUPABASE_URL')?.split('//')[1].split('.')[0].split(':')[0],
      supaKey: getEnv(c, 'SUPABASE_ANON_KEY'),
      signKey: getEnv(c, 'DEFAULT_SIGN_KEY'), // deprecated todo: remove in 6 months
      encryptionKey: getEnv(c, 'DEFAULT_SIGN_KEY'),
    })
  }
  catch (e) {
    return c.json({ status: 'Cannot get config', error: JSON.stringify(e) }, 500)
  }
})
