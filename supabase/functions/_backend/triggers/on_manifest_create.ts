import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, simpleError, triggerValidator } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { retryWithBackoff } from '../utils/retry.ts'
import { s3 } from '../utils/s3.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

const SIZE_RETRY_ATTEMPTS = 3
const SIZE_RETRY_DELAY_MS = 500

async function getManifestSizeWithRetry(c: Context, s3Path: string): Promise<{ size: number, lastError?: unknown }> {
  const { result, lastError } = await retryWithBackoff(
    () => s3.getSize(c, s3Path),
    {
      attempts: SIZE_RETRY_ATTEMPTS,
      baseDelayMs: SIZE_RETRY_DELAY_MS,
      shouldRetry: size => size <= 0,
    },
  )

  return { size: typeof result === 'number' ? result : 0, lastError }
}

async function updateManifestSize(c: Context, record: Database['public']['Tables']['manifest']['Row']) {
  if (!record.s3_path) {
    cloudlog({ requestId: c.get('requestId'), message: 'No s3 path', id: record.id })
    throw simpleError('no_s3_path', 'No s3 path', { record })
  }

  const { size, lastError } = await getManifestSizeWithRetry(c, record.s3_path)
  if (lastError) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getSize failed after retries', id: record.id, s3_path: record.s3_path, error: lastError })
  }
  if (size === 0) {
    if (record.file_size && record.file_size > 0) {
      cloudlog({ requestId: c.get('requestId'), message: 'getSize returned 0, keeping existing file_size', id: record.id, s3_path: record.s3_path, file_size: record.file_size })
      return c.json(BRES)
    }
    cloudlog({ requestId: c.get('requestId'), message: 'getSize returned 0 after retries, skipping update', id: record.id, s3_path: record.s3_path })
    return c.json(BRES)
  }

  const { error: updateError } = await supabaseAdmin(c)
    .from('manifest')
    .update({ file_size: size })
    .eq('id', record.id)
  if (updateError) {
    cloudlog({ requestId: c.get('requestId'), message: 'error update manifest size', error: updateError })
    throw simpleError('manifest_update_failed', 'Failed to update manifest file_size', { record, updateError })
  }

  return c.json(BRES)
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('manifest', 'INSERT'), (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['manifest']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })

  if (!record.app_version_id || !record.s3_path) {
    cloudlog({ requestId: c.get('requestId'), message: 'no app_version_id or s3_path' })
    throw simpleError('no_app_version_id_or_s3_path', 'no app_version_id or s3_path', { record })
  }

  return updateManifestSize(c, record)
})
