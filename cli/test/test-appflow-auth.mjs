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

console.log('auth pkce/url/expiry OK')
