import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ pg: vi.fn(), rpc: vi.fn(), exchange: vi.fn(), signOut: vi.fn(), updateUser: vi.fn(), getUser: vi.fn(), from: vi.fn() }))
vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({ getPgClient: async () => ({ query: mocks.pg }), closeClient: vi.fn() }))
vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  emptySupabaseWithClientIP: () => ({ auth: { signInWithIdToken: mocks.exchange, signOut: mocks.signOut, updateUser: mocks.updateUser, getUser: mocks.getUser }, rpc: mocks.rpc }),
  supabaseAdmin: () => ({ rpc: mocks.rpc, from: mocks.from }),
}))
const { app } = await import('../supabase/functions/_backend/auth/google.ts')
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'google-signin@example.com', identities: [{ provider: 'google', identity_data: { sub: 'verified-subject' } }], user_metadata: {}, factors: [{ status: 'verified' }] }
let key: CryptoKey
let jwks: unknown
const uses = new Set<string>()
const attempts = new Map<string, any>()
let profile: any
let profileFailure = false
let newInserts = 0
beforeAll(async () => {
  const keys = await generateKeyPair('RS256', { extractable: true })
  key = keys.privateKey
  jwks = { keys: [{ ...await exportJWK(keys.publicKey), kid: 'test-key', alg: 'RS256' }] }
})
async function token(nonce = 'n'.repeat(64), claims: Record<string, unknown> = {}) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)))
  const hash = [...digest].map(b => b.toString(16).padStart(2, '0')).join('')
  return new SignJWT({ email: user.email, email_verified: true, nonce: hash, given_name: 'Signed', family_name: 'Name', azp: 'ios-example.apps.googleusercontent.com', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject('verified-subject')
    .setIssuer('https://accounts.google.com')
    .setAudience('web-example.apps.googleusercontent.com')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key)
}
function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
}
function query(sql: string, p: any[]) {
  if (sql.includes('INSERT INTO public.google_auth_token_uses')) {
    if (uses.has(p[0]))
      return []
    uses.add(p[0])
    return [{ token_hash: p[0] }]
  }
  if (sql.startsWith('DELETE FROM public.google_auth_token_uses') || sql.startsWith('DELETE FROM public.google_auth_attempts WHERE state_hash IN'))
    return []
  if (sql.startsWith('INSERT INTO public.google_auth_attempts')) {
    attempts.set(p[0], { state_hash: p[0], nonce: p[1], redirect_uri: p[2], code_challenge: p[3], client_state: p[4], expected_user_id: p[5], registration_metadata: JSON.parse(p[6]), expected_subject: p[7], provider_verifier: p[8], callback_claimed: false })
    return []
  }
  if (sql.startsWith('UPDATE public.google_auth_attempts SET callback_claimed')) {
    const row = attempts.get(p[0])
    if (!row || row.callback_claimed || row.expired)
      return []
    row.callback_claimed = true
    return [{ ...row }]
  }
  if (sql.startsWith('UPDATE public.google_auth_attempts SET exchange_hash')) {
    const row = attempts.get(p[0])
    if (!row || row.expired)
      return []
    Object.assign(row, { exchange_hash: p[1], credential: p[2] })
    return [{ state_hash: p[0] }]
  }
  if (sql.startsWith('DELETE FROM public.google_auth_attempts')) {
    const row = [...attempts.values()].find(row => row.exchange_hash === p[0] && row.code_challenge === p[1] && !row.expired)
    if (!row)
      return []
    attempts.delete(row.state_hash)
    return [{ ...row }]
  }
  throw new Error('Unexpected SQL')
}
beforeEach(() => {
  vi.clearAllMocks()
  uses.clear()
  attempts.clear()
  profile = null
  profileFailure = false
  newInserts = 0
  for (const [name, value] of Object.entries({ NATIVE_GOOGLE_LOGIN_ENABLED: 'true', WEB_GOOGLE_LOGIN_ENABLED: 'true', GOOGLE_SIGN_IN_WEB_CLIENT_ID: 'web-example.apps.googleusercontent.com', GOOGLE_SIGN_IN_IOS_CLIENT_ID: 'ios-example.apps.googleusercontent.com', NATIVE_GOOGLE_IOS_MIN_VERSION: '99.0.0', GOOGLE_SIGN_IN_WEB_CLIENT_SECRET: 'example-server-secret', GOOGLE_SIGN_IN_OAUTH_CALLBACK_URL: 'https://api.example.com/auth/google/callback', GOOGLE_SIGN_IN_REDIRECT_URLS: '["https://console.example.com/login","capgo://google-callback"]', CAPTCHA_SECRET_KEY: 'secret', SUPABASE_URL: 'https://auth.example.com' }))
    vi.stubEnv(name, value)
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
    if (String(url).endsWith('/v3/certs'))
      return Response.json(jwks)
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      const form = init?.body as URLSearchParams
      const attempt = [...attempts.values()].find(row => row.provider_verifier === form.get('code_verifier'))
      expect(form.get('redirect_uri')).toBe('https://api.example.com/auth/google/callback')
      expect(form.get('client_secret')).toBe('example-server-secret')
      return Response.json({ id_token: await token(attempt.nonce, { azp: 'web-example.apps.googleusercontent.com' }), access_token: 'google-provider-access' })
    }
    return Response.json({ external: { google: true } })
  }))
  mocks.pg.mockImplementation(async (sql, params) => ({ rows: query(sql, params) }))
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'get_sso_enforcement_by_domain' ? [{ enforce_sso: false }] : name === 'is_not_deleted', error: null }))
  mocks.exchange.mockResolvedValue({ data: { user, session: { access_token: 'supabase-access', refresh_token: 'supabase-refresh' } }, error: null })
  mocks.getUser.mockResolvedValue({ data: { user }, error: null })
  mocks.updateUser.mockResolvedValue({ data: { user }, error: null })
  mocks.signOut.mockResolvedValue({ error: null })
  mocks.from.mockImplementation(() => ({
    upsert: (value: any, options: any) => ({ select: async () => {
      expect(options.ignoreDuplicates).toBe(true)
      if (profileFailure)
        return { error: { message: 'Profile unavailable' } }
      const inserted = !profile
      if (inserted) {
        profile = value
        newInserts++
      }
      return { data: inserted ? [{ id: value.id }] : [], error: null }
    } }),
    select: () => ({ eq: () => ({ single: async () => ({ data: profile, error: null }), maybeSingle: async () => ({ data: profile ? { id: user.id } : null, error: null }) }) }),
    update: (value: any) => ({ eq: () => ({ or: async () => {
      for (const [field, name] of Object.entries(value)) {
        if (!profile[field])
          profile[field] = name
      }
      return { error: null }
    } }) }),
  }))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('shared Google endpoint', () => {
  async function native(fields: Record<string, unknown> = {}, nonce = 'n'.repeat(64)) {
    return request('/', { id_token: await token(nonce), nonce, captcha_token: 'captcha', ...fields })
  }
  it('uses signed names and the real shared profile pipeline without inferring consent', async () => {
    const response = await native({ first_name: 'Forged' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ is_new_user: true, name_status: 'saved', account_status: 'active', user: { factors: [{ status: 'verified' }] } })
    expect(profile).toMatchObject({ first_name: 'Signed', last_name: 'Name', opt_for_newsletters: false, enable_notifications: true })
    expect(mocks.exchange).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google', nonce: 'n'.repeat(64), options: { captchaToken: 'captcha' } }))
  })
  it('preserves chosen names/consent and reports returning users without new inserts', async () => {
    await native()
    profile.first_name = 'Chosen'
    profile.opt_for_newsletters = true
    const response = await native({}, 'r'.repeat(64))
    expect(await response.json()).toMatchObject({ is_new_user: false })
    expect(profile).toMatchObject({ first_name: 'Chosen', opt_for_newsletters: true })
    expect(newInserts).toBe(1)
  })
  it('rejects a replay before another Supabase exchange', async () => {
    const idToken = await token()
    const body = { id_token: idToken, nonce: 'n'.repeat(64), captcha_token: 'captcha' }
    expect((await request('/', body)).status).toBe(200)
    expect((await request('/', body)).status).toBe(400)
    expect(mocks.exchange).toHaveBeenCalledOnce()
  })
  it.each(['deleted', 'sso'])('rejects %s accounts without issuing credentials', async (mode) => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'get_sso_enforcement_by_domain' ? [{ enforce_sso: mode === 'sso' }] : name === 'is_not_deleted' && mode !== 'deleted', error: null }))
    expect((await native()).status).toBe(403)
    expect(mocks.exchange).not.toHaveBeenCalled()
  })
  it('keeps disabled accounts restorable without profile writes', async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'get_sso_enforcement_by_domain' ? [] : true, error: null }))
    const response = await native()
    expect(await response.json()).toMatchObject({ account_status: 'disabled', is_new_user: false })
    expect(newInserts).toBe(0)
  })
  it('requires CAPTCHA and preserves provider rate errors', async () => {
    expect((await native({ captcha_token: undefined })).status).toBe(422)
    mocks.exchange.mockResolvedValue({ error: { status: 429 } })
    expect((await native()).status).toBe(429)
  })
  it('reauthenticates the same identity with signup disabled and rejects foreign user sessions', async () => {
    vi.stubEnv('NATIVE_GOOGLE_LOGIN_ENABLED', 'false')
    expect((await native()).status).toBe(503)
    const body = { id_token: await token(), nonce: 'n'.repeat(64), captcha_token: 'captcha', reauthenticate: true }
    expect((await request('/', body)).status).toBe(401)
    expect((await request('/', body, { Authorization: 'Bearer existing-session' })).status).toBe(200)
    mocks.exchange.mockResolvedValue({ data: { user: { ...user, id: 'foreign-user' }, session: { access_token: 'foreign', refresh_token: 'foreign' } } })
    const response = await request('/', { ...body, id_token: await token('f'.repeat(64)), nonce: 'f'.repeat(64) }, { Authorization: 'Bearer existing-session' })
    expect(response.status).toBe(403)
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
  it('rejects a mismatched exchanged Google subject without keeping its session', async () => {
    mocks.exchange.mockResolvedValue({ data: { user: { ...user, identities: [{ provider: 'google', identity_data: { sub: 'foreign-subject' } }] }, session: { access_token: 'access', refresh_token: 'refresh' } } })
    expect((await native()).status).toBe(400)
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(newInserts).toBe(0)
  })
  it('applies deleted-account checks to a linked primary email as well', async () => {
    mocks.exchange.mockResolvedValue({ data: { user: { ...user, email: 'linked@example.com' }, session: { access_token: 'access', refresh_token: 'refresh' } } })
    const blockedHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('linked@example.com')))].map(b => b.toString(16).padStart(2, '0')).join('')
    mocks.rpc.mockImplementation(async (name: string, args: any) => ({ data: name === 'get_sso_enforcement_by_domain' ? [] : name === 'is_not_deleted' && args.email_check !== blockedHash, error: null }))
    expect((await native()).status).toBe(403)
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(newInserts).toBe(0)
  })
  it('rejects malformed credentials before invoking Supabase', async () => {
    expect((await request('/', { id_token: 'invalid', nonce: 'short' })).status).toBe(400)
    expect(mocks.exchange).not.toHaveBeenCalled()
  })
  it('advertises only configured provider capabilities and retains reauthentication IDs with signup off', async () => {
    let response = await app.request('/capabilities')
    expect(await response.json()).toMatchObject({ native: { enabled: true, ios_min_version: '99.0.0' }, web: { enabled: true } })
    vi.stubEnv('NATIVE_GOOGLE_LOGIN_ENABLED', 'false')
    vi.stubEnv('WEB_GOOGLE_LOGIN_ENABLED', 'false')
    response = await app.request('/capabilities')
    expect(await response.json()).toMatchObject({ native: { enabled: false, ios_client_id: 'ios-example.apps.googleusercontent.com' }, web: { enabled: false } })
    vi.stubEnv('GOOGLE_SIGN_IN_WEB_CLIENT_ID', 'malformed')
    expect(await (await app.request('/capabilities')).json()).toMatchObject({ native: { enabled: false }, web: { enabled: false } })
  })
  it('revokes only the just-created session if profile persistence fails', async () => {
    profileFailure = true
    expect((await native()).status).toBe(500)
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
  async function start(reauthenticate = false) {
    const verifier = 'v'.repeat(43)
    const challenge = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
    const response = await request('/start', { redirect_uri: 'https://console.example.com/login', code_challenge: challenge, client_state: 's'.repeat(43), reauthenticate }, reauthenticate ? { Authorization: 'Bearer existing-session' } : {})
    expect(response.status).toBe(200)
    const url = new URL(((await response.json()) as { authorization_url: string }).authorization_url)
    expect(url.searchParams.get('response_mode')).toBe('form_post')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    return { verifier, state: url.searchParams.get('state')! }
  }
  async function callback(state: string, extra: Record<string, string> = {}) {
    return app.request('/callback', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ state, code: 'google-code', ...extra }) })
  }
  it('uses provider PKCE/form-post and an encrypted single-use client-verifier-bound completion', async () => {
    const { verifier, state } = await start()
    const response = await callback(state)
    expect(response.status).toBe(303)
    const redirect = new URL(response.headers.get('location')!)
    expect(redirect.search).toBe('')
    expect([...attempts.values()][0].credential).not.toContain('google-provider-access')
    const code = new URLSearchParams(redirect.hash.slice(1)).get('google_code')!
    expect((await request('/exchange', { code, code_verifier: 'w'.repeat(43), captcha_token: 'captcha' })).status).toBe(400)
    const result = await request('/exchange', { code, code_verifier: verifier, captcha_token: 'captcha' })
    expect(await result.json()).toMatchObject({ is_new_user: true })
    expect((await request('/exchange', { code, code_verifier: verifier, captcha_token: 'captcha' })).status).toBe(400)
    expect((await callback(state)).status).toBe(400)
  })
  it('rejects unknown state, cancellation and an expired callback', async () => {
    expect((await callback('x'.repeat(43))).status).toBe(400)
    const { state } = await start()
    expect((await callback(state, { error: 'access_denied' })).headers.get('location')).toContain('google_error=')
    const next = await start()
    for (const row of attempts.values()) row.expired = true
    expect((await callback(next.state)).status).toBe(400)
    expect(mocks.exchange).not.toHaveBeenCalled()
  })
  it('permits web reauthentication with signup disabled', async () => {
    vi.stubEnv('WEB_GOOGLE_LOGIN_ENABLED', 'false')
    const { state, verifier } = await start(true)
    const callbackResponse = await callback(state)
    const code = new URLSearchParams(new URL(callbackResponse.headers.get('location')!).hash.slice(1)).get('google_code')!
    expect((await request('/exchange', { code, code_verifier: verifier, captcha_token: 'captcha' })).status).toBe(200)
  })
})
