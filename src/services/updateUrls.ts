const explicitWebUrlPattern = /^https?:\/\//i
const explicitSchemeUrlPattern = /^[a-z][a-z\d+.-]*:\/\//i
const localHttpHosts = new Set(['localhost', '127.0.0.1', '::1'])

function isLocalHttpHost(hostname: string): boolean {
  const normalizedHostname = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname

  return localHttpHosts.has(normalizedHostname) || normalizedHostname.endsWith('.localhost')
}

export function normalizeUpdateUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('//') || trimmed.includes('\\'))
    return ''

  if (explicitSchemeUrlPattern.test(trimmed) && !explicitWebUrlPattern.test(trimmed))
    return ''

  const urlValue = explicitWebUrlPattern.test(trimmed) ? trimmed : `https://${trimmed}`

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
