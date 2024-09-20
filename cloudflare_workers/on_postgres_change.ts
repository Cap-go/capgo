import { Hono } from 'hono/tiny'
import { middlewareAPISecret } from 'supabase/functions/_backend/utils/hono'
import type { D1Database } from '@cloudflare/workers-types'
import type { Context } from '@hono/hono'

export interface DBPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: any | null
  old_record: null | any
}

// eslint-disable-next-line ts/consistent-type-definitions
export type Bindings = {
  // If you set another name in wrangler.toml as the value for 'binding',
  capgo_db: D1Database
}

export const app = new Hono<{ Bindings: Bindings }>()

app.all('/', middlewareAPISecret, async (c: Context) => {
  try {
    const body = await c.req.json<DBPayload>()
    const record = body.record
    console.log('record', record)
    let query = ''

    if (body.type === 'INSERT' || body.type === 'UPDATE') {
      const columns = Object.keys(record).join(', ')
      const values = Object.values(record).map(val => `'${val}'`).join(', ')
      const setString = Object.entries(record).map(([key, val]) => `${key} = EXCLUDED.${key}`).join(', ')

      // UPSERT query (INSERT ... ON CONFLICT)
      query = `INSERT INTO public.${body.table} (${columns}) VALUES (${values}) ON CONFLICT (id) DO UPDATE SET ${setString};`
      await c.env.capgo_db.exec(query)
    }
    else if (body.type === 'DELETE') {
      query = `DELETE FROM public.${body.table} WHERE id='${record.id}';`
      await c.env.capgo_db.exec(query)
    }
    else {
      return c.json({ status: 'Fail Type' }, 400)
    }

    // No data is returned, just a success response
    return c.json({ status: 'Success' }, 200)
  }
  catch (e) {
    console.error('error', e)
    return c.json({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})
