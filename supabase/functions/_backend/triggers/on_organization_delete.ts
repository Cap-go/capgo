import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { cancelSubscription } from '../utils/stripe.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('orgs', 'DELETE'), async (c) => {
  try {
    const record = c.get('webhookBody') as Database['public']['Tables']['orgs']['Row']
    cloudlog({ requestId: c.get('requestId'), message: 'record', record })

    if (!record.id || !record.customer_id) {
      cloudlog({ requestId: c.get('requestId'), message: 'no app_id or user_id' })
      return c.json(BRES)
    }

    cloudlog({ requestId: c.get('requestId'), message: 'org delete', record })
    cancelSubscription(c, record.customer_id)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete version', error: JSON.stringify(e) }, 500)
  }
})
