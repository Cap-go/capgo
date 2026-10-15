import type { SupabaseClient } from '@supabase/supabase-js'
import { Buffer } from 'node:buffer'
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAndroidGoogleLoginAvailable, prepareAndroidGoogleLogin, signInWithGoogle } from '../src/services/androidGoogleLogin'

const mocks = vi.hoisted(() => ({
  platform: 'android',
  native: true,
  plugins: { SocialLogin: true, Env: true } as Record<string, boolean>,
  env: vi.fn(),
  initialize: vi.fn(),
  login: vi.fn(),
  invoke: vi.fn(),
}))
const webClientId = '123456-google-native-test.apps.googleusercontent.com'
vi.mock('@capacitor/core', () => ({ Capacitor: {
  isNativePlatform: () => mocks.native,
  getPlatform: () => mocks.platform,
  isPluginAvailable: (name: string) => mocks.plugins[name] === true,
} }))
vi.mock('@capgo/capacitor-env', () => ({ Env: { getKey: mocks.env } }))
vi.mock('@capgo/capacitor-social-login', () => ({ SocialLogin: { initialize: mocks.initialize, login: mocks.login } }))
vi.mock('~/services/capgoApi', () => ({ invokeCapgoApi: mocks.invoke }))
vi.mock('~/services/signupAttribution', () => ({ resolveSignupAttribution: () => ({ signup_source: 'native-test' }) }))

function client() {
  const user = { id: 'google-user', email: 'google-user@example.com', user_metadata: {} }
  return { auth: {
    getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: user.id } }, error: null }),
    setSession: vi.fn().mockResolvedValue({ data: { user, session: { user } }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    signInWithIdToken: vi.fn(),
    updateUser: vi.fn(),
  } }
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_ANDROID_GOOGLE_LOGIN_ENABLED', 'true')
  mocks.platform = 'android'
  mocks.native = true
  mocks.plugins = { SocialLogin: true, Env: true }
  mocks.env.mockImplementation(async ({ key }: { key: string }) => ({ value: key === 'CAPGO_NATIVE_GOOGLE_LOGIN' ? 'true' : webClientId }))
  mocks.initialize.mockResolvedValue(undefined)
  mocks.login.mockResolvedValue({ provider: 'google', result: { responseType: 'online', idToken: 'signed-google-token', accessToken: { token: 'provider-access' }, profile: { givenName: 'Untrusted' } } })
  mocks.invoke.mockResolvedValue({ data: { user: { id: 'google-user' }, session: { access_token: 'backend-access', refresh_token: 'backend-refresh' }, is_new_user: false, name_status: 'saved', account_status: 'active' }, error: null })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ native: { enabled: true, web_client_id: webClientId } }) })))
  await prepareAndroidGoogleLogin('https://api.example.test')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('android Google native authentication', () => {
  it.each(['web', 'ios'])('keeps the Android Google button off %s', async (platform) => {
    mocks.platform = platform
    await prepareAndroidGoogleLogin('https://api.example.test')
    expect(isAndroidGoogleLoginAvailable()).toBe(false)
    await expect(signInWithGoogle(client() as unknown as SupabaseClient)).rejects.toThrow()
    expect(mocks.initialize).not.toHaveBeenCalled()
  })

  it.each(['Env', 'SocialLogin'])('rejects an older binary without %s support', async (name) => {
    mocks.plugins[name] = false
    await prepareAndroidGoogleLogin('https://api.example.test')
    expect(isAndroidGoogleLoginAvailable(true)).toBe(false)
    await expect(signInWithGoogle(client() as unknown as SupabaseClient)).rejects.toThrow()
    expect(mocks.initialize).not.toHaveBeenCalled()
  })

  it('never initializes Google on a provider-disabled binary receiving newer JavaScript', async () => {
    mocks.env.mockResolvedValue({ value: '' })
    await prepareAndroidGoogleLogin('https://api.example.test')
    expect(isAndroidGoogleLoginAvailable()).toBe(false)
    expect(isAndroidGoogleLoginAvailable(true)).toBe(false)
    await expect(signInWithGoogle(client() as unknown as SupabaseClient)).rejects.toThrow()
    expect(mocks.initialize).not.toHaveBeenCalled()
  })

  it.each([
    { native: { enabled: false, web_client_id: webClientId } },
    { native: { enabled: true, web_client_id: 'another-client.apps.googleusercontent.com' } },
    { native: { enabled: 'true', web_client_id: webClientId } },
    {},
  ])('requires configured live capability matching this binary for normal login (%#)', async (payload) => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => payload } as Response)
    await prepareAndroidGoogleLogin('https://api.example.test')
    expect(isAndroidGoogleLoginAvailable()).toBe(false)
    expect(isAndroidGoogleLoginAvailable(true)).toBe(true)
  })

  it('keeps deletion reauthentication when the build signup opt-in is off', async () => {
    vi.stubEnv('VITE_ANDROID_GOOGLE_LOGIN_ENABLED', 'false')
    await prepareAndroidGoogleLogin('https://api.example.test')
    expect(isAndroidGoogleLoginAvailable()).toBe(false)
    expect(isAndroidGoogleLoginAvailable(true)).toBe(true)
  })

  it('fails capability lookup closed while retaining the configured reauthentication client', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Offline'))
    await prepareAndroidGoogleLogin('https://api.example.test')
    expect(isAndroidGoogleLoginAvailable()).toBe(false)
    expect(isAndroidGoogleLoginAvailable(true)).toBe(true)
  })

  it('uses a fresh nonce and only the shared backend for credential exchange and profile provisioning', async () => {
    const supabase = client()
    const result = await signInWithGoogle(supabase as unknown as SupabaseClient, 'captcha-token')
    const request = mocks.invoke.mock.calls[0][1]
    const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(request.body.nonce))
    expect(mocks.initialize).toHaveBeenCalledWith({ google: { webClientId, mode: 'online' } })
    expect(mocks.login).toHaveBeenCalledWith({ provider: 'google', options: { nonce: Buffer.from(digest).toString('hex'), style: 'standard', filterByAuthorizedAccounts: false, autoSelectEnabled: false } })
    expect(mocks.invoke).toHaveBeenCalledWith('auth/google', expect.objectContaining({ client: supabase, allowAnonymous: true, body: expect.objectContaining({ id_token: 'signed-google-token', access_token: 'provider-access', captcha_token: 'captcha-token', registration_metadata: { registration_device_type: 'mobile', registration_os: 'android', registration_browser: 'native', signup_source: 'native-test' } }) }))
    expect(request.body.nonce).toMatch(/^[a-f0-9]{64}$/)
    expect(request.body).not.toHaveProperty('first_name')
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'backend-access', refresh_token: 'backend-refresh' })
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
    expect(result).toMatchObject({ user: { id: 'google-user' }, isNewUser: false, accountStatus: 'active' })
    await signInWithGoogle(supabase as unknown as SupabaseClient)
    expect(mocks.invoke.mock.calls[1][1].body.nonce).not.toBe(request.body.nonce)
  })

  it('accepts an authentication-only Google response without an access token', async () => {
    mocks.login.mockResolvedValue({ provider: 'google', result: { responseType: 'online', idToken: 'signed-google-token', accessToken: null } })
    await expect(signInWithGoogle(client() as unknown as SupabaseClient)).resolves.toMatchObject({ user: { id: 'google-user' } })
    expect(mocks.invoke.mock.calls[0][1].body.access_token).toBeUndefined()
  })

  it('takes new-user analytics status only from the backend response', async () => {
    mocks.invoke.mockResolvedValue({ data: { user: { id: 'google-user' }, session: { access_token: 'backend-access', refresh_token: 'backend-refresh' }, is_new_user: true, name_status: 'saved', account_status: 'active' }, error: null })
    await expect(signInWithGoogle(client() as unknown as SupabaseClient)).resolves.toMatchObject({ isNewUser: true })
  })

  it('treats cancellation as a normal exit without a backend fallback', async () => {
    mocks.login.mockRejectedValue({ code: 'USER_CANCELLED' })
    const supabase = client()
    await expect(signInWithGoogle(supabase as unknown as SupabaseClient)).resolves.toBeNull()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
  })

  it.each([{ responseType: 'offline', serverAuthCode: 'code' }, { responseType: 'online', idToken: null }])('rejects missing online credentials without calling the backend (%#)', async (result) => {
    mocks.login.mockResolvedValue({ provider: 'google', result })
    await expect(signInWithGoogle(client() as unknown as SupabaseClient)).rejects.toThrow()
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('binds deletion reauthentication to the existing account before installing a session', async () => {
    const supabase = client()
    await signInWithGoogle(supabase as unknown as SupabaseClient, undefined, { reauthenticate: true })
    expect(mocks.invoke.mock.calls[0][1]).toMatchObject({ allowAnonymous: false, body: { reauthenticate: true } })
    expect(mocks.invoke.mock.calls[0][1].body.registration_metadata).toBeUndefined()
    supabase.auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'different-user' } }, error: null })
    supabase.auth.setSession.mockClear()
    await expect(signInWithGoogle(supabase as unknown as SupabaseClient, undefined, { reauthenticate: true })).rejects.toThrow('does not match')
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
  })

  it('never exchanges credentials without an existing reauthentication session', async () => {
    const supabase = client()
    supabase.auth.getClaims.mockResolvedValue({ data: { claims: { sub: '' } }, error: null })
    await expect(signInWithGoogle(supabase as unknown as SupabaseClient, undefined, { reauthenticate: true })).rejects.toThrow()
    expect(mocks.initialize).not.toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('propagates backend rejection without direct Supabase Google authentication', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('Rejected') })
    const supabase = client()
    await expect(signInWithGoogle(supabase as unknown as SupabaseClient)).rejects.toThrow()
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
  })

  it('clears an inconsistent installed session', async () => {
    const supabase = client()
    supabase.auth.setSession.mockResolvedValue({ data: { user: { id: 'other-user' }, session: {} }, error: null } as any)
    await expect(signInWithGoogle(supabase as unknown as SupabaseClient)).rejects.toThrow()
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('rejects a malformed backend response before installing a session', async () => {
    const supabase = client()
    mocks.invoke.mockResolvedValue({ data: { user: { id: 'google-user' }, session: { access_token: 'access', refresh_token: 'refresh' } }, error: null })
    await expect(signInWithGoogle(supabase as unknown as SupabaseClient)).rejects.toThrow('did not return a session')
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
  })

  it('permits only one active authorization and releases the lock after cancellation', async () => {
    const supabase = client()
    let cancel: (reason: unknown) => void = () => {}
    mocks.login.mockImplementationOnce(() => new Promise((_, reject) => {
      cancel = reject
    }))
    const first = signInWithGoogle(supabase as unknown as SupabaseClient)
    await vi.waitFor(() => expect(mocks.login).toHaveBeenCalledOnce())
    await expect(signInWithGoogle(supabase as unknown as SupabaseClient)).rejects.toThrow('already in progress')
    cancel({ code: 'USER_CANCELLED' })
    await expect(first).resolves.toBeNull()
    await expect(signInWithGoogle(supabase as unknown as SupabaseClient)).resolves.toMatchObject({ user: { id: 'google-user' } })
  })
})
