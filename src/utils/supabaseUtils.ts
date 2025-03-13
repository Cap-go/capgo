import { useI18n } from 'petite-vue-i18n'
import { toast } from 'vue-sonner'

/**
 * Execute a Supabase query with a timeout
 * @param queryFn Function that returns a Supabase query promise
 * @param timeoutMs Timeout in milliseconds (default: 10000ms)
 * @returns Promise with the query result
 */
export async function timedQuery<T>(
  queryFn: () => Promise<T>,
  timeoutMs = 10000,
): Promise<T> {
  const { t } = useI18n()

  // Create abort controller for the timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    // Race between the query and the timeout
    const result = await Promise.race([
      queryFn(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`Query timeout exceeded (${timeoutMs}ms)`))
        })
      }),
    ])

    return result as T
  }
  catch (error) {
    if (error instanceof Error && error.message.includes('timeout')) {
      console.error('Query timeout exceeded:', error)
      toast.error(t('query-timeout-exceeded'))
    }
    throw error
  }
  finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Retry an operation with exponential backoff
 * @param operation Function to retry
 * @param maxRetries Maximum number of retries (default: 3)
 * @param initialDelay Initial delay in milliseconds (default: 1000ms)
 * @returns Promise with the operation result
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000,
): Promise<T> {
  const { t } = useI18n()
  let lastError: unknown

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    }
    catch (error) {
      lastError = error

      // Only retry for specific error types
      if (!(error instanceof Error)
        || (!error.message.includes('timeout')
          && !error.message.includes('network'))) {
        throw error
      }

      // Last attempt, don't wait
      if (attempt === maxRetries - 1)
        break

      // Exponential backoff
      const delay = initialDelay * 2 ** attempt
      console.log(`Retrying operation in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  console.error('Operation failed after maximum retries:', lastError)
  toast.error(t('operation-failed-after-retries'))
  throw lastError
}
