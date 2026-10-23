import { isTransientNetworkError } from './network-error'

function getCapgoCliHttpStatus(error: unknown): number | undefined {
  const context = (error as { context?: { status?: number } } | null)?.context
  return typeof context?.status === 'number' ? context.status : undefined
}

async function readCapgoCliApiErrorPayload(error: unknown): Promise<{ error?: string, message?: string, moreInfo?: Record<string, unknown> } | null> {
  const response = (error as { context?: Response } | null)?.context
  if (!response || typeof response.clone !== 'function')
    return null
  try {
    const text = await response.clone().text()
    try {
      return JSON.parse(text) as { error?: string, message?: string, moreInfo?: Record<string, unknown> }
    }
    catch {
      return text ? { message: text } : null
    }
  }
  catch {
    return null
  }
}

export const CAPGO_API_RETRY_MAX_ATTEMPTS = 3

/** Backend 503 error codes that are safe to retry during uploads and preflight. */
export const EXPLICIT_RETRYABLE_503_ERROR_CODES = new Set([
  'database_unavailable',
  'upstream_unavailable',
  'upload_authorization_unavailable',
  'event_queue_unavailable',
])

const NETWORK_RETRY_DELAYS_MS = [500, 1000]
const DEFAULT_503_RETRY_MS = 2000
export const CAPGO_API_MAX_RETRY_DELAY_MS = 10_000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function retryAfterHeaderDelayMs(response: Response): number | null {
  const retryAfter = response.headers.get('Retry-After')?.trim()
  if (!retryAfter || !/^\d+$/.test(retryAfter))
    return null
  const retryAfterSeconds = Number(retryAfter)
  if (!Number.isSafeInteger(retryAfterSeconds) || retryAfterSeconds <= 0)
    return null
  return Math.min(retryAfterSeconds * 1000, CAPGO_API_MAX_RETRY_DELAY_MS)
}

function retryAfterFromPayload(payload: { moreInfo?: Record<string, unknown> } | null): number | null {
  const retryAfterSeconds = payload?.moreInfo?.retryAfterSeconds
  if (typeof retryAfterSeconds !== 'number' || !Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0)
    return null
  return Math.min(retryAfterSeconds * 1000, CAPGO_API_MAX_RETRY_DELAY_MS)
}

/** Transport failures and curated transient 503 responses from the Capgo API. */
export async function isRetryableCapgoApiError(error: unknown): Promise<boolean> {
  if (isTransientNetworkError(error))
    return true
  if (getCapgoCliHttpStatus(error) !== 503)
    return false

  const payload = await readCapgoCliApiErrorPayload(error)
  if (payload?.error && EXPLICIT_RETRYABLE_503_ERROR_CODES.has(payload.error))
    return true
  if (retryAfterFromPayload(payload) !== null)
    return true

  const response = (error as { context?: Response } | null)?.context
  if (response instanceof Response && retryAfterHeaderDelayMs(response) !== null)
    return true

  return false
}

export async function getCapgoApiRetryDelayMs(error: unknown, attemptIndex: number): Promise<number> {
  if (isTransientNetworkError(error))
    return NETWORK_RETRY_DELAYS_MS[attemptIndex] ?? 1000

  const payload = await readCapgoCliApiErrorPayload(error)
  const fromPayload = retryAfterFromPayload(payload)
  if (fromPayload !== null)
    return fromPayload

  const response = (error as { context?: Response } | null)?.context
  if (response instanceof Response) {
    const fromHeader = retryAfterHeaderDelayMs(response)
    if (fromHeader !== null)
      return fromHeader
  }

  return DEFAULT_503_RETRY_MS
}

export async function invokeCapgoCliApiResultWithRetry<T>(
  call: () => PromiseLike<{ data: T | null, error: { message?: string } | null }>,
  sleepFn: (ms: number) => Promise<void> = sleep,
): Promise<{ data: T | null, error: { message?: string } | null }> {
  let lastResult = await call()
  if (!lastResult.error)
    return lastResult

  for (let attempt = 1; attempt < CAPGO_API_RETRY_MAX_ATTEMPTS; attempt++) {
    if (!(await isRetryableCapgoApiError(lastResult.error)))
      return lastResult
    await sleepFn(await getCapgoApiRetryDelayMs(lastResult.error, attempt - 1))
    lastResult = await call()
    if (!lastResult.error)
      return lastResult
  }

  return lastResult
}
