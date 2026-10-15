import type { SupabaseClient, User } from '@supabase/supabase-js'
import { base64url } from 'jose'
import { parseSignupAttributionRecord } from '../../supabase/functions/shared/signup-attribution'
import { defaultApiHost } from './supabase'

const metadataKeys = ['registration_device_type', 'registration_os', 'registration_browser', 'registration_variant', 'registration_experiment', 'registration_experiment_variant']
interface PendingSocialOAuth {
  verifier: string
  state: string
  created: number
  websiteState?: string
  code?: string
}
export function createSocialOAuth(provider: 'apple' | 'google') {
  const storageKey = `capgo.${provider}-oauth.v1`
  let pendingCompletion: PendingSocialOAuth | null = null
  let landingError = false

  function readAttempt(): PendingSocialOAuth | null {
    try {
      const attempt = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
      if (attempt && Date.now() - attempt.created < 600_000)
        return attempt
    }
    catch {}
    sessionStorage.removeItem(storageKey)
    return null
  }

  async function start(url: URL) {
    const redirectUri = `${location.origin}/login`
    const capabilityResponse = await fetch(`${defaultApiHost}/auth/${provider}/capabilities`)
    const capabilities = await capabilityResponse.json() as { web?: { enabled: boolean, redirect_uris: string[] } }
    if (!capabilityResponse.ok || capabilities.web?.enabled !== true || !capabilities.web.redirect_uris?.includes(redirectUri))
      throw new Error('Social login is unavailable')
    const verifier = base64url.encode(crypto.getRandomValues(new Uint8Array(32)))
    const state = base64url.encode(crypto.getRandomValues(new Uint8Array(32)))
    const challenge = base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
    const fields = Object.fromEntries(url.searchParams)
    const registrationMetadata: Record<string, string> = { ...parseSignupAttributionRecord(fields) }
    for (const key of metadataKeys) {
      const value = url.searchParams.get(key)
      if (value)
        registrationMetadata[key] = value.slice(0, 100)
    }
    const websiteState = url.searchParams.get(`${provider}_website_state`) ?? ''
    const attempt: PendingSocialOAuth = {
      verifier,
      state,
      created: Date.now(),
      ...(/^[\w-]{32,128}$/.test(websiteState) ? { websiteState } : {}),
    }
    sessionStorage.setItem(storageKey, JSON.stringify(attempt))
    const response = await fetch(`${defaultApiHost}/auth/${provider}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uri: redirectUri, code_challenge: challenge, client_state: state, registration_metadata: registrationMetadata }),
    })
    const result = await response.json() as { authorization_url?: string }
    if (!response.ok || typeof result.authorization_url !== 'string')
      throw new Error('Social login could not start')
    location.assign(result.authorization_url)
  }

  function capture(url: URL) {
    const fragment = new URLSearchParams(url.hash.slice(1))
    if (!fragment.has(`${provider}_code`) && !fragment.has(`${provider}_error`))
      return false
    const other = provider === 'apple' ? 'google' : 'apple'
    const ambiguous = fragment.has(`${other}_code`) || fragment.has(`${other}_error`)
    url.hash = ''
    history.replaceState({}, '', url)
    const attempt = readAttempt()
    sessionStorage.removeItem(storageKey)
    if (fragment.get('state') !== attempt?.state || fragment.has(`${provider}_error`) || ambiguous) {
      pendingCompletion = null
      throw new Error('Social authorization failed')
    }
    const code = fragment.get(`${provider}_code`) ?? ''
    if (!/^[\w-]{43}$/.test(code))
      throw new Error('Social authorization failed')
    // Keep the returned code and verifier together only in memory, never in storage.
    pendingCompletion = { ...attempt, code }
    return true
  }

  // Run before router and analytics startup so the callback never becomes a page URL.
  function prepareLanding() {
    try {
      capture(new URL(location.href))
    }
    catch {
      pendingCompletion = null
      landingError = true
    }
  }

  function consumeLandingError() {
    const failed = landingError
    landingError = false
    return failed
  }

  function hasPending() {
    return !!pendingCompletion?.code && Date.now() - pendingCompletion.created < 600_000
  }

  async function complete(supabase: SupabaseClient, captchaToken?: string) {
    const attempt = pendingCompletion
    pendingCompletion = null
    if (!attempt?.code)
      throw new Error('Social authorization expired')
    const response = await fetch(`${defaultApiHost}/auth/${provider}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: attempt.code, code_verifier: attempt.verifier, captcha_token: captchaToken }),
    })
    const result = await response.json() as {
      user: User
      session: { access_token: string, refresh_token: string }
      is_new_user: boolean
      name_status: 'saved' | 'unavailable'
    }
    if (!response.ok || !result.user || !result.session)
      throw new Error('Social authentication failed')
    const { data, error } = await supabase.auth.setSession(result.session)
    if (error || !data.user)
      throw error || new Error('Social session could not be installed')
    if (attempt.websiteState && location.origin === 'https://console.capgo.app' && window.opener) {
      window.opener.postMessage({
        type: `capgo:${provider}-auth-complete`,
        state: attempt.websiteState,
        is_new_user: result.is_new_user,
        user: { id: result.user.id, email: result.user.email },
      }, 'https://capgo.app')
    }
    return result
  }

  return { provider, start, capture, hasPending, complete, prepareLanding, consumeLandingError }
}
