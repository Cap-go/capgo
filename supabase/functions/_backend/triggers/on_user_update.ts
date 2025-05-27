import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { UpdatePayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { createApiKey } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const table: keyof Database['public']['Tables'] = 'users'
    const body = await c.req.json<UpdatePayload<typeof table>>()
    if (body.table !== table) {
      cloudlog({ requestId: c.get('requestId'), message: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'UPDATE') {
      cloudlog({ requestId: c.get('requestId'), message: 'Not UPDATE' })
      return c.json({ status: 'Not UPDATE' }, 200)
    }
    const record = body.record
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
