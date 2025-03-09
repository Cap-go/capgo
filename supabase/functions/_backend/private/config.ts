import { honoFactory, useCors } from '../utils/hono.ts'
import { getEnv } from '../utils/utils.ts'

export const app = honoFactory.createApp()

app.use('/', useCors)

app.get('/', (c) => {
  try {
    return c.json({
      supaHost: getEnv(c as any, 'SUPABASE_URL'),
      supbaseId: getEnv(c as any, 'SUPABASE_URL')?.split('//')[1].split('.')[0].split(':')[0],
      supaKey: getEnv(c as any, 'SUPABASE_ANON_KEY'),
    })
  }
  catch (e) {
    return c.json({ status: 'Cannot get config', error: JSON.stringify(e) }, 500)
  }
})
