import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'
import { isNativeGoogleLoginAvailable, loadNativeGoogleConfiguration, signInWithGoogle } from '../src/services/nativeGoogleLogin'

const mocks = vi.hoisted(() => ({ platform: 'ios', native: true, plugin: true, version: '99.0.0', enabled: true, initialize: vi.fn(), login: vi.fn(), fetch: vi.fn(), exchange: vi.fn() }))
vi.mock('~/services/supabase', () => ({ defaultApiHost: 'https://api.example.com' }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => mocks.native, getPlatform: () => mocks.platform, isPluginAvailable: () => mocks.plugin } }))
vi.mock('@capacitor/app', () => ({ App: { getInfo: async () => ({ version: mocks.version }) } }))
vi.mock('@capgo/capacitor-social-login', () => ({ SocialLogin: { initialize: mocks.initialize, login: mocks.login } }))
const user = { id: 'google-user', email: 'google-user@example.com' }
const session = { access_token: 'session-access', refresh_token: 'session-refresh' }
function client() {
  return { auth: {
    signInWithIdToken: vi.fn(() => { throw new Error('Direct Google exchange forbidden') }),
    getSession: vi.fn(async () => ({ data: { session: { user, access_token: 'existing-access' } } })),
    setSession: vi.fn(async () => ({ data: { user, session }, error: null })),
  } }
}
beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(mocks, { platform: 'ios', native: true, plugin: true, version: '99.0.0', enabled: true })
  mocks.login.mockResolvedValue({ result: { responseType: 'online', idToken: 'google-id-token', accessToken: { token: 'provider-access' } } })
  mocks.exchange.mockImplementation(async () => Response.json({ user, session, name_status: 'saved', is_new_user: false }))
  mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.endsWith('/capabilities'))
      return Response.json({ native: { enabled: mocks.enabled, ios_client_id: 'ios-example.apps.googleusercontent.com', web_client_id: 'web-example.apps.googleusercontent.com', ios_min_version: '99.0.0' } })
    return mocks.exchange(url, init)
  })
  vi.stubGlobal('fetch', mocks.fetch)
})
afterEach(() => vi.unstubAllGlobals())
describe('native Google backend exchange', () => {
  it('updates the login visibility computed when asynchronous capabilities arrive', async () => {
    mocks.plugin = false
    await loadNativeGoogleConfiguration()
    mocks.plugin = true
    const available = computed(() => isNativeGoogleLoginAvailable())
    expect(available.value).toBe(false)
    await loadNativeGoogleConfiguration()
    expect(available.value).toBe(true)
  })
  it('forces interactive online login with a fresh hashed nonce and exchanges only on the backend', async () => {
    const supabase = client()
    await signInWithGoogle(supabase as unknown as SupabaseClient, 'captcha')
    const body = JSON.parse(mocks.exchange.mock.calls[0][1].body)
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.nonce)))
    const hash = [...digest].map(b => b.toString(16).padStart(2, '0')).join('')
    expect(mocks.initialize).toHaveBeenCalledWith({ google: { mode: 'online', iOSClientId: 'ios-example.apps.googleusercontent.com', iOSServerClientId: 'web-example.apps.googleusercontent.com' } })
    expect(mocks.login).toHaveBeenCalledWith({ provider: 'google', options: { scopes: ['openid', 'email', 'profile'], nonce: hash, forcePrompt: true } })
    expect(body).toMatchObject({ id_token: 'google-id-token', access_token: 'provider-access', captcha_token: 'captcha' })
    expect(body).not.toHaveProperty('first_name')
    expect(supabase.auth.setSession).toHaveBeenCalledWith(session)
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
    await signInWithGoogle(supabase as unknown as SupabaseClient)
    expect(JSON.parse(mocks.exchange.mock.calls[1][1].body).nonce).not.toBe(body.nonce)
  })
  it.each(['old', 'android', 'web', 'missing_plugin'])('fails closed on an unsupported native binary: %s', async (mode) => {
    if (mode === 'old')
      mocks.version = '1.0.0'
    if (mode === 'android' || mode === 'web')
      mocks.platform = mode
    if (mode === 'missing_plugin')
      mocks.plugin = false
    expect(await loadNativeGoogleConfiguration()).toBe(false)
    expect(isNativeGoogleLoginAvailable()).toBe(false)
    await expect(signInWithGoogle(client() as unknown as SupabaseClient)).rejects.toThrow()
    expect(mocks.login).not.toHaveBeenCalled()
  })
  it('reauthenticates with the current Bearer session when the signup switch is off', async () => {
    mocks.enabled = false
    const supabase = client()
    await signInWithGoogle(supabase as unknown as SupabaseClient, undefined, { reauthenticate: true })
    expect(mocks.exchange.mock.calls[0][1].headers.Authorization).toBe('Bearer existing-access')
    expect(JSON.parse(mocks.exchange.mock.calls[0][1].body).reauthenticate).toBe(true)
  })
  it('does not install a different account during reauthentication', async () => {
    mocks.exchange.mockImplementation(async () => Response.json({ user: { ...user, id: 'other-user' }, session }))
    const supabase = client()
    await expect(signInWithGoogle(supabase as unknown as SupabaseClient, undefined, { reauthenticate: true })).rejects.toThrow('does not match')
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
  })
  it('handles cancellation without creating a session', async () => {
    mocks.login.mockRejectedValue({ code: 'USER_CANCELLED' })
    await expect(signInWithGoogle(client() as unknown as SupabaseClient)).resolves.toBeNull()
    expect(mocks.exchange).not.toHaveBeenCalled()
  })
  it('rejects backend failure without a direct Supabase fallback', async () => {
    mocks.exchange.mockImplementation(async () => Response.json({ error: 'sso_required' }, { status: 403 }))
    const supabase = client()
    await expect(signInWithGoogle(supabase as unknown as SupabaseClient)).rejects.toThrow('sso_required')
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
  })
})
