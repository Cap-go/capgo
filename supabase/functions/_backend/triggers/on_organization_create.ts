import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { InsertPayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { logsnag } from '../utils/logsnag.ts'
import { createStripeCustomer } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const table: keyof Database['public']['Tables'] = 'orgs'
    const body = await c.req.json<InsertPayload<typeof table>>()
    if (body.table !== table) {
      console.log({ requestId: c.get('requestId'), message: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'INSERT') {
      console.log({ requestId: c.get('requestId'), message: 'Not INSERT' })
      return c.json({ status: 'Not INSERT' }, 200)
    }
    const record = body.record as Database['public']['Tables']['orgs']['Row']
    console.log({ requestId: c.get('requestId'), message: 'record', record })

    if (!record.id) {
      console.log({ requestId: c.get('requestId'), message: 'No id' })
      return c.json(BRES)
    }

    if (!record.customer_id)
      await createStripeCustomer(c as any, record as any)

    const LogSnag = logsnag(c as any)
    LogSnag.track({
      channel: 'org-created',
      event: 'Org Created',
      icon: '🎉',
      user_id: record.id,
      notify: true,
    })

    return c.json(BRES)
  }
  catch (e) {
    console.error('Error on_organization_create', c.get('requestId'), e)
    return c.json({ status: 'Cannot handle org creation', error: JSON.stringify(e) }, 500)
  }
})
