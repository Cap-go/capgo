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
    const problem = (issue as { problem?: string }).problem
    const detail = typeof problem === 'string' && problem.length > 0 ? problem : issue.message
    // Prefer ArkType `problem` (avoids duplicated "foo: foo must...") but keep an
    // explicit path prefix for nested multi-field failures.
    if (path && typeof problem === 'string' && problem.length > 0 && !problem.startsWith(`${path} `) && !problem.startsWith(`${path}:`))
      return `${path}: ${problem}`
    if (path && !(typeof problem === 'string' && problem.length > 0))
      return `${path}: ${detail}`
    return detail
  })

  const errorMessage = `Validation failed:\n${messages.join('\n')}`

  if (!silent) {
    log.error(errorMessage)
  }

  throw new Error(errorMessage)
}
