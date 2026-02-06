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

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions<T>,
): Promise<RetryOutcome<T>> {
  let lastError: unknown
  let result: T | undefined

  for (let attempt = 0; attempt < options.attempts; attempt++) {
    try {
      result = await operation()
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
