import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { s3 } from '../utils/s3.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

async function updateManifestSize(c: Context, record: Database['public']['Tables']['manifest']['Row']) {
  if (!record.s3_path) {
    cloudlog({ requestId: c.get('requestId'), message: 'No s3 path', id: record.id })
    return c.json(BRES)
  }

  const size = await s3.getSize(c, record.s3_path)
  if (size) {
    const { error: updateError } = await supabaseAdmin(c)
      .from('manifest')
      .update({ file_size: size })
      .eq('id', record.id)
    if (updateError)
      cloudlog({ requestId: c.get('requestId'), message: 'error update manifest size', error: updateError })
  }

  return c.json(BRES)
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('manifest', 'INSERT'), (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['manifest']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })

  if (!record.app_version_id || !record.s3_path) {
    cloudlog({ requestId: c.get('requestId'), message: 'no app_version_id or s3_path' })
    return c.json(BRES)
  }

  return updateManifestSize(c, record)
})
