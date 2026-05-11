const SENSITIVE_QUERY_KEY_PARTS = [
  'apikey',
  'authorization',
  'authcode',
  'capgkey',
  'capgoapi',
  'jwt',
  'oauthcode',
  'password',
  'secret',
  'session',
  'token',
]

const SENSITIVE_QUERY_KEYS = new Set(['code', 'key'])

function isSensitiveQueryKey(key: string) {
  const compactKey = key.toLowerCase().replace(/[-_]/g, '')
  return SENSITIVE_QUERY_KEYS.has(compactKey) || SENSITIVE_QUERY_KEY_PARTS.some(part => compactKey.includes(part))
}

export function redactQueryForLog(query: Record<string, string>) {
  return Object.fromEntries(Object.entries(query).map(([key, value]) => [
    key,
    isSensitiveQueryKey(key) ? '[REDACTED]' : value,
  ]))
}

export function redactUrlForLog(urlValue: string) {
  try {
    const url = new URL(urlValue)
    for (const key of Array.from(url.searchParams.keys())) {
      if (isSensitiveQueryKey(key))
        url.searchParams.set(key, '[REDACTED]')
    }
    return url.toString()
  }
  catch {
    return urlValue
  }
}
