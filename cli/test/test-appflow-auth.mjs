import assert from 'node:assert'

const { pkce, buildAuthorizeUrl, isExpired } = await import('../src/build/onboarding/appflow/auth.ts')

const { verifier, challenge } = pkce()
assert.ok(verifier.length >= 43 && !/[+/=]/.test(verifier), 'verifier is base64url, no padding')
assert.ok(challenge.length >= 43 && !/[+/=]/.test(challenge), 'challenge is base64url S256')
assert.notStrictEqual(verifier, challenge, 'challenge != verifier')

const url = new URL(buildAuthorizeUrl(challenge, 'st8', 'nonce1'))
assert.strictEqual(url.origin + url.pathname, 'https://ionicframework.com/oauth/authorize')
assert.strictEqual(url.searchParams.get('client_id'), 'cli')
assert.strictEqual(url.searchParams.get('audience'), 'https://api.ionicjs.com')
assert.strictEqual(url.searchParams.get('redirect_uri'), 'http://localhost:8123')
assert.strictEqual(url.searchParams.get('code_challenge_method'), 'S256')
assert.strictEqual(url.searchParams.get('code_challenge'), challenge)
assert.strictEqual(url.searchParams.get('scope'), 'openid profile email offline_access')
assert.strictEqual(url.searchParams.get('state'), 'st8')

assert.strictEqual(isExpired({ expires_in: 43200, capturedAtMs: Date.now() }), false)
assert.strictEqual(isExpired({ expires_in: 43200, capturedAtMs: Date.now() - 43200_000 }), true)

// ── sanitizeOauthError: strips control chars, caps length, never empty ──
const auth = await import('../src/build/onboarding/appflow/auth.ts')
assert.strictEqual(auth.sanitizeOauthError('access_denied'), 'access_denied')
assert.ok(!/[\n\r<>]/.test(auth.sanitizeOauthError('a\nb<script>')), 'control/markup chars stripped')
assert.ok(auth.sanitizeOauthError('x'.repeat(500)).length <= 80, 'length capped')
assert.strictEqual(auth.sanitizeOauthError(null), 'unknown')
assert.strictEqual(auth.sanitizeOauthError(''), 'unknown')

// ── OAuth STATE validation (C10/C15/C29): a redirect carrying the WRONG state is
// rejected, defeating login-CSRF / code injection. We drive loginWithBrowser and,
// from the openBrowser callback, hit the real loopback with a bad state. The
// promise MUST reject (and never exchange the injected code).
{
  const http = await import('node:http')
  const hitLoopback = (query) => new Promise((resolve) => {
    const req = http.request({ host: 'localhost', port: 8123, path: `/?${query}`, method: 'GET' }, (res) => {
      res.on('data', () => {})
      res.on('end', resolve)
    })
    req.on('error', resolve)
    req.end()
  })
  // wrong state -> reject
  await assert.rejects(
    () => auth.loginWithBrowser({ openBrowser: () => { setTimeout(() => void hitLoopback('code=INJECTED&state=not-the-expected-state'), 20) } }),
    /state mismatch/i,
    'mismatched state is rejected',
  )
}

// ── abort signal frees the loopback (no leak): aborting rejects with "cancelled" ──
{
  const ac = new AbortController()
  const p = auth.loginWithBrowser({ openBrowser: () => {}, signal: ac.signal })
  setTimeout(() => ac.abort(), 20)
  await assert.rejects(() => p, /cancelled/i, 'abort frees the server and rejects')
}

console.log('auth pkce/url/expiry OK')
