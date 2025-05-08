import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { InsertPayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const table: keyof Database['public']['Tables'] = 'app_versions'
    const body = await c.req.json<InsertPayload<typeof table>>()
    if (body.table !== table) {
      console.log({ requestId: c.get('requestId'), message: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'INSERT') {
      console.log({ requestId: c.get('requestId'), message: 'Not INSERT' })
      return c.json({ status: 'Not INSERT' }, 200)
    }
    const record = body.record
    console.log({ requestId: c.get('requestId'), message: 'record', record })

    if (!record.id) {
      console.log({ requestId: c.get('requestId'), message: 'No id' })
      return c.json(BRES)
    }

    const { error: errorUpdate } = await supabaseAdmin(c as any)
      .from('apps')
      .update({
        last_version: record.name,
      })
      .eq('app_id', record.app_id)
      .eq('owner_org', record.owner_org)
    if (errorUpdate)
      console.log({ requestId: c.get('requestId'), message: 'errorUpdate', errorUpdate })

    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot create version', error: JSON.stringify(e) }, 500)
  }
})
