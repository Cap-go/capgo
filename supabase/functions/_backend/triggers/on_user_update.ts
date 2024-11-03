import type { Context } from '@hono/hono'
import type { UpdatePayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { createApiKey } from '../utils/supabase.ts'

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const table: keyof Database['public']['Tables'] = 'users'
    const body = await c.req.json<UpdatePayload<typeof table>>()
    if (body.table !== table) {
      console.log({ requestId: c.get('requestId'), context: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'UPDATE') {
      console.log({ requestId: c.get('requestId'), context: 'Not UPDATE' })
      return c.json({ status: 'Not UPDATE' }, 200)
    }
    const record = body.record
    console.log({ requestId: c.get('requestId'), context: 'record', record })
    if (!record.email) {
      console.log({ requestId: c.get('requestId'), context: 'No email' })
      return c.json(BRES)
    }
    if (!record.id) {
      console.log({ requestId: c.get('requestId'), context: 'No id' })
      return c.json(BRES)
    }
    await createApiKey(c, record.id)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot update user', error: JSON.stringify(e) }, 500)
  }
})
