import type { SupabaseClient, User } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { ref } from 'vue'
import { invokeCapgoApi } from '~/services/capgoApi'
import { resolveSignupAttribution } from '~/services/signupAttribution'

interface GoogleSessionResponse {
  user: User
  session: { access_token: string, refresh_token: string }
  is_new_user: boolean
  name_status: 'saved' | 'unavailable'
  account_status: 'active' | 'disabled'
}

const binaryClientId = ref('')
const loginEnabled = ref(false)
let authorizationInProgress = false

function hasNativeGooglePlugins() {
  return Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === 'android'
    && Capacitor.isPluginAvailable('SocialLogin')
    && Capacitor.isPluginAvailable('Env')
}

export function isAndroidGoogleLoginAvailable(reauthenticate = false) {
  return hasNativeGooglePlugins()
    && !!binaryClientId.value
    && (reauthenticate || (import.meta.env.VITE_ANDROID_GOOGLE_LOGIN_ENABLED === 'true' && loginEnabled.value))
}

export async function prepareAndroidGoogleLogin(apiHost: string) {
  binaryClientId.value = ''
  loginEnabled.value = false
  if (!hasNativeGooglePlugins())
    return

  try {
    const { Env } = await import('@capgo/capacitor-env')
    const [supported, client] = await Promise.all([
      Env.getKey({ key: 'CAPGO_NATIVE_GOOGLE_LOGIN' }),
      Env.getKey({ key: 'CAPGO_GOOGLE_WEB_CLIENT_ID' }),
    ])
    // This marker comes from the installed binary, so an OTA cannot enable
    // Google on an older binary that omitted the provider's native libraries.
    if (supported.value !== 'true' || !/^[\w-]+\.apps\.googleusercontent\.com$/.test(client.value))
      return
    binaryClientId.value = client.value
    if (import.meta.env.VITE_ANDROID_GOOGLE_LOGIN_ENABLED !== 'true')
      return

    const response = await fetch(`${apiHost}/auth/google/capabilities`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok)
      return
    const capabilities = await response.json() as { native?: { enabled?: unknown, web_client_id?: unknown } }
    loginEnabled.value = capabilities.native?.enabled === true
      && capabilities.native.web_client_id === binaryClientId.value
  }
  catch {
    // Keep a configured binary's reauthentication available when signup rollout
    // is off or capability lookup fails. The backend still validates identity.
    loginEnabled.value = false
  }
}

export async function signInWithGoogle(supabase: SupabaseClient, captchaToken?: string, options: { reauthenticate?: boolean } = {}) {
  if (!isAndroidGoogleLoginAvailable(options.reauthenticate))
    throw new Error('Google login requires a configured native Android binary')
  if (authorizationInProgress)
    throw new Error('Google authorization is already in progress')
  authorizationInProgress = true

  try {
    let expectedUserId: string | undefined
    if (options.reauthenticate) {
      const { data, error } = await supabase.auth.getClaims()
      if (error || !data?.claims?.sub)
        throw new Error('Google reauthentication requires an existing session')
      expectedUserId = data.claims.sub
    }

    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))
    const hashedNonce = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    const { SocialLogin } = await import('@capgo/capacitor-social-login')
    await SocialLogin.initialize({ google: { webClientId: binaryClientId.value, mode: 'online' } })
    let credential
    try {
      credential = await SocialLogin.login({
        provider: 'google',
        // The online provider already requests email/profile/openid. Explicit
        // scopes require an Activity interface that this app does not install.
        options: { nonce: hashedNonce, style: 'standard', filterByAuthorizedAccounts: false, autoSelectEnabled: false },
      })
    }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'USER_CANCELLED')
        return null
      throw new Error('Google authorization failed')
    }
    if (credential.result.responseType !== 'online' || !credential.result.idToken)
      throw new Error('Google did not return an identity token')

    const { data: result, error } = await invokeCapgoApi<GoogleSessionResponse>('auth/google', {
      client: supabase,
      allowAnonymous: !options.reauthenticate,
      body: {
        id_token: credential.result.idToken,
        nonce,
        access_token: credential.result.accessToken?.token,
        captcha_token: captchaToken,
        reauthenticate: options.reauthenticate === true,
        ...(!options.reauthenticate
          ? { registration_metadata: {
              ...resolveSignupAttribution(),
              registration_device_type: 'mobile',
              registration_os: 'android',
              registration_browser: 'native',
            } }
          : {}),
      },
    })
    if (error || !result?.user?.id || !result.session?.access_token || !result.session.refresh_token || typeof result.is_new_user !== 'boolean' || !['saved', 'unavailable'].includes(result.name_status) || !['active', 'disabled'].includes(result.account_status))
      throw new Error('Google login did not return a session')
    if (expectedUserId && result.user.id !== expectedUserId)
      throw new Error('Google account does not match the current account')

    const { data, error: sessionError } = await supabase.auth.setSession(result.session)
    if (sessionError || !data.user || !data.session || data.user.id !== result.user.id || data.session.user?.id !== result.user.id) {
      await supabase.auth.signOut({ scope: 'local' })
      throw new Error('Google session could not be established')
    }
    return {
      user: data.user,
      isNewUser: result.is_new_user,
      nameUnavailable: result.name_status === 'unavailable',
      accountStatus: result.account_status,
    }
  }
  finally {
    authorizationInProgress = false
  }
}
