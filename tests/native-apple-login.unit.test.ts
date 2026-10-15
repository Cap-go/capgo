import type { SupabaseClient } from '@supabase/supabase-js'
import { Buffer } from 'node:buffer'
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isNativeAppleLoginAvailable, signInWithApple } from '../src/services/nativeAppleLogin'

const native = vi.hoisted(() => ({ platform: 'ios', available: true, isNative: true }))
const enabled = vi.hoisted(() => ({ value: true }))
vi.mock('~/services/supabase', () => ({ nativeAppleLoginEnabled: enabled }))
const plugin = vi.hoisted(() => ({ initialize: vi.fn(), login: vi.fn() }))
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => native.isNative,
    getPlatform: () => native.platform,
    isPluginAvailable: () => native.available,
  },
}))
vi.mock('@capgo/capacitor-social-login', () => ({ SocialLogin: plugin }))

function client() {
  const user = { id: 'apple-user', email: 'apple-user@example.com', user_metadata: {} }
  return {
    auth: {
      signInWithIdToken: vi.fn().mockResolvedValue({ data: { user, session: { user } }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  enabled.value = true
  native.platform = 'ios'
  native.available = true
  native.isNative = true
  plugin.initialize.mockResolvedValue(undefined)
  plugin.login.mockResolvedValue({
    provider: 'apple',
    result: { idToken: 'verified-by-supabase', profile: { givenName: 'Example', familyName: 'Person' } },
  })
})

describe('native Apple login', () => {
  it('never offers Apple login on web, Android, or an older iOS binary without the plugin', async () => {
    const supabase = client()
    for (const state of [
      { platform: 'web', available: true, isNative: false },
      { platform: 'android', available: true, isNative: true },
      { platform: 'ios', available: false, isNative: true },
    ]) {
      Object.assign(native, state)
      expect(isNativeAppleLoginAvailable()).toBe(false)
      await expect(signInWithApple(supabase as unknown as SupabaseClient)).rejects.toThrow()
    }
    expect(plugin.initialize).not.toHaveBeenCalled()
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
  })

  it('exchanges the Apple token with Supabase using a fresh nonce and preserves the first-login name', async () => {
    const supabase = client()
    expect(isNativeAppleLoginAvailable()).toBe(true)
    await signInWithApple(supabase as unknown as SupabaseClient, 'captcha-token')
    const credential = supabase.auth.signInWithIdToken.mock.calls[0][0]
    const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(credential.nonce))
    const expectedHash = Buffer.from(digest).toString('hex')
    expect(plugin.initialize).toHaveBeenCalledWith({ apple: { useProperTokenExchange: true } })
    expect(plugin.login).toHaveBeenCalledWith({ provider: 'apple', options: { scopes: ['email', 'name'], nonce: expectedHash } })
    expect(credential).toMatchObject({ provider: 'apple', token: 'verified-by-supabase', options: { captchaToken: 'captcha-token' } })
    expect(credential.nonce).toMatch(/^[a-f0-9]{64}$/)
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ data: { first_name: 'Example', last_name: 'Person', full_name: 'Example Person' } })
    await signInWithApple(supabase as unknown as SupabaseClient)
    expect(supabase.auth.signInWithIdToken.mock.calls[1][0].nonce).not.toBe(credential.nonce)
  })

  it('does not erase names on returning Apple sign-ins', async () => {
    const supabase = client()
    plugin.login.mockResolvedValue({ provider: 'apple', result: { idToken: 'verified-by-supabase', profile: { givenName: null, familyName: null } } })
    await signInWithApple(supabase as unknown as SupabaseClient)
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('preserves an existing account name when Apple supplies a different name', async () => {
    const supabase = client()
    supabase.auth.signInWithIdToken.mockResolvedValue({ data: { user: { id: 'apple-user', user_metadata: { first_name: 'Chosen', last_name: 'Name', full_name: 'Chosen Name' } }, session: {} }, error: null })
    await signInWithApple(supabase as unknown as SupabaseClient)
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('honors the server kill switch even on a supported iOS binary', async () => {
    enabled.value = false
    expect(isNativeAppleLoginAvailable()).toBe(false)
    await expect(signInWithApple(client() as unknown as SupabaseClient)).rejects.toThrow()
    expect(plugin.initialize).not.toHaveBeenCalled()
  })

  it('treats cancelling the Apple sheet as a normal exit', async () => {
    const supabase = client()
    plugin.login.mockRejectedValue({ code: 'USER_CANCELLED' })
    await expect(signInWithApple(supabase as unknown as SupabaseClient)).resolves.toBeNull()
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
  })

  it('rejects a missing identity token without attempting authentication', async () => {
    const supabase = client()
    plugin.login.mockResolvedValue({ provider: 'apple', result: { idToken: null, profile: {} } })
    await expect(signInWithApple(supabase as unknown as SupabaseClient)).rejects.toThrow()
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
  })

  it('propagates rejected credentials and requires a real Supabase session', async () => {
    const supabase = client()
    supabase.auth.signInWithIdToken.mockResolvedValueOnce({ data: { user: null, session: null }, error: new Error('Invalid nonce') })
    await expect(signInWithApple(supabase as unknown as SupabaseClient)).rejects.toThrow('Invalid nonce')
    supabase.auth.signInWithIdToken.mockResolvedValueOnce({ data: { user: null, session: null }, error: null })
    await expect(signInWithApple(supabase as unknown as SupabaseClient)).rejects.toThrow()
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('keeps a successful login if optional name persistence fails', async () => {
    const supabase = client()
    supabase.auth.updateUser.mockResolvedValue({ data: { user: null }, error: new Error('Profile unavailable') })
    await expect(signInWithApple(supabase as unknown as SupabaseClient)).resolves.toMatchObject({ user: { id: 'apple-user' }, profileSaveFailed: true })
  })
})
