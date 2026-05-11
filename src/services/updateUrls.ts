const explicitSchemePattern = /^[a-z][a-z\d+.-]*:/i
const localHttpHosts = new Set(['localhost', '127.0.0.1', '::1'])

function isLocalHttpHost(hostname: string): boolean {
  return localHttpHosts.has(hostname) || hostname.endsWith('.localhost')
}

export function normalizeUpdateUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('//') || trimmed.includes('\\'))
    return ''

  const urlValue = explicitSchemePattern.test(trimmed) ? trimmed : `https://${trimmed}`

  let parsedUrl: URL
  try {
    parsedUrl = new URL(urlValue)
  }
  catch {
    return ''
  }

  if (parsedUrl.username || parsedUrl.password)
    return ''

  if (parsedUrl.protocol === 'https:')
    return parsedUrl.toString()

  if (parsedUrl.protocol === 'http:' && isLocalHttpHost(parsedUrl.hostname))
    return parsedUrl.toString()

  return ''
}

export function isAllowedUpdateUrl(value: string): boolean {
  return normalizeUpdateUrl(value) !== ''
}
