import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { createApiKey } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('users', 'UPDATE'), async (c) => {
  try {
    const record = c.get('webhookBody') as Database['public']['Tables']['users']['Row']
    cloudlog({ requestId: c.get('requestId'), message: 'record', record })
    if (!record.email) {
      cloudlog({ requestId: c.get('requestId'), message: 'No email' })
      return c.json(BRES)
    }
    if (!record.id) {
      cloudlog({ requestId: c.get('requestId'), message: 'No id' })
      return c.json(BRES)
    }
    await createApiKey(c as any, record.id)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot update user', error: JSON.stringify(e) }, 500)
  }
})
