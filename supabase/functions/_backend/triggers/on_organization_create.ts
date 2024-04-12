import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import type { InsertPayload } from '../utils/supabase.ts'
import { createStripeCustomer, supabaseAdmin } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { sendMetaToClickHouse } from '../utils/clickhouse.ts'

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const table: keyof Database['public']['Tables'] = 'orgs'
    const body = await c.req.json<InsertPayload<typeof table>>()
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'INSERT') {
      console.log('Not INSERT')
      return c.json({ status: 'Not INSERT' }, 200)
    }
    const record = body.record
    console.log('record', record)

    if (!record.id) {
      console.log('No id')
      return c.json(BRES)
    }

    if (!record.customer_id) {
      createStripeCustomer(c, record as any)
    }

    return c.json(BRES) // skip delete s3 and increment size in new upload
  }
  catch (e) {
    return c.json({ status: 'Cannot handle org creation', error: JSON.stringify(e) }, 500)
  }
})
