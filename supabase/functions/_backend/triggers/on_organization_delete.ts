import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { DeletePayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cancelSubscription } from '../utils/stripe.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const table: keyof Database['public']['Tables'] = 'orgs'
    const body = await c.req.json<DeletePayload<typeof table>>()
    if (body.table !== table) {
      console.log({ requestId: c.get('requestId'), message: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'DELETE') {
      console.log({ requestId: c.get('requestId'), message: 'Not DELETE' })
      return c.json({ status: 'Not DELETE' }, 200)
    }
    const record = body.old_record
    console.log({ requestId: c.get('requestId'), message: 'record', record })

    if (!record.id || !record.customer_id) {
      console.log({ requestId: c.get('requestId'), message: 'no app_id or user_id' })
      return c.json(BRES)
    }

    console.log({ requestId: c.get('requestId'), message: 'org delete', record })
    cancelSubscription(c as any, record.customer_id)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete version', error: JSON.stringify(e) }, 500)
  }
})
