import type { Context } from 'hono'
import { base64url, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyGoogleIdentity } from '../supabase/functions/_backend/utils/googleSignIn.ts'

const context = { env: {} } as Context
const nonce = 'n'.repeat(43)
const accessToken = 'provider-access'
let key: CryptoKey
let jwks: unknown
beforeAll(async () => {
  const keys = await generateKeyPair('RS256', { extractable: true })
  key = keys.privateKey
  jwks = { keys: [{ ...await exportJWK(keys.publicKey), kid: 'google-example-key', alg: 'RS256' }] }
})
beforeEach(() => {
  vi.stubEnv('GOOGLE_SIGN_IN_WEB_CLIENT_ID', 'web-example.apps.googleusercontent.com')
  vi.stubEnv('GOOGLE_SIGN_IN_IOS_CLIENT_ID', 'ios-example.apps.googleusercontent.com')
  vi.stubEnv('GOOGLE_SIGN_IN_ANDROID_CLIENT_IDS', '["android-example.apps.googleusercontent.com"]')
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(jwks)))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
async function token(overrides: Record<string, unknown> = {}) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)))
  const hash = [...digest].map(b => b.toString(16).padStart(2, '0')).join('')
  const accessHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken)))
  return new SignJWT({
    iss: 'https://accounts.google.com',
    sub: 'google-subject',
    aud: 'web-example.apps.googleusercontent.com',
    azp: 'ios-example.apps.googleusercontent.com',
    email: 'google-user@example.com',
    email_verified: true,
    nonce: hash,
    at_hash: base64url.encode(accessHash.slice(0, 16)),
    given_name: ' First\u0000 ',
    family_name: 'Name',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  }).setProtectedHeader({ alg: 'RS256', kid: 'google-example-key' }).sign(key)
}
describe('verified Google identity', () => {
  it('verifies native audience/presenter, raw nonce and access-token hash before using signed names', async () => {
    await expect(verifyGoogleIdentity(context, await token(), nonce, accessToken)).resolves.toEqual({ subject: 'google-subject', email: 'google-user@example.com', first_name: 'First', last_name: 'Name' })
  })
  it.each([
    { iss: 'https://foreign.example.com' },
    { aud: 'foreign.apps.googleusercontent.com' },
    { aud: ['web-example.apps.googleusercontent.com', 'foreign.apps.googleusercontent.com'] },
    { azp: 'foreign.apps.googleusercontent.com' },
    { nonce: 'foreign' },
    { email_verified: false },
    { exp: 1 },
    { iat: Math.floor(Date.now() / 1000) - 1200 },
    { sub: '' },
    { sub: 123 },
    { sub: { untrusted: 'subject' } },
    { email: 'invalid' },
  ])('rejects invalid signed claims %j', async (claims) => {
    await expect(verifyGoogleIdentity(context, await token(claims), nonce, accessToken)).rejects.toThrow()
  })
  it.each([undefined, 'foreign-access'])('rejects missing or mismatched access token when at_hash is present', async (access) => {
    await expect(verifyGoogleIdentity(context, await token(), nonce, access)).rejects.toThrow()
  })
  it('accepts the documented bare Google issuer and optional absent names/access hash', async () => {
    await expect(verifyGoogleIdentity(context, await token({ iss: 'accounts.google.com', given_name: undefined, family_name: '<markup>', at_hash: undefined }), nonce)).resolves.toMatchObject({ first_name: '', last_name: '' })
  })
  it('constrains browser tokens to the web audience and presenter', async () => {
    await expect(verifyGoogleIdentity(context, await token(), nonce, accessToken, true)).rejects.toThrow()
    await expect(verifyGoogleIdentity(context, await token({ azp: 'web-example.apps.googleusercontent.com' }), nonce, accessToken, true)).resolves.toMatchObject({ subject: 'google-subject' })
  })
})
