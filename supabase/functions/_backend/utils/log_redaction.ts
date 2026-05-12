/**
 * Sensitive query parameter name patterns.
 * Values for these keys are replaced with '[REDACTED]' before logging
 * so that API keys, tokens, and passwords never appear in log output.
 */
const SENSITIVE_QUERY_PARAM_PATTERNS: RegExp[] = [
  /^api[_-]?key$/i,
  /^apikey$/i,
  /^capgkey$/i,
  /^access[_-]?token$/i,
  /^auth(?:orization)?$/i,
  /^token$/i,
  /^password$/i,
  /^passwd$/i,
  /^secret$/i,
  /^private[_-]?key$/i,
  /^key$/i,
  /^credential$/i,
  /^sig(?:nature)?$/i,
  /^x-amz-signature$/i,
  /^x-amz-credential$/i,
  /^x-amz-security-token$/i,
  /^client[_-]?secret$/i,
  /^refresh[_-]?token$/i,
  /^id[_-]?token$/i,
]

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_QUERY_PARAM_PATTERNS.some(pattern => pattern.test(key))
}

/**
 * Returns a copy of the query params object with sensitive values replaced
 * by '[REDACTED]'. Non-sensitive values are preserved for operational debugging.
 */
export function redactQueryParams(params: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    result[key] = isSensitiveKey(key) ? '[REDACTED]' : value
  }
  return result
}

/**
 * Returns a copy of the URL string with sensitive query parameter values
 * replaced by '[REDACTED]'. The URL structure and non-sensitive params are
 * preserved so not-found logs remain useful for debugging routing issues.
 */
export function redactUrl(rawUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  }
  catch {
    // If URL is unparsable, return without any modification
    return rawUrl
  }

  let hasRedacted = false
  for (const [key] of parsed.searchParams.entries()) {
    if (isSensitiveKey(key)) {
      parsed.searchParams.set(key, '[REDACTED]')
      hasRedacted = true
    }
  }

  return hasRedacted ? parsed.toString() : rawUrl
}
