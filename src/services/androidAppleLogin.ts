import type { SupabaseClient, User } from '@supabase/supabase-js'
import { ANDROID_APPLE_REDIRECT_URI } from './appleAuthRedirect'
import { invokeCapgoApi } from './capgoApi'

interface AppleSessionResponse {
  user: User
  session: { access_token: string, refresh_token: string }
  name_status: 'saved' | 'unavailable'
  authorization_code?: string
}

let authorizationInProgress = false

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isAndroidAppleLoginBuildEnabled() {
  // Enable only in a new native build after the Services ID and backend are ready.
  return import.meta.env.VITE_ANDROID_APPLE_LOGIN_ENABLED === 'true'
}

function isBrowserCancellation(error: unknown) {
  if (!error || typeof error !== 'object')
    return false
  return ('code' in error && error.code === 'USER_CANCELLED')
    || ('message' in error && error.message === 'OAuth cancelled or no callback received')
}

export async function signInWithAppleOnAndroid(supabase: SupabaseClient, captchaToken?: string, reauthenticate = false) {
  if (authorizationInProgress)
    throw new Error('Apple authorization is already in progress')
  authorizationInProgress = true

  try {
    let expectedUserId: string | undefined
    if (reauthenticate) {
      const { data, error } = await supabase.auth.getClaims()
      if (error || !data?.claims?.sub)
        throw new Error('Apple reauthentication requires an existing session')
      expectedUserId = data.claims.sub
    }

    // Keep both secrets in memory. A process restart requires a new attempt.
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
    const state = base64url(crypto.getRandomValues(new Uint8Array(32)))
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
    const challenge = base64url(new Uint8Array(digest))
    const { data: start, error: startError } = await invokeCapgoApi<{ authorization_url: string }>('auth/apple/start', {
      client: supabase,
      allowAnonymous: !reauthenticate,
      body: { redirect_uri: ANDROID_APPLE_REDIRECT_URI, code_challenge: challenge, client_state: state, reauthenticate },
    })
    if (startError || !start?.authorization_url)
      throw new Error('Apple authorization could not start')
    const authorizationUrl = new URL(start.authorization_url)
    if (authorizationUrl.origin !== 'https://appleid.apple.com' || authorizationUrl.pathname !== '/auth/authorize' || authorizationUrl.username || authorizationUrl.password)
      throw new Error('Invalid Apple authorization URL')

    const { SocialLogin } = await import('@capgo/capacitor-social-login')
    let redirectedUri: string
    try {
      // The provider's Android login() flow expects tokens in a redirect. Use its
      // Custom Tab API so only the backend's verifier-bound code returns here.
      ;({ redirectedUri } = await SocialLogin.openSecureWindow({ authEndpoint: authorizationUrl.href, redirectUri: ANDROID_APPLE_REDIRECT_URI }))
    }
    catch (error) {
      if (isBrowserCancellation(error))
        return null
      throw new Error('Apple browser authorization failed')
    }

    const callback = new URL(redirectedUri)
    if (`${callback.protocol}//${callback.host}${callback.pathname}` !== ANDROID_APPLE_REDIRECT_URI || callback.username || callback.password || callback.search)
      throw new Error('Invalid Apple callback')
    const fragment = new URLSearchParams(callback.hash.slice(1))
    if (fragment.getAll('state').length !== 1 || fragment.get('state') !== state)
      throw new Error('Apple callback does not match this attempt')
    if (fragment.has('apple_error')) {
      if (fragment.get('apple_error') === 'apple_authorization_failed' && !fragment.has('apple_code'))
        return null
      throw new Error('Apple authorization failed')
    }
    const code = fragment.get('apple_code')
    if (!code || code.length > 2048 || fragment.getAll('apple_code').length !== 1)
      throw new Error('Missing Apple exchange code')

    const { data: result, error } = await invokeCapgoApi<AppleSessionResponse>('auth/apple/exchange', {
      client: supabase,
      allowAnonymous: !reauthenticate,
      body: { code, code_verifier: verifier, captcha_token: captchaToken },
    })
    if (error || !result?.user?.id || !result.session?.access_token || !result.session.refresh_token)
      throw new Error('Apple login did not return a session')
    if (expectedUserId && result.user.id !== expectedUserId)
      throw new Error('Apple account does not match the current account')

    const { data: authenticated, error: sessionError } = await supabase.auth.setSession(result.session)
    if (sessionError || !authenticated.user || !authenticated.session || authenticated.user.id !== result.user.id) {
      await supabase.auth.signOut({ scope: 'local' })
      throw new Error('Apple session could not be established')
    }
    return {
      user: authenticated.user,
      profileSaveFailed: false,
      nameUnavailable: result.name_status === 'unavailable',
      authorizationCode: result.authorization_code,
      authorizationClient: 'web' as const,
    }
  }
  finally {
    authorizationInProgress = false
  }
}
