import type { ZodSchema } from 'zod'
import { log } from '@clack/prompts'

/**
 * Validate options using a Zod schema with CLI-friendly error messages.
 * Preserves the existing silent/log.error pattern used across all commands.
 *
 * @param schema - The Zod schema to validate against
 * @param data - The data to validate
 * @param silent - If true, suppresses log output (for SDK usage)
 * @returns The parsed and validated data
 * @throws Error with a descriptive message if validation fails
 */
export function validateOptions<T>(schema: ZodSchema<T>, data: unknown, silent = false): T {
  const result = schema.safeParse(data)
  if (result.success) {
    return result.data
  }

  const issues = result.error.issues
  const messages = issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'value'
    return `${path}: ${issue.message}`
  })

  const errorMessage = `Validation failed:\n${messages.join('\n')}`

  if (!silent) {
    log.error(errorMessage)
  }

  throw new Error(errorMessage)
}
