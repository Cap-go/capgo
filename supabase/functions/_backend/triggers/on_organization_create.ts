import type { Context } from '@hono/hono'
import type { InsertPayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { logsnag } from '../utils/logsnag.ts'
import { createStripeCustomer } from '../utils/supabase.ts'

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const table: keyof Database['public']['Tables'] = 'orgs'
    const body = await c.req.json<InsertPayload<typeof table>>()
    if (body.table !== table) {
      console.log({ requestId: c.get('requestId'), context: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'INSERT') {
      console.log({ requestId: c.get('requestId'), context: 'Not INSERT' })
      return c.json({ status: 'Not INSERT' }, 200)
    }
    const record = body.record
    console.log({ requestId: c.get('requestId'), context: 'record', record })

    if (!record.id) {
      console.log({ requestId: c.get('requestId'), context: 'No id' })
      return c.json(BRES)
    }

    if (!record.customer_id)
      createStripeCustomer(c, record as any)

    const LogSnag = logsnag(c)
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
