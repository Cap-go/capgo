// @transform node import 'hono' to deno 'npm:hono'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { BRES, middlewareAPISecret } from '../../_utils/hono.ts';
import { DeletePayload } from '../../_utils/supabase.ts';
import { Database } from '../../_utils/supabase.types.ts';
import { deleteIt } from './on_version_update.ts';

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const table: keyof Database['public']['Tables'] = 'app_versions'
    const body = await c.req.json<DeletePayload<typeof table>>()
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'DELETE') {
      console.log('Not DELETE')
      return c.json({ status: 'Not DELETE' }, 200)
    }
    const record = body.old_record
    console.log('record', record)

    if (!record.app_id || !record.user_id) {
      console.log('no app_id or user_id')
      return c.json(BRES)
    }
    if (!record.bucket_id) {
      console.log('no bucket_id')
      return c.json(BRES)
    }
    return deleteIt(c, body.old_record as any)
  } catch (e) {
    return c.json({ status: 'Cannot process version', error: JSON.stringify(e) }, 500)
  }
})
