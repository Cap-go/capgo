export const ANDROID_APPLE_REDIRECT_URI = 'capgo://apple-auth/callback'

export function isAppleAuthRedirect(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'capgo:' && url.hostname === 'apple-auth'
  }
  catch {
    return false
  }
}

export async function loadAndroidAppleAvailability(apiHost: string) {
  try {
    const response = await fetch(`${apiHost}/auth/apple/capabilities`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok)
      return false
    const result = await response.json() as { web?: { enabled?: unknown, redirect_uris?: unknown } }
    return result.web?.enabled === true
      && Array.isArray(result.web.redirect_uris)
      && result.web.redirect_uris.includes(ANDROID_APPLE_REDIRECT_URI)
  }
  catch {
    return false
  }
}
