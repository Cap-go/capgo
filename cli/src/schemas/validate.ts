import { log } from '@clack/prompts'
import { safeParseSchema, type StandardSchema } from './ark_validation'

/**
 * Validate options using a Standard Schema with CLI-friendly error messages.
 * Preserves the existing silent/log.error pattern used across all commands.
 */
export function validateOptions<T>(schema: StandardSchema<T>, data: unknown, silent = false): T {
  const result = safeParseSchema(schema, data)
  if (result.success) {
    return result.data
  }

  const issues = result.error.issues
  const messages = issues.map((issue) => {
    const path = issue.path && issue.path.length > 0 ? issue.path.join('.') : ''
    // ArkType `problem` is path-free; `message` often already includes the path.
    const problem = (issue as { problem?: string }).problem
    const detail = typeof problem === 'string' && problem.length > 0 ? problem : issue.message
    return path ? `${path}: ${detail}` : detail
  })

  const errorMessage = `Validation failed:\n${messages.join('\n')}`

  if (!silent) {
    log.error(errorMessage)
  }

  throw new Error(errorMessage)
}
