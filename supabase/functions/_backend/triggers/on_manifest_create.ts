import type { Context } from '@hono/hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { InsertPayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { s3 } from '../utils/s3.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

async function updateManifestSize(c: Context, record: Database['public']['Tables']['manifest']['Row']) {
  if (!record.s3_path) {
    console.log({ requestId: c.get('requestId'), context: 'No s3 path', id: record.id })
    return c.json(BRES)
  }

  try {
    const size = await s3.getSize(c, record.s3_path)
    if (size) {
      const { error: updateError } = await supabaseAdmin(c)
        .from('manifest')
        .update({ file_size: size })
        .eq('id', record.id)
      if (updateError)
        console.log({ requestId: c.get('requestId'), context: 'error update manifest size', error: updateError })
    }
  }
  catch (error) {
    console.log({ requestId: c.get('requestId'), context: 'Cannot get s3 size', error })
  }

  return c.json(BRES)
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const table: keyof Database['public']['Tables'] = 'manifest'
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

    if (!record.app_version_id || !record.s3_path) {
      console.log({ requestId: c.get('requestId'), context: 'no app_version_id or s3_path' })
      return c.json(BRES)
    }

    return updateManifestSize(c as any, body.record as any)
  }
  catch (e) {
    return c.json({ status: 'Cannot update manifest size', error: JSON.stringify(e) }, 500)
  }
})
