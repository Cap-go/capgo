interface SafeRedirectOptions {
  blockedPaths?: string[]
  blockedPrefixes?: string[]
}

const defaultRedirectPath = '/dashboard'
const redirectBaseUrl = 'https://app.capgo.local'

function hasControlCharacter(path: string): boolean {
  return Array.from(path).some((char) => {
    const codePoint = char.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127
  })
}

export function isSafeRedirectPath(path: string): boolean {
  const trimmedPath = path.trim()
  if (trimmedPath.length === 0 || path !== trimmedPath)
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
