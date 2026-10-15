import type { SupabaseClient, User } from '@supabase/supabase-js'
import { base64url } from 'jose'
import { parseSignupAttributionRecord } from '../../supabase/functions/shared/signup-attribution'
import { defaultApiHost } from './supabase'

const storageKey = 'capgo.apple-oauth.v1'
const metadataKeys = ['registration_device_type', 'registration_os', 'registration_browser', 'registration_variant', 'registration_experiment', 'registration_experiment_variant']
interface PendingAppleOAuth {
  verifier: string
  state: string
  created: number
  websiteState?: string
  code?: string
}

function readAttempt(): PendingAppleOAuth | null {
  try {
    const attempt = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
    if (attempt && Date.now() - attempt.created < 600_000)
      return attempt
  }
  catch {}
  sessionStorage.removeItem(storageKey)
  return null
}

export async function startAppleOAuth(url: URL) {
  const redirectUri = `${location.origin}/login`
  const capabilityResponse = await fetch(`${defaultApiHost}/auth/apple/capabilities`)
  const capabilities = await capabilityResponse.json() as { web?: { enabled: boolean, redirect_uris: string[] } }
  if (!capabilityResponse.ok || capabilities.web?.enabled !== true || !capabilities.web.redirect_uris?.includes(redirectUri))
    throw new Error('Apple login is unavailable')
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
  const websiteState = url.searchParams.get('apple_website_state') ?? ''
  const attempt: PendingAppleOAuth = {
    verifier,
    state,
    created: Date.now(),
    ...(/^[\w-]{32,128}$/.test(websiteState) ? { websiteState } : {}),
  }
  sessionStorage.setItem(storageKey, JSON.stringify(attempt))
  const response = await fetch(`${defaultApiHost}/auth/apple/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uri: redirectUri, code_challenge: challenge, client_state: state, registration_metadata: registrationMetadata }),
  })
  const result = await response.json() as { authorization_url?: string }
  if (!response.ok || typeof result.authorization_url !== 'string')
    throw new Error('Apple login could not start')
  location.assign(result.authorization_url)
}

export function captureAppleOAuthCallback(url: URL) {
  const fragment = new URLSearchParams(url.hash.slice(1))
  if (!fragment.has('apple_code') && !fragment.has('apple_error'))
    return false
  url.hash = ''
  history.replaceState({}, '', url)
  const attempt = readAttempt()
  if (!attempt || fragment.get('state') !== attempt.state || fragment.has('apple_error')) {
    sessionStorage.removeItem(storageKey)
    throw new Error('Apple authorization failed')
  }
  const code = fragment.get('apple_code') ?? ''
  if (!/^[\w-]{43}$/.test(code))
    throw new Error('Apple authorization failed')
  sessionStorage.setItem(storageKey, JSON.stringify({ ...attempt, code }))
  return true
}

export function hasPendingAppleOAuth() {
  return !!readAttempt()?.code
}

export async function completeAppleOAuth(supabase: SupabaseClient, captchaToken?: string) {
  const attempt = readAttempt()
  if (!attempt?.code)
    throw new Error('Apple authorization expired')
  sessionStorage.removeItem(storageKey)
  const response = await fetch(`${defaultApiHost}/auth/apple/exchange`, {
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
    throw new Error('Apple authentication failed')
  const { data, error } = await supabase.auth.setSession(result.session)
  if (error || !data.user)
    throw error || new Error('Apple session could not be installed')
  if (attempt.websiteState && location.origin === 'https://console.capgo.app' && window.opener) {
    window.opener.postMessage({
      type: 'capgo:apple-auth-complete',
      state: attempt.websiteState,
      is_new_user: result.is_new_user,
      user: { id: result.user.id, email: result.user.email },
    }, 'https://capgo.app')
  }
  return result
}
