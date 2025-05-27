import type { Context } from '@hono/hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { InsertPayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { s3 } from '../utils/s3.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

async function updateManifestSize(c: Context, record: Database['public']['Tables']['manifest']['Row']) {
  if (!record.s3_path) {
    cloudlog({ requestId: c.get('requestId'), message: 'No s3 path', id: record.id })
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
        cloudlog({ requestId: c.get('requestId'), message: 'error update manifest size', error: updateError })
    }
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot get s3 size', error })
  }

  return c.json(BRES)
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const table: keyof Database['public']['Tables'] = 'manifest'
    const body = await c.req.json<InsertPayload<typeof table>>()
    if (body.table !== table) {
      cloudlog({ requestId: c.get('requestId'), message: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'INSERT') {
      cloudlog({ requestId: c.get('requestId'), message: 'Not INSERT' })
      return c.json({ status: 'Not INSERT' }, 200)
    }
    const record = body.record
    cloudlog({ requestId: c.get('requestId'), message: 'record', record })

    if (!record.app_version_id || !record.s3_path) {
      cloudlog({ requestId: c.get('requestId'), message: 'no app_version_id or s3_path' })
      return c.json(BRES)
    }

    return updateManifestSize(c as any, body.record as any)
  }
  catch (e) {
    return c.json({ status: 'Cannot update manifest size', error: JSON.stringify(e) }, 500)
  }
})
