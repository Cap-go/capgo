import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { logsnag } from '../utils/logsnag.ts'
import type { InsertPayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const table: keyof Database['public']['Tables'] = 'apps'
    const body = await c.req.json<InsertPayload<typeof table>>()
    if (body.table !== table) {
      console.log(c.get('requestId'), `Not ${table}`)
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'INSERT') {
      console.log(c.get('requestId'), 'Not INSERT')
      return c.json({ status: 'Not INSERT' }, 200)
    }
    const record = body.record
    console.log(c.get('requestId'), 'record', record)

    if (!record.id) {
      console.log(c.get('requestId'), 'No id')
      return c.json(BRES)
    }

    const LogSnag = logsnag(c)
    LogSnag.track({
      channel: 'app-created',
      event: 'App Created',
      icon: '🎉',
      user_id: record.owner_org,
      notify: true,
    })

    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot handle org creation', error: JSON.stringify(e) }, 500)
  }
})
