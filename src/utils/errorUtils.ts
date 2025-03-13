import { useI18n } from 'petite-vue-i18n'
import { toast } from 'vue-sonner'

/**
 * Handle errors consistently across components
 * @param error The error to handle
 * @param defaultMessage Default message to show if error type can't be determined
 * @param context Optional context information for logging
 */
export function handleError(error: unknown, defaultMessage: string, context?: string): void {
  const { t } = useI18n()

  // Log error with context if provided
  if (context)
    console.error(`${defaultMessage} (${context}):`, error)
  else
    console.error(defaultMessage, error)

  // Determine specific error message based on error type
  let errorMessage = defaultMessage
  if (error instanceof Error) {
    // Extract more specific error information
    if (error.message.includes('timeout'))
      errorMessage = t('error-query-timeout')
    else if (error.message.includes('network'))
      errorMessage = t('error-network-issue')
    else if (error.message.includes('permission'))
      errorMessage = t('error-permission-denied')
    else if (error.message.includes('not found'))
      errorMessage = t('error-resource-not-found')
    else
      errorMessage = `${defaultMessage}: ${error.message}`
  }

  // Show toast notification with the error message
  toast.error(errorMessage, {
    duration: 5000, // Show error messages longer
    description: getRecoverySuggestion(error),
  })
}

/**
 * Get recovery suggestion based on error type
 * @param error The error to analyze
 * @returns A recovery suggestion message or undefined
 */
function getRecoverySuggestion(error: unknown): string | undefined {
  const { t } = useI18n()

  if (!(error instanceof Error))
    return undefined

  if (error.message.includes('timeout'))
    return t('error-recovery-timeout')
  else if (error.message.includes('network'))
    return t('error-recovery-network')
  else if (error.message.includes('permission'))
    return t('error-recovery-permission')

  return undefined
}
