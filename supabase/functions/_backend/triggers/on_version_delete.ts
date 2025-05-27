import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { DeletePayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { deleteIt } from './on_version_update.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const table: keyof Database['public']['Tables'] = 'app_versions'
    const body = await c.req.json<DeletePayload<typeof table>>()
    if (body.table !== table) {
      cloudlog({ requestId: c.get('requestId'), message: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'DELETE') {
      cloudlog({ requestId: c.get('requestId'), message: 'Not DELETE' })
      return c.json({ status: 'Not DELETE' }, 200)
    }
    const record = body.old_record
    cloudlog({ requestId: c.get('requestId'), message: 'record', record })

    if (!record.app_id || !record.user_id) {
      cloudlog({ requestId: c.get('requestId'), message: 'no app_id or user_id' })
      return c.json(BRES)
    }
    return deleteIt(c as any, body.old_record as any)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete version', error: JSON.stringify(e) }, 500)
  }
})
