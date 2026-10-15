import type { SupabaseClient } from '@supabase/supabase-js'
import { Buffer } from 'node:buffer'
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isNativeAppleLoginAvailable, signInWithApple } from '../src/services/nativeAppleLogin'

const native = vi.hoisted(() => ({ platform: 'ios', available: true, isNative: true }))
const enabled = vi.hoisted(() => ({ value: true }))
const androidReady = vi.hoisted(() => ({ value: true }))
vi.mock('~/services/supabase', () => ({ nativeAppleLoginEnabled: enabled, androidAppleLoginReady: androidReady, defaultApiHost: 'https://api.example.test' }))
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
      getSession: vi.fn().mockResolvedValue({ data: { session: { user, access_token: 'existing-session' } }, error: null }),
      setSession: vi.fn().mockResolvedValue({ data: { user, session: { user } }, error: null }),
      signInWithIdToken: vi.fn(),
      updateUser: vi.fn(),
    },
  }
}

function response(overrides: Record<string, unknown> = {}, ok = true) {
  return {
    ok,
    json: async () => ({ user: { id: 'apple-user' }, session: { access_token: 'backend-access', refresh_token: 'backend-refresh' }, name_status: 'saved', ...overrides }),
  } as Response
}

beforeEach(() => {
  vi.clearAllMocks()
  enabled.value = true
  androidReady.value = true
  native.platform = 'ios'
  native.available = true
  native.isNative = true
  plugin.initialize.mockResolvedValue(undefined)
  plugin.login.mockResolvedValue({
    provider: 'apple',
    result: { idToken: 'verified-by-backend', authorizationCode: 'native-revocation-code', profile: { givenName: 'Example', familyName: 'Person' } },
  })
  vi.stubGlobal('fetch', vi.fn(async () => response()))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('native Apple login', () => {
  it('offers Android only in an explicitly enabled native build with the plugin', () => {
    native.platform = 'android'
    vi.stubEnv('VITE_ANDROID_APPLE_LOGIN_ENABLED', 'true')
    expect(isNativeAppleLoginAvailable()).toBe(true)
    androidReady.value = false
    expect(isNativeAppleLoginAvailable()).toBe(false)
    expect(isNativeAppleLoginAvailable(true)).toBe(true)
    androidReady.value = true
    enabled.value = false
    expect(isNativeAppleLoginAvailable()).toBe(false)
    expect(isNativeAppleLoginAvailable(true)).toBe(true)
    native.available = false
    expect(isNativeAppleLoginAvailable(true)).toBe(false)
    native.available = true
    native.isNative = false
    expect(isNativeAppleLoginAvailable(true)).toBe(false)
  })

  it('never offers Apple login on web, unconfigured Android, or an older binary without the plugin', async () => {
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
    expect(fetch).not.toHaveBeenCalled()
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
  })

  it('keeps native iOS authorization but exchanges every credential through the shared backend', async () => {
    const supabase = client()
    expect(isNativeAppleLoginAvailable()).toBe(true)
    await signInWithApple(supabase as unknown as SupabaseClient, 'captcha-token')
    const [url, request] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(request!.body as string)
    const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(body.nonce))
    expect(plugin.initialize).toHaveBeenCalledWith({ apple: { useProperTokenExchange: true } })
    expect(plugin.login).toHaveBeenCalledWith({ provider: 'apple', options: { scopes: ['email', 'name'], nonce: Buffer.from(digest).toString('hex') } })
    expect(url).toBe('https://api.example.test/auth/apple')
    expect(body).toMatchObject({ id_token: 'verified-by-backend', first_name: 'Example', last_name: 'Person', captcha_token: 'captcha-token' })
    expect(body.nonce).toMatch(/^[a-f0-9]{64}$/)
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'backend-access', refresh_token: 'backend-refresh' })
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
    await signInWithApple(supabase as unknown as SupabaseClient)
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).nonce).not.toBe(body.nonce)
  })

  it('leaves profile persistence to the shared backend and preserves the native name cache', async () => {
    const supabase = client()
    plugin.login.mockResolvedValue({ provider: 'apple', result: { idToken: 'token', profile: { givenName: null, familyName: null } } })
    await signInWithApple(supabase as unknown as SupabaseClient)
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body).not.toHaveProperty('first_name')
    expect(body).not.toHaveProperty('last_name')
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('honors the server switch and permits existing iOS users to reauthenticate when rollout is off', async () => {
    enabled.value = false
    const supabase = client()
    expect(isNativeAppleLoginAvailable()).toBe(false)
    await expect(signInWithApple(supabase as unknown as SupabaseClient)).rejects.toThrow()
    expect(plugin.initialize).not.toHaveBeenCalled()
    await signInWithApple(supabase as unknown as SupabaseClient, undefined, { reauthenticate: true })
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).reauthenticate).toBe(true)
    expect(vi.mocked(fetch).mock.calls[0][1]!.headers).toMatchObject({ Authorization: 'Bearer existing-session' })
  })

  it('treats cancelling the Apple sheet as a normal exit', async () => {
    plugin.login.mockRejectedValue({ code: 'USER_CANCELLED' })
    await expect(signInWithApple(client() as unknown as SupabaseClient)).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a missing identity token without attempting authentication', async () => {
    plugin.login.mockResolvedValue({ provider: 'apple', result: { idToken: null, profile: {} } })
    await expect(signInWithApple(client() as unknown as SupabaseClient)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([response({ error: 'invalid_apple_credential' }, false), response({ session: null }), response({ user: null })])('never falls back to direct Supabase Apple exchange on backend failure', async (reply) => {
    vi.mocked(fetch).mockResolvedValue(reply)
    const supabase = client()
    await expect(signInWithApple(supabase as unknown as SupabaseClient)).rejects.toThrow()
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
  })

  it('rejects a different reauthentication identity before installing a session', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ user: { id: 'other-user' } }))
    const supabase = client()
    await expect(signInWithApple(supabase as unknown as SupabaseClient, undefined, { reauthenticate: true })).rejects.toThrow('does not match')
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
  })
})
