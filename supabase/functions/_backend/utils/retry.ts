export interface RetryOptions<T> {
  attempts: number
  baseDelayMs: number
  shouldRetry?: (result: T) => boolean
}

export interface RetryOutcome<T> {
  result?: T
  lastError?: unknown
  attempts: number
}

export interface RetryableResult {
  error?: unknown
  status?: number | null
}

export function getRetryablePostgrestStatus(candidate: unknown): number | null {
  if (candidate && typeof candidate === 'object') {
    if ('status' in candidate && typeof (candidate as { status?: unknown }).status === 'number') {
      return (candidate as { status: number }).status
    }

    if ('message' in candidate && typeof (candidate as { message?: unknown }).message === 'string') {
      const match = /error code:\s*(\d{3})/i.exec((candidate as { message: string }).message)
      if (match) {
        return Number.parseInt(match[1], 10)
      }
    }
  }

  return null
}

export function isRetryablePostgrestStatus(status: number | null): boolean {
  return status !== null && status >= 500 && status < 600
}

export function isRetryablePostgrestError(error: unknown): boolean {
  return isRetryablePostgrestStatus(getRetryablePostgrestStatus(error))
}

export function isRetryablePostgrestResult(result: RetryableResult | null | undefined): boolean {
  if (!result) {
    return false
  }

  const status = typeof result.status === 'number' ? result.status : getRetryablePostgrestStatus(result.error)
  return isRetryablePostgrestStatus(status)
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions<T>,
): Promise<RetryOutcome<T>> {
  let lastError: unknown
  let result: T | undefined

  for (let attempt = 0; attempt < options.attempts; attempt++) {
    try {
      result = await operation()
      lastError = undefined
      const needsRetry = options.shouldRetry?.(result) ?? false
      if (!needsRetry) {
        return { result, lastError, attempts: attempt + 1 }
      }
    }
    catch (error) {
      lastError = error
    }

    if (attempt < options.attempts - 1) {
      const delayMs = options.baseDelayMs * (attempt + 1)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  return { result, lastError, attempts: options.attempts }
}
