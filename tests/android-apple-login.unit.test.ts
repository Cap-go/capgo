import type { SupabaseClient } from '@supabase/supabase-js'
import { Buffer } from 'node:buffer'
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAndroidAppleLoginBuildEnabled, signInWithAppleOnAndroid } from '../src/services/androidAppleLogin'
import { ANDROID_APPLE_REDIRECT_URI, loadAndroidAppleAvailability } from '../src/services/appleAuthRedirect'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), open: vi.fn(), nativeLogin: vi.fn() }))
vi.mock('~/services/capgoApi', () => ({ invokeCapgoApi: mocks.invoke }))
vi.mock('@capgo/capacitor-social-login', () => ({ SocialLogin: { openSecureWindow: mocks.open, login: mocks.nativeLogin } }))

function client() {
  const user = { id: 'apple-user', email: 'apple-user@example.com', user_metadata: {} }
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: user.id } }, error: null }),
      setSession: vi.fn().mockResolvedValue({ data: { user, session: { user } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      signInWithIdToken: vi.fn(),
      updateUser: vi.fn(),
    },
  }
}

function redirect(fragment: Record<string, string> = {}) {
  const start = mocks.invoke.mock.calls.findLast(([path]) => path === 'auth/apple/start')!
  return `${ANDROID_APPLE_REDIRECT_URI}#${new URLSearchParams({ apple_code: 'opaque-one-use-code', state: start[1].body.client_state, ...fragment })}`
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.invoke.mockImplementation(async (path: string) => ({
    error: null,
    data: path.endsWith('/start')
      ? { authorization_url: 'https://appleid.apple.com/auth/authorize?client_id=test-services-id', expires_in: 600 }
      : { user: { id: 'apple-user' }, session: { access_token: 'access-token', refresh_token: 'refresh-token' }, name_status: 'saved', authorization_code: 'apple-revocation-code' },
  }))
  mocks.open.mockImplementation(async () => ({ redirectedUri: redirect() }))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('android Apple OAuth transport', () => {
  it.each([
    [{ web: { enabled: true, redirect_uris: [ANDROID_APPLE_REDIRECT_URI] } }, true],
    [{ web: { enabled: false, redirect_uris: [ANDROID_APPLE_REDIRECT_URI] } }, false],
    [{ web: { enabled: 'true', redirect_uris: [ANDROID_APPLE_REDIRECT_URI] } }, false],
    [{ web: { enabled: true, redirect_uris: [`${ANDROID_APPLE_REDIRECT_URI}/`] } }, false],
    [{ web: { enabled: true, redirect_uris: ['https://console.capgo.app/login'] } }, false],
    [{}, false],
  ])('requires live server capability and the exact Android redirect (%#)', async (payload, expected) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => payload })))
    await expect(loadAndroidAppleAvailability('https://api.example.test')).resolves.toBe(expected)
    expect(fetch).toHaveBeenCalledWith('https://api.example.test/auth/apple/capabilities', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }))
  })

  it.each(['http', 'network', 'json'])('fails closed when capabilities cannot be loaded (%s)', async (failure) => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (failure === 'network')
        throw new Error('Offline')
      return {
        ok: failure !== 'http',
        json: async () => {
          throw new Error('Invalid JSON')
        },
      }
    }))
    await expect(loadAndroidAppleAvailability('https://api.example.test')).resolves.toBe(false)
  })
  it('requires an explicit build opt-in', () => {
    vi.stubEnv('VITE_ANDROID_APPLE_LOGIN_ENABLED', undefined)
    expect(isAndroidAppleLoginBuildEnabled()).toBe(false)
    vi.stubEnv('VITE_ANDROID_APPLE_LOGIN_ENABLED', 'false')
    expect(isAndroidAppleLoginBuildEnabled()).toBe(false)
    vi.stubEnv('VITE_ANDROID_APPLE_LOGIN_ENABLED', 'true')
    expect(isAndroidAppleLoginBuildEnabled()).toBe(true)
  })

  it('uses a system browser and backend code exchange, with a fresh verifier and state per attempt', async () => {
    const supabase = client()
    const result = await signInWithAppleOnAndroid(supabase as unknown as SupabaseClient, 'captcha-token')
    const start = mocks.invoke.mock.calls[0][1]
    const exchange = mocks.invoke.mock.calls[1][1]
    expect(start.body).toMatchObject({ redirect_uri: ANDROID_APPLE_REDIRECT_URI, reauthenticate: false })
    expect(start.body.client_state).toMatch(/^[\w-]{43}$/)
    expect(exchange.body.code_verifier).toMatch(/^[\w-]{43}$/)
    const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(exchange.body.code_verifier))
    expect(start.body.code_challenge).toBe(Buffer.from(digest).toString('base64url'))
    expect(JSON.stringify(start)).not.toContain(exchange.body.code_verifier)
    expect(mocks.open).toHaveBeenCalledWith({ authEndpoint: expect.stringMatching(/^https:\/\/appleid.apple.com\/auth\/authorize\?/), redirectUri: ANDROID_APPLE_REDIRECT_URI })
    expect(exchange.body).toMatchObject({ code: 'opaque-one-use-code', captcha_token: 'captcha-token' })
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'access-token', refresh_token: 'refresh-token' })
    expect(result).toMatchObject({ user: { id: 'apple-user' }, authorizationClient: 'web', authorizationCode: 'apple-revocation-code', profileSaveFailed: false })
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
    expect(mocks.nativeLogin).not.toHaveBeenCalled()
    await signInWithAppleOnAndroid(supabase as unknown as SupabaseClient)
    expect(mocks.invoke.mock.calls[2][1].body.client_state).not.toBe(start.body.client_state)
    expect(mocks.invoke.mock.calls[2][1].body.code_challenge).not.toBe(start.body.code_challenge)
  })

  it.each([
    (url: string) => url.replace('apple-auth/callback', 'apple-auth/callback/extra'),
    (url: string) => url.replace('apple-auth', 'evil.example'),
    (url: string) => url.replace('#', '?access_token=untrusted#'),
    (url: string) => `${url}&state=duplicate`,
    (url: string) => `${url}&apple_code=duplicate`,
    (url: string) => url.replace(/state=[^&]+/, 'state=other-attempt'),
    (_url: string) => `${ANDROID_APPLE_REDIRECT_URI}#apple_code=missing-state`,
  ])('rejects a mismatched or malformed callback without installing a session (%#)', async (tamper) => {
    const supabase = client()
    mocks.open.mockImplementation(async () => ({ redirectedUri: tamper(redirect()) }))
    await expect(signInWithAppleOnAndroid(supabase as unknown as SupabaseClient)).rejects.toThrow()
    expect(mocks.invoke).toHaveBeenCalledOnce()
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
  })

  it.each([{ code: 'USER_CANCELLED' }, new Error('OAuth cancelled or no callback received')])('treats browser cancellation as a normal exit', async (error) => {
    mocks.open.mockRejectedValueOnce(error)
    const supabase = client()
    await expect(signInWithAppleOnAndroid(supabase as unknown as SupabaseClient)).resolves.toBeNull()
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
    await expect(signInWithAppleOnAndroid(supabase as unknown as SupabaseClient)).resolves.toMatchObject({ user: { id: 'apple-user' } })
  })

  it('handles the backend cancellation callback only with the matching state', async () => {
    mocks.open.mockImplementation(async () => ({ redirectedUri: `${ANDROID_APPLE_REDIRECT_URI}#${new URLSearchParams({ apple_error: 'apple_authorization_failed', state: mocks.invoke.mock.calls[0][1].body.client_state })}` }))
    const supabase = client()
    await expect(signInWithAppleOnAndroid(supabase as unknown as SupabaseClient)).resolves.toBeNull()
    expect(mocks.invoke).toHaveBeenCalledOnce()
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
  })

  it.each(['http://appleid.apple.com/auth/authorize', 'https://appleid.apple.com.evil.example/auth/authorize', 'https://example.com/', 'https://appleid.apple.com/auth/token'])('rejects an unsafe authorization URL: %s', async (url) => {
    mocks.invoke.mockResolvedValueOnce({ data: { authorization_url: url }, error: null })
    await expect(signInWithAppleOnAndroid(client() as unknown as SupabaseClient)).rejects.toThrow()
    expect(mocks.open).not.toHaveBeenCalled()
  })

  it('requires an existing session and same-account backend reauthentication for deletion', async () => {
    const supabase = client()
    await signInWithAppleOnAndroid(supabase as unknown as SupabaseClient, undefined, true)
    expect(supabase.auth.getClaims).toHaveBeenCalledOnce()
    expect(mocks.invoke).toHaveBeenCalledWith('auth/apple/start', expect.objectContaining({ client: supabase, allowAnonymous: false, body: expect.objectContaining({ reauthenticate: true }) }))
    expect(mocks.invoke).toHaveBeenCalledWith('auth/apple/exchange', expect.objectContaining({ allowAnonymous: false }))
    supabase.auth.getClaims.mockResolvedValue({ data: { claims: { sub: '' } }, error: null })
    await expect(signInWithAppleOnAndroid(supabase as unknown as SupabaseClient, undefined, true)).rejects.toThrow()
    expect(mocks.invoke).toHaveBeenCalledTimes(2)
  })

  it('rejects a different reauthentication user before changing the current session', async () => {
    const supabase = client()
    supabase.auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'current-user' } }, error: null })
    await expect(signInWithAppleOnAndroid(supabase as unknown as SupabaseClient, undefined, true)).rejects.toThrow('does not match')
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
  })

  it.each(['start', 'exchange'])('propagates rejected %s without a direct Supabase fallback', async (stage) => {
    const normal = mocks.invoke.getMockImplementation()!
    mocks.invoke.mockImplementation((path: string) => path.endsWith(`/${stage}`) ? { data: null, error: new Error('Unavailable') } : normal(path))
    const supabase = client()
    await expect(signInWithAppleOnAndroid(supabase as unknown as SupabaseClient)).rejects.toThrow()
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
  })

  it('clears an installed session if its authenticated user disagrees with the backend response', async () => {
    const supabase = client()
    supabase.auth.setSession.mockResolvedValue({ data: { user: { id: 'other-user' }, session: {} }, error: null } as any)
    await expect(signInWithAppleOnAndroid(supabase as unknown as SupabaseClient)).rejects.toThrow()
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('does not open two simultaneous browser authorizations', async () => {
    let finish!: (value: { redirectedUri: string }) => void
    mocks.open.mockImplementationOnce(() => new Promise(resolve => finish = resolve))
    const supabase = client()
    const first = signInWithAppleOnAndroid(supabase as unknown as SupabaseClient)
    await vi.waitFor(() => expect(mocks.open).toHaveBeenCalledOnce())
    await expect(signInWithAppleOnAndroid(supabase as unknown as SupabaseClient)).rejects.toThrow('already in progress')
    finish({ redirectedUri: redirect() })
    await first
  })
})
