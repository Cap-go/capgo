import { TERMINAL_BUILD_STATUSES } from './build_timeout.ts'

export type BuildTransition = 'started' | 'succeeded' | 'failed' | 'timed_out'
export type BuildFailureCategory = 'timeout' | 'builder_error' | 'validation_error' | 'unknown'

// Substring hints — `'missing credential'` matches both singular and plural; `'validation'` is intentionally broad.
const VALIDATION_HINTS = ['invalid build_mode', 'missing credential', 'validation']

interface ClassifyInput {
  previous: string
  next: string
  timeoutApplied: boolean
}

export function classifyBuildTransition(input: ClassifyInput): BuildTransition | null {
  if (TERMINAL_BUILD_STATUSES.has(input.previous))
    return null

  if (input.previous === input.next)
    return null

  if (input.timeoutApplied)
    return 'timed_out'

  if (input.next === 'running')
    return 'started'

  if (input.next === 'succeeded')
    return 'succeeded'

  if (input.next === 'failed')
    return 'failed'

  return null
}

interface FailureInput {
  timeoutApplied: boolean
  errorMessage: string | null | undefined
}

export function mapBuildFailureCategory(input: FailureInput): BuildFailureCategory {
  if (input.timeoutApplied)
    return 'timeout'

  const message = (input.errorMessage ?? '').toLowerCase()
  if (!message)
    return 'unknown'

  for (const hint of VALIDATION_HINTS) {
    if (message.includes(hint))
      return 'validation_error'
  }

  return 'builder_error'
}
