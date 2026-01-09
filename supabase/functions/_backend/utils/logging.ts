import { getRuntimeKey } from 'hono/adapter'

// Sensitive field names that should be redacted from logs
const SENSITIVE_FIELDS = new Set(['apikey', 'apiKey', 'apikeyUserId', 'password', 'secret', 'token', 'key'])

/**
 * Sanitize an object by redacting sensitive fields
 */
function sanitize(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitize)
  }

  const sanitized: any = {}
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key)) {
      sanitized[key] = '[REDACTED]'
    }
    else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitize(value)
    }
    else {
      sanitized[key] = value
    }
  }
  return sanitized
}

export function cloudlog(message: any) {
  const safeMessage = typeof message === 'object' && message !== null ? sanitize(message) : message

  if (getRuntimeKey() === 'workerd') {
    console.log(safeMessage)
  }
  else if (typeof safeMessage === 'object' && safeMessage !== null) {
    const entries = Object.entries(safeMessage)
    const logArgs = entries.flatMap(([key, value]) => [key, value])
    console.log(...logArgs)
  }
  else {
    console.log(safeMessage)
  }
}

export function serializeError(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack, cause: err.cause ? String(err.cause) : undefined }
  }
  try {
    return { message: JSON.stringify(err, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), stack: undefined, name: 'Error', cause: undefined }
  }
  catch {
    return { message: String(err), stack: undefined, name: 'Error', cause: undefined }
  }
}

export function cloudlogErr(message: any) {
  const safeMessage = typeof message === 'object' && message !== null ? sanitize(message) : message

  if (getRuntimeKey() === 'workerd') {
    console.error(safeMessage)
  }
  else if (typeof safeMessage === 'object' && safeMessage !== null) {
    const entries = Object.entries(safeMessage)
    const logArgs = entries.flatMap(([key, value]) => [key, value])
    console.error(...logArgs)
  }
  else {
    console.error(safeMessage)
  }
}
