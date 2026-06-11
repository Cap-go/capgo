import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { RetryableResult } from '../utils/retry.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, quickError, simpleError, triggerValidator } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { isRetryablePostgrestResult, retryWithBackoff } from '../utils/retry.ts'
import { s3 } from '../utils/s3.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

const SIZE_RETRY_ATTEMPTS = 3
const SIZE_RETRY_DELAY_MS = 500
const MANIFEST_UPDATE_RETRY_ATTEMPTS = 3
const MANIFEST_UPDATE_RETRY_DELAY_MS = 300

interface QueueLogMetadata {
  queueName: string | null
  queueMsgId: string | null
  queueReadCount: string | null
  cfId: string | null
}

function getQueueLogMetadata(c: Context): QueueLogMetadata {
  return {
    queueName: c.req.header('x-capgo-queue-name') ?? null,
    queueMsgId: c.req.header('x-capgo-queue-msg-id') ?? null,
    queueReadCount: c.req.header('x-capgo-queue-read-count') ?? null,
    cfId: c.req.header('x-capgo-cf-id') ?? null,
  }
}
async function getManifestSizeWithRetry(c: Context, s3Path: string): Promise<{ diagnostics?: Awaited<ReturnType<typeof s3.getSizeDiagnostics>>, lastError?: unknown, attempts: number }> {
  const { result, lastError, attempts } = await retryWithBackoff(
    () => s3.getSizeDiagnostics(c, s3Path),
    {
      attempts: SIZE_RETRY_ATTEMPTS,
      baseDelayMs: SIZE_RETRY_DELAY_MS,
      shouldRetry: diagnostics => diagnostics.size <= 0,
    },
  )

  return { attempts, diagnostics: result, lastError }
}

function shouldRetryManifestSizeLookup(size: number, currentFileSize: number | null | undefined): boolean {
  return size <= 0 && !(currentFileSize && currentFileSize > 0)
}

async function runManifestUpdateWithRetry(
  c: Context,
  operation: () => Promise<RetryableResult>,
): Promise<void> {
  const { result, lastError, attempts } = await retryWithBackoff(async () => {
    try {
      return await operation()
    }
    catch (error) {
      return { error }
    }
  }, {
    attempts: MANIFEST_UPDATE_RETRY_ATTEMPTS,
    baseDelayMs: MANIFEST_UPDATE_RETRY_DELAY_MS,
    shouldRetry: result => isRetryablePostgrestResult(result),
  })

  if (!result) {
    throw new Error('update_manifest_file_size returned no result')
  }

  if (attempts > 1) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'on_manifest_create update retried',
      attempts,
      hadError: Boolean(result.error || lastError),
    })
  }

  if (lastError || result.error) {
    throw result.error ?? lastError
  }

  if (typeof result.status === 'number' && result.status >= 400) {
    throw new Error(`update_manifest_file_size failed with status ${result.status}`)
  }
}

export async function updateManifestSize(c: Context, record: Database['public']['Tables']['manifest']['Row'], queue = getQueueLogMetadata(c)) {
  if (!record.s3_path) {
    cloudlog({ requestId: c.get('requestId'), message: 'No s3 path', id: record.id, app_version_id: record.app_version_id, file_name: record.file_name, queue })
    throw simpleError('no_s3_path', 'No s3 path', { record })
  }

  const { diagnostics, lastError, attempts } = await getManifestSizeWithRetry(c, record.s3_path)
  const size = diagnostics?.size ?? 0
  if (lastError) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getSize failed after retries', id: record.id, app_version_id: record.app_version_id, file_name: record.file_name, s3_path: record.s3_path, attempts, queue, error: lastError, storageDiagnostics: diagnostics })
  }
  if (shouldRetryManifestSizeLookup(size, record.file_size)) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getSize returned 0 after retries', id: record.id, app_version_id: record.app_version_id, file_name: record.file_name, s3_path: record.s3_path, attempts, queue, storageDiagnostics: diagnostics })
    // Return non-2xx so queue_consumer keeps the message and applies its 5-read retry budget.
    throw quickError(503, 'manifest_size_not_found', 'Manifest file size metadata was not found', { attempts, file_name: record.file_name, id: record.id, queue, s3_path: record.s3_path, storageDiagnostics: diagnostics }, lastError, { alert: false })
  }
  if (size <= 0) {
    cloudlog({ requestId: c.get('requestId'), message: 'getSize returned 0, keeping existing file_size', id: record.id, app_version_id: record.app_version_id, file_name: record.file_name, s3_path: record.s3_path, file_size: record.file_size, attempts, queue, storageDiagnostics: diagnostics })
    return c.json(BRES)
  }

  try {
    await runManifestUpdateWithRetry(c, async () => await supabaseAdmin(c)
      .from('manifest')
      .update({ file_size: size })
      .eq('id', record.id))
    cloudlog({ requestId: c.get('requestId'), message: 'manifest file_size updated', id: record.id, app_version_id: record.app_version_id, file_name: record.file_name, s3_path: record.s3_path, size, attempts, queue, selectedCandidateKey: diagnostics?.selectedCandidateKey })
  }
  catch (updateError) {
    cloudlog({ requestId: c.get('requestId'), message: 'error update manifest size', id: record.id, app_version_id: record.app_version_id, file_name: record.file_name, s3_path: record.s3_path, size, attempts, queue, error: updateError, storageDiagnostics: diagnostics })
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

export const onManifestCreateTestUtils = {
  isRetryablePostgrestResult,
  runManifestUpdateWithRetry,
  shouldRetryManifestSizeLookup,
}
