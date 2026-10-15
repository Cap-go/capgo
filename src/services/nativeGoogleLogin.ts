import type { SupabaseClient, User } from '@supabase/supabase-js'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { gte, valid } from 'semver'
import { ref, shallowRef } from 'vue'
import { defaultApiHost } from './supabase'

interface GoogleNativeConfiguration {
  enabled: boolean
  ios_client_id: string
  web_client_id: string
  ios_min_version: string
}
const configuration = shallowRef<GoogleNativeConfiguration | null>(null)
export const nativeGoogleLoginEnabled = ref(false)

function hasNativeGoogleRuntime() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('SocialLogin')
}

export function isNativeGoogleLoginAvailable(reauthenticate = false) {
  return hasNativeGoogleRuntime() && !!configuration.value && (reauthenticate || nativeGoogleLoginEnabled.value)
}

export async function loadNativeGoogleConfiguration(reauthenticate = false) {
  try {
    if (!hasNativeGoogleRuntime())
      throw new Error('Unsupported platform')
    const response = await fetch(`${defaultApiHost}/auth/google/capabilities`)
    const result = await response.json() as { native?: GoogleNativeConfiguration }
    const config = result.native
    if (!response.ok || !config?.ios_client_id?.endsWith('.apps.googleusercontent.com')
      || !config.web_client_id?.endsWith('.apps.googleusercontent.com') || !valid(config.ios_min_version)) {
      throw new Error('Google configuration unavailable')
    }
    // This is the native binary version, never the version of an OTA web bundle.
    const info = await App.getInfo()
    if (!valid(info.version) || !gte(info.version, config.ios_min_version))
      throw new Error('Google requires a newer native binary')
    configuration.value = config
    nativeGoogleLoginEnabled.value = config.enabled === true
    return reauthenticate || nativeGoogleLoginEnabled.value
  }
  catch {
    configuration.value = null
    nativeGoogleLoginEnabled.value = false
    return false
  }
}

export async function signInWithGoogle(supabase: SupabaseClient, captchaToken?: string, options: { reauthenticate?: boolean } = {}) {
  if (!await loadNativeGoogleConfiguration(options.reauthenticate) || !configuration.value)
    throw new Error('Google login is unavailable on this native binary')
  const { data: current } = options.reauthenticate ? await supabase.auth.getSession() : { data: { session: null } }
  if (options.reauthenticate && !current.session)
    throw new Error('Authentication required')
  const { SocialLogin } = await import('@capgo/capacitor-social-login')
  await SocialLogin.initialize({ google: { mode: 'online', iOSClientId: configuration.value.ios_client_id, iOSServerClientId: configuration.value.web_client_id } })
  const nonce = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('')
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)))
  const hash = [...digest].map(b => b.toString(16).padStart(2, '0')).join('')
  let credential
  try {
    // Avoid the SDK's cached restore path, which can return a different nonce.
    credential = await SocialLogin.login({ provider: 'google', options: { scopes: ['openid', 'email', 'profile'], nonce: hash, forcePrompt: true } })
  }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'USER_CANCELLED')
      return null
    throw error
  }
  if (credential.result.responseType !== 'online' || !credential.result.idToken)
    throw new Error('Google did not return an identity token')
  const response = await fetch(`${defaultApiHost}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(current.session ? { Authorization: `Bearer ${current.session.access_token}` } : {}) },
    body: JSON.stringify({
      id_token: credential.result.idToken,
      access_token: credential.result.accessToken?.token,
      nonce,
      captcha_token: captchaToken,
      reauthenticate: options.reauthenticate,
      registration_metadata: { registration_device_type: 'mobile', registration_os: 'iOS', registration_browser: 'native' },
    }),
  })
  const result = await response.json() as { user?: User, session?: { access_token: string, refresh_token: string }, name_status?: string, is_new_user?: boolean, error?: string }
  if (!response.ok || !result.user || !result.session)
    throw new Error(result.error || 'Google authentication failed')
  if (current.session && result.user.id !== current.session.user.id)
    throw new Error('Google account does not match the authenticated account')
  const { data, error } = await supabase.auth.setSession(result.session)
  if (error || !data.user)
    throw error || new Error('Google session could not be installed')
  return { user: data.user, nameUnavailable: result.name_status === 'unavailable', isNewUser: result.is_new_user === true }
}
