// Fields that should be completely removed from logs (never logged)
const REMOVED_FIELD_MARKERS = ['password']
// Fields that should show first 4 and last 4 characters
const PARTIALLY_REDACTED_FIELD_MARKERS = [
  'secret',
  'token',
  'apikey',
  'authorization',
  'credential',
  'privatekey',
  'sessionkey',
]

// Partially redact a value - show first 4 and last 4 characters
function partialRedact(value: string): string {
  if (value.length <= 8) {
    return '***REDACTED***'
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

function normalizedFieldName(field: string): string {
  return field.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function shouldRemoveField(field: string): boolean {
  const normalized = normalizedFieldName(field)
  return REMOVED_FIELD_MARKERS.some(marker => normalized.includes(marker))
}

function shouldPartiallyRedactField(field: string): boolean {
  const normalized = normalizedFieldName(field)
  return PARTIALLY_REDACTED_FIELD_MARKERS.some(marker =>
    normalized.includes(marker),
  )
}

function sanitizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(sanitizeJsonValue)

  if (typeof value === 'string')
    return sanitizeKeyValueSegments(value)

  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [key, nestedValue] of Object.entries(value)) {
      if (shouldRemoveField(key))
        continue

      if (shouldPartiallyRedactField(key)) {
        sanitized[key] = partialRedact(String(nestedValue ?? ''))
        continue
      }

      sanitized[key] = sanitizeJsonValue(nestedValue)
    }
    return sanitized
  }

  return value
}

function decodeComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  }
  catch {
    return value
  }
}

function sanitizeKeyValueSegments(value: string): string {
  const hashIndex = value.indexOf('#')
  const suffix = hashIndex === -1 ? '' : value.slice(hashIndex)
  const valueWithoutHash = hashIndex === -1 ? value : value.slice(0, hashIndex)
  const queryIndex = valueWithoutHash.indexOf('?')
  const prefix = queryIndex === -1 ? '' : valueWithoutHash.slice(0, queryIndex + 1)
  const query = queryIndex === -1 ? valueWithoutHash : valueWithoutHash.slice(queryIndex + 1)

  if (!query.includes('='))
    return value

  const sanitizedSegments = query.split('&').flatMap((segment) => {
    const separatorIndex = segment.indexOf('=')
    if (separatorIndex === -1)
      return [segment]

    const key = segment.slice(0, separatorIndex)
    const decodedKey = decodeComponent(key)
    if (shouldRemoveField(decodedKey))
      return []

    if (!shouldPartiallyRedactField(decodedKey))
      return [segment]

    const rawValue = segment.slice(separatorIndex + 1)
    return [`${key}=${encodeURIComponent(partialRedact(decodeComponent(rawValue)))}`]
  })

  return `${prefix}${sanitizedSegments.join('&')}${suffix}`
}

// Remove or redact sensitive fields from a string that might contain JSON
export function sanitizeSensitiveFromString(str: string): string {
  try {
    return JSON.stringify(sanitizeJsonValue(JSON.parse(str)))
  }
  catch {
    // Fall back to string replacement for non-JSON payloads.
  }

  return sanitizeKeyValueSegments(str)
}

// Sanitize sensitive headers - remove or redact
export function sanitizeSensitiveHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase()
    // Skip password-related headers entirely
    if (shouldRemoveField(lowerKey)) {
      continue
    }
    else if (shouldPartiallyRedactField(lowerKey)) {
      sanitized[key] = partialRedact(value)
    }
    else {
      sanitized[key] = value
    }
  }
  return sanitized
}
