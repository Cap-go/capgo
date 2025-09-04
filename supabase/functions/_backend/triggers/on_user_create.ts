import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { logsnag } from '../utils/logsnag.ts'
import { createApiKey } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('users', 'INSERT'), async (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['users']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })
  await createApiKey(c, record.id)
  cloudlog({ requestId: c.get('requestId'), message: 'createCustomer stripe' })
  if (record.customer_id)
    return c.json(BRES)
  const LogSnag = logsnag(c)
  await LogSnag.track({
    channel: 'user-register',
    event: 'User Joined',
    icon: '🎉',
    user_id: record.id,
    notify: false,
  }).catch()
  return c.json(BRES)
})
