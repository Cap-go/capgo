// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startAppleOAuth } from '../src/services/appleOAuth'

const native = vi.hoisted(() => ({ value: false }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.value } }))
vi.mock('~/services/supabase', () => ({ defaultApiHost: 'https://api.example.com' }))
const origin = 'https://localhost:5173'
const assign = vi.fn()
const fetchMock = vi.fn()
let capabilities: { web: { enabled: boolean, api_enabled: boolean, redirect_uris: string[] } }
beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  native.value = false
  vi.stubEnv('DEV', true)
  vi.stubEnv('VITE_DEV_APPLE_LOGIN_ENABLED', 'true')
  vi.stubGlobal('location', { origin, protocol: 'https:', href: `${origin}/login`, assign })
  capabilities = { web: { enabled: false, api_enabled: true, redirect_uris: [`${origin}/login`] } }
  fetchMock.mockImplementation(async (url: string) => url.endsWith('/capabilities') ? Response.json(capabilities) : Response.json({ authorization_url: 'https://appleid.apple.com/auth/authorize' }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
describe('development-only Apple browser login', () => {
  it('uses the real web OAuth start flow with API-on/public-UI-off and an exact local HTTPS redirect', async () => {
    await startAppleOAuth(new URL(`${origin}/login`))
    const request = fetchMock.mock.calls.find(([url]) => url.endsWith('/start'))!
    const body = JSON.parse(request[1].body)
    expect(body.redirect_uri).toBe(`${origin}/login`)
    expect(body.code_challenge).toMatch(/^[\w-]{43}$/)
    const attempt = JSON.parse(sessionStorage.getItem('capgo.apple-oauth.v1')!)
    expect(body.client_state).toBe(attempt.state)
    expect(attempt.verifier).toMatch(/^[\w-]{43}$/)
    expect(assign).toHaveBeenCalledWith('https://appleid.apple.com/auth/authorize')
  })
  it.each(['production', 'mobile', 'not-opted-in', 'http', 'api-off', 'unallowlisted'])('does not bypass public visibility in %s', async (mode) => {
    if (mode === 'production')
      vi.stubEnv('DEV', false)
    if (mode === 'mobile')
      native.value = true
    if (mode === 'not-opted-in')
      vi.stubEnv('VITE_DEV_APPLE_LOGIN_ENABLED', '')
    if (mode === 'http')
      vi.stubGlobal('location', { origin: 'http://localhost:5173', protocol: 'http:', assign })
    if (mode === 'api-off')
      capabilities.web.api_enabled = false
    if (mode === 'unallowlisted')
      capabilities.web.redirect_uris = ['https://console.example.com/login']
    await expect(startAppleOAuth(new URL(`${origin}/login`))).rejects.toThrow('unavailable')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/start'))).toBe(false)
    expect(assign).not.toHaveBeenCalled()
  })
  it('preserves the ordinary browser entry when public visibility is explicitly enabled', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DEV_APPLE_LOGIN_ENABLED', '')
    capabilities.web.enabled = true
    await startAppleOAuth(new URL(`${origin}/login`))
    expect(assign).toHaveBeenCalled()
  })
})
