export interface ChatGptCallback {
  code?: string
  state?: string
  clientId?: string
  error?: string
}

/**
 * Parse the loopback address the ChatGPT sign-in redirects to
 * (http://127.0.0.1:1455/auth/callback?code=...&state=...&client_id=...).
 * Returns null when the text is not that callback, so a wrong paste never reaches the server.
 */
export function parseChatGptCallback(value: string, redirectUri: string): ChatGptCallback | null {
  let url: URL
  let expected: URL
  try {
    url = new URL(value.trim())
    expected = new URL(redirectUri)
  }
  catch {
    return null
  }
  if (url.protocol !== expected.protocol || url.hostname !== expected.hostname || url.pathname !== expected.pathname)
    return null
  const get = (name: string) => url.searchParams.get(name) ?? undefined
  return { code: get('code'), state: get('state'), clientId: get('client_id'), error: get('error') }
}
