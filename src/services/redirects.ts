interface SafeRedirectOptions {
  blockedPaths?: string[]
  blockedPrefixes?: string[]
}

const defaultRedirectPath = '/dashboard'
const redirectBaseUrl = 'https://app.capgo.local'

function hasControlCharacter(path: string): boolean {
  return Array.from(path).some((char) => {
    const codePoint = char.charCodeAt(0)
    return codePoint <= 31 || codePoint === 127
  })
}

export function isSafeRedirectPath(path: string): boolean {
  if (!path || path !== path.trim())
    return false

  if (!path.startsWith('/') || path.startsWith('//'))
    return false

  if (path.includes('\\') || hasControlCharacter(path))
    return false

  try {
    const parsedUrl = new URL(path, redirectBaseUrl)
    return parsedUrl.origin === redirectBaseUrl && parsedUrl.pathname.startsWith('/')
  }
  catch {
    return false
  }
}

function hasBlockedPrefix(path: string, prefix: string): boolean {
  return path === prefix
    || path.startsWith(`${prefix}/`)
    || path.startsWith(`${prefix}?`)
    || path.startsWith(`${prefix}#`)
}

function isBlockedRedirectPath(path: string, options: SafeRedirectOptions): boolean {
  return options.blockedPaths?.includes(path) === true
    || options.blockedPrefixes?.some(prefix => hasBlockedPrefix(path, prefix)) === true
}

export function getSafeRedirectPath(target: unknown, fallback = defaultRedirectPath, options: SafeRedirectOptions = {}): string {
  const fallbackPath = fallback === ''
    || (isSafeRedirectPath(fallback) && !isBlockedRedirectPath(fallback, options))
    ? fallback
    : defaultRedirectPath

  if (typeof target !== 'string')
    return fallbackPath

  if (!isSafeRedirectPath(target) || isBlockedRedirectPath(target, options))
    return fallbackPath

  return target
}
