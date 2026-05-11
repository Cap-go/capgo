#!/usr/bin/env node
/**
 * Unit tests for Google OAuth helpers. Covers pieces that don't require a real
 * network round-trip:
 *  - PKCE pair generation (base64url length, S256 digest math)
 *  - state parameter uniqueness + shape
 *  - auth URL construction (correct params, correct endpoint, scope join)
 *  - token response parsing (expiresAt math)
 */

import crypto from 'node:crypto'

console.log('🧪 Testing Google OAuth helpers...\n')

let testsPassed = 0
let testsFailed = 0

async function test(name, fn) {
  try {
    console.log(`\n🔍 ${name}`)
    await fn()
    console.log(`✅ PASSED: ${name}`)
    testsPassed++
  }
  catch (error) {
    console.error(`❌ FAILED: ${name}`)
    console.error(`   Error: ${error.message}`)
    testsFailed++
  }
}

function assert(cond, msg) {
  if (!cond)
    throw new Error(msg || 'Assertion failed')
}

function assertEquals(actual, expected, msg) {
  if (actual !== expected)
    throw new Error(msg || `Expected ${expected}, got ${actual}`)
}

async function importOAuth() {
  return await import('../src/build/onboarding/android/oauth-google.ts')
}

function base64urlOf(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

await test('generatePkcePair returns a 43-char base64url verifier', async () => {
  const { generatePkcePair } = await importOAuth()
  const pair = generatePkcePair()
  assertEquals(pair.verifier.length, 43, `verifier length should be 43, got ${pair.verifier.length}`)
  assert(/^[\w-]+$/.test(pair.verifier), `verifier must be base64url, got ${pair.verifier}`)
  assertEquals(pair.method, 'S256')
})

await test('generatePkcePair produces a correct S256 challenge', async () => {
  const { generatePkcePair } = await importOAuth()
  const pair = generatePkcePair()
  const expectedChallenge = base64urlOf(crypto.createHash('sha256').update(pair.verifier).digest())
  assertEquals(pair.challenge, expectedChallenge, 'challenge must be SHA-256 of verifier, base64url-encoded without padding')
})

await test('generatePkcePair yields distinct pairs', async () => {
  const { generatePkcePair } = await importOAuth()
  const a = generatePkcePair()
  const b = generatePkcePair()
  assert(a.verifier !== b.verifier, 'two verifiers must differ')
  assert(a.challenge !== b.challenge, 'two challenges must differ')
})

await test('generateState returns a URL-safe string and is unique', async () => {
  const { generateState } = await importOAuth()
  const s1 = generateState()
  const s2 = generateState()
  assert(s1.length >= 16, `state should be sufficiently long, got ${s1.length}`)
  assert(/^[\w-]+$/.test(s1), `state must be base64url, got ${s1}`)
  assert(s1 !== s2, 'state values must differ across calls')
})

await test('buildAuthUrl points at Google and includes all required params', async () => {
  const { buildAuthUrl } = await importOAuth()
  const url = buildAuthUrl({
    clientId: 'client-abc.apps.googleusercontent.com',
    redirectUri: 'http://127.0.0.1:54321/callback',
    scopes: ['openid', 'https://www.googleapis.com/auth/androidpublisher'],
    state: 'the-state',
    codeChallenge: 'challenge-xyz',
  })
  assert(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'), `wrong endpoint: ${url}`)
  const parsed = new URL(url)
  assertEquals(parsed.searchParams.get('client_id'), 'client-abc.apps.googleusercontent.com')
  assertEquals(parsed.searchParams.get('redirect_uri'), 'http://127.0.0.1:54321/callback')
  assertEquals(parsed.searchParams.get('response_type'), 'code')
  assertEquals(parsed.searchParams.get('scope'), 'openid https://www.googleapis.com/auth/androidpublisher')
  assertEquals(parsed.searchParams.get('access_type'), 'offline')
  assertEquals(parsed.searchParams.get('prompt'), 'consent')
  assertEquals(parsed.searchParams.get('state'), 'the-state')
  assertEquals(parsed.searchParams.get('code_challenge'), 'challenge-xyz')
  assertEquals(parsed.searchParams.get('code_challenge_method'), 'S256')
})

await test('buildAuthUrl passes extra params through', async () => {
  const { buildAuthUrl } = await importOAuth()
  const url = buildAuthUrl({
    clientId: 'c',
    redirectUri: 'http://127.0.0.1:1/callback',
    scopes: ['openid'],
    state: 's',
    codeChallenge: 'ch',
    extra: { login_hint: 'user@example.com' },
  })
  assertEquals(new URL(url).searchParams.get('login_hint'), 'user@example.com')
})

await test('parseTokenResponse computes absolute expiresAt from expires_in', async () => {
  const { parseTokenResponse } = await importOAuth()
  const now = 1_700_000_000_000
  const tokens = parseTokenResponse({
    access_token: 'at',
    expires_in: 3599,
    refresh_token: 'rt',
    scope: 'openid',
    token_type: 'Bearer',
    id_token: 'idt',
  }, now)
  assertEquals(tokens.accessToken, 'at')
  assertEquals(tokens.refreshToken, 'rt')
  assertEquals(tokens.idToken, 'idt')
  assertEquals(tokens.scope, 'openid')
  assertEquals(tokens.tokenType, 'Bearer')
  assertEquals(tokens.expiresAt, now + 3599 * 1000)
})

await test('GOOGLE_OAUTH_SCOPES_ANDROIDPUBLISHER has the expected three scopes', async () => {
  const { GOOGLE_OAUTH_SCOPES_ANDROIDPUBLISHER } = await importOAuth()
  assertEquals(GOOGLE_OAUTH_SCOPES_ANDROIDPUBLISHER.length, 3)
  assert(GOOGLE_OAUTH_SCOPES_ANDROIDPUBLISHER.includes('openid'))
  assert(GOOGLE_OAUTH_SCOPES_ANDROIDPUBLISHER.includes('https://www.googleapis.com/auth/userinfo.email'))
  assert(GOOGLE_OAUTH_SCOPES_ANDROIDPUBLISHER.includes('https://www.googleapis.com/auth/androidpublisher'))
})

await test('revokeToken POSTs the token to Google\'s revoke endpoint', async () => {
  const { revokeToken } = await importOAuth()
  let captured = null
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), method: init?.method, body: init?.body }
    return new Response('', { status: 200 })
  }
  try {
    await revokeToken('rt-abc-123')
  }
  finally {
    globalThis.fetch = originalFetch
  }
  assert(captured !== null, 'fetch should have been called')
  assertEquals(captured.url, 'https://oauth2.googleapis.com/revoke')
  assertEquals(captured.method, 'POST')
  const params = new URLSearchParams(captured.body)
  assertEquals(params.get('token'), 'rt-abc-123')
})

await test('revokeToken treats 400 as "already revoked" without throwing', async () => {
  const { revokeToken } = await importOAuth()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('invalid_token', { status: 400 })
  try {
    await revokeToken('stale-token')
    // No throw — pass
  }
  finally {
    globalThis.fetch = originalFetch
  }
})

await test('revokeToken throws on 5xx so caller can log the failure', async () => {
  const { revokeToken } = await importOAuth()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('upstream error', { status: 503 })
  let threw = false
  try {
    await revokeToken('any-token')
  }
  catch (err) {
    threw = true
    assert(/revoke failed.*503/i.test(err.message), `expected revoke failure message, got: ${err.message}`)
  }
  finally {
    globalThis.fetch = originalFetch
  }
  assert(threw, 'expected revokeToken to throw on 5xx')
})

console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
