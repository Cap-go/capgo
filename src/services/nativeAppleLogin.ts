import type { AppleProviderResponse } from '@capgo/capacitor-social-login'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { nativeAppleLoginEnabled } from './supabase'

export function isNativeAppleLoginAvailable(reauthenticate = false) {
  return (reauthenticate || nativeAppleLoginEnabled.value)
    && Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === 'ios'
    && Capacitor.isPluginAvailable('SocialLogin')
}

export async function signInWithApple(supabase: SupabaseClient, captchaToken?: string, options: { reauthenticate?: boolean } = {}) {
  if (!isNativeAppleLoginAvailable(options.reauthenticate))
    throw new Error('Apple login requires the native iOS SocialLogin plugin')

  const { SocialLogin } = await import('@capgo/capacitor-social-login')
  await SocialLogin.initialize({ apple: { useProperTokenExchange: true } })

  // Apple receives the hash; Supabase verifies it against this attempt's raw nonce.
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))
  const hashedNonce = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  let credential
  try {
    credential = await SocialLogin.login({ provider: 'apple', options: { scopes: ['email', 'name'], nonce: hashedNonce } })
  }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'USER_CANCELLED')
      return null
    throw error
  }

  if (!credential.result.idToken)
    throw new Error('Apple did not return an identity token')

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.result.idToken,
    nonce,
    options: { captchaToken },
  })
  if (error)
    throw error
  if (!data.session || !data.user)
    throw new Error('Apple login did not create a Supabase session')

  const profileSaveFailed = await saveAppleProfile(supabase, data.user, credential.result.profile)
  return { user: data.user, profileSaveFailed, authorizationCode: credential.result.authorizationCode }
}

async function saveAppleProfile(supabase: SupabaseClient, user: User, profile: AppleProviderResponse['profile']) {
  // Apple supplies names only on the first authorization. Do not replace chosen names.
  const firstName = profile.givenName?.trim()
  const lastName = profile.familyName?.trim()
  const metadata: Record<string, string> = {}
  if (firstName && !user.user_metadata.first_name)
    metadata.first_name = firstName
  if (lastName && !user.user_metadata.last_name)
    metadata.last_name = lastName
  if ((firstName || lastName) && !user.user_metadata.full_name)
    metadata.full_name = [firstName, lastName].filter(Boolean).join(' ')

  if (Object.keys(metadata).length === 0)
    return false
  try {
    const { error } = await supabase.auth.updateUser({ data: metadata })
    return !!error
  }
  catch {
    return true
  }
}
