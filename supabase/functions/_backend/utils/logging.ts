import { getRuntimeKey } from 'hono/adapter'

// Sensitive field names that should be redacted from logs
const SENSITIVE_FIELDS = new Set([
  'apikey',
  'apiKey',
  'apikeyUserId',
  'password',
  'secret',
  'token',
  'key',
  'user_id',
  'userid',
  'authorization',
  'cookie',
  'set-cookie',
  'jwt',
])
const SENSITIVE_FIELDS_LOWER = new Set(Array.from(SENSITIVE_FIELDS).map(f => f.toLowerCase()))

// Patterns to redact from error strings (API keys, secrets, bearer tokens, etc.)
const SENSITIVE_PATTERNS = [
  /sk_live_[a-zA-Z0-9]{24,}/g, // Stripe live secret key
  /sk_test_[a-zA-Z0-9]{24,}/g, // Stripe test secret key
  /ak_live_[a-zA-Z0-9]{24,}/g, // Generic API key live
  /ak_test_[a-zA-Z0-9]{24,}/g, // Generic API key test
  /Bearer\s+[\w.-]{20,}/gi, // Bearer tokens
  /[a-f0-9]{32,}/gi, // Long hex strings (likely keys/tokens) - case insensitive
  /[\w-]+\.[\w-]+\.[\w-]+={0,2}/g, // JWT/JWS (three base64url segments)
]

/**
 * Check if a field name is sensitive (exact match or contains sensitive substrings)
 */
function isSensitiveField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase()
  return SENSITIVE_FIELDS_LOWER.has(lower)
    || lower.includes('apikey')
    || lower.includes('password')
    || lower.includes('secret')
    || lower.includes('token')
    || lower.includes('key') // Catches capgkey, hashed_key, etc.
}

/**
 * Sanitize error strings by redacting sensitive patterns
 */
function sanitizeErrorString(str: string | undefined): string | undefined {
  if (!str)
    return str
  let sanitized = str
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]')
  }
  return sanitized
}

/**
 * Sanitize an object by redacting sensitive fields
 */
function sanitize(obj: any, seen = new WeakSet()): any {
  // Handle primitives - sanitize strings, return others as-is
  if (typeof obj !== 'object' || obj === null) {
    if (typeof obj === 'string') {
      return sanitizeErrorString(obj)
    }
    return obj
  }

  // Cycle detection (must run before Error handling to prevent infinite loops)
  if (seen.has(obj)) {
    return '[Circular]'
  }
  seen.add(obj)

  // Handle Error instances
  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: sanitizeErrorString(obj.message),
      stack: sanitizeErrorString(obj.stack),
      cause: obj.cause ? sanitize(obj.cause, seen) : undefined,
    }
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitize(item, seen))
  }

  const sanitized: any = {}
  for (const [key, value] of Object.entries(obj)) {
    // Check if field is sensitive (exact match or contains sensitive substrings)
    if (isSensitiveField(key)) {
      sanitized[key] = '[REDACTED]'
    }
    else if (typeof value === 'string') {
      sanitized[key] = sanitizeErrorString(value)
    }
    else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitize(value, seen)
    }
    else {
      sanitized[key] = value
    }
  }
  return sanitized
}

export function cloudlog(unsafeMessage: any) {
  // Always sanitize all inputs before any branching
  const safeMessage = sanitize(unsafeMessage)

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

export function serializeError(err: unknown, seen = new WeakSet<object>()) {
  if (typeof err === 'object' && err !== null) {
    if (seen.has(err)) {
      return { message: '[Circular]', stack: undefined, name: 'Error', cause: undefined }
    }
    seen.add(err)
  }
  if (err instanceof Error) {
    let sanitizedCause: any
    if (err.cause !== undefined) {
      if (err.cause instanceof Error) {
        // Recursively serialize and sanitize Error causes
        sanitizedCause = sanitize(serializeError(err.cause, seen))
      }
      else if (typeof err.cause === 'object' && err.cause !== null) {
        // Sanitize object causes
        sanitizedCause = sanitize(err.cause)
      }
      else {
        // For primitives, convert to string and sanitize
        sanitizedCause = sanitize(String(err.cause))
      }
    }
    return {
      name: err.name,
      message: sanitizeErrorString(err.message),
      stack: sanitizeErrorString(err.stack),
      cause: sanitizedCause,
    }
  }
  try {
    const rawMessage = JSON.stringify(err, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
    return {
      message: sanitizeErrorString(rawMessage),
      stack: undefined,
      name: 'Error',
      cause: undefined,
    }
  }
  catch {
    return {
      message: sanitizeErrorString(String(err)),
      stack: undefined,
      name: 'Error',
      cause: undefined,
    }
  }
}

export function cloudlogErr(unsafeMessage: any) {
  // Always sanitize all inputs before any branching
  const safeMessage = sanitize(unsafeMessage)

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
