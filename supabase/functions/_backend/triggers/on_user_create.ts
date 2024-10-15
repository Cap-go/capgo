import type { Context } from '@hono/hono'
import type { InsertPayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { logsnag } from '../utils/logsnag.ts'
import { createApiKey } from '../utils/supabase.ts'

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const table: keyof Database['public']['Tables'] = 'users'
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
    await Promise.all([
      createApiKey(c, record.id),
    ])
    console.log({ requestId: c.get('requestId'), context: 'createCustomer stripe' })
    if (record.customer_id)
      return c.json(BRES)
    const LogSnag = logsnag(c)
    await LogSnag.track({
      channel: 'user-register',
      event: 'User Joined',
      icon: '🎉',
      user_id: record.id,
      notify: true,
    }).catch()
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot create user', error: JSON.stringify(e) }, 500)
  }
})
