import type { Context } from 'hono'
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose'
import { CacheHelper } from './cache.ts'
import { closeClient, getPgClient } from './pg.ts'
import { getEnv } from './utils.ts'

const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))
const requiredSettings = ['APPLE_SIGN_IN_CLIENT_ID', 'APPLE_SIGN_IN_TEAM_ID', 'APPLE_SIGN_IN_KEY_ID', 'APPLE_SIGN_IN_PRIVATE_KEY'] as const

export function isAppleSignInConfigured(c: Context) {
  return requiredSettings.every(key => getEnv(c, key).trim().length > 0)
}

export async function isNativeAppleLoginConfigured(c: Context) {
  if (!isAppleSignInConfigured(c))
    return false
  // Environment values are deployment-time overrides; Vault owns runtime rollout.
  const override = getEnv(c, 'NATIVE_APPLE_LOGIN_ENABLED')
  if (override)
    return override === 'true'
  try {
    const cache = new CacheHelper(c)
    const request = cache.buildRequest('/.native-apple-login-enabled')
    const cached = await cache.matchJson<{ enabled: boolean }>(request)
    if (cached)
      return cached.enabled === true
    const client = await getPgClient(c)
    let enabled = false
    try {
      const result = await client.query<{ decrypted_secret: string }>('SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1', ['NATIVE_APPLE_LOGIN_ENABLED'])
      enabled = result.rows[0]?.decrypted_secret?.trim() === 'true'
    }
    finally {
      await closeClient(c, client)
    }
    await cache.putJson(request, { enabled }, 60)
    return enabled
  }
  catch {
    return false
  }
}

export async function revokeAppleAuthorization(c: Context, code: string, expectedSubject: string) {
  const clientId = getEnv(c, 'APPLE_SIGN_IN_CLIENT_ID')
  const key = await importPKCS8(getEnv(c, 'APPLE_SIGN_IN_PRIVATE_KEY').replace(/\\n/g, '\n'), 'ES256')
  const secret = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: getEnv(c, 'APPLE_SIGN_IN_KEY_ID') })
    .setIssuer(getEnv(c, 'APPLE_SIGN_IN_TEAM_ID'))
    .setSubject(clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key)

  const exchanged = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, code, grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(5000),
  })
  if (!exchanged.ok)
    throw new Error('Apple code exchange failed')
  const tokens = await exchanged.json() as { id_token?: string, access_token?: string }
  if (!tokens.id_token || !tokens.access_token)
    throw new Error('Apple code exchange did not return credentials')

  const { payload } = await jwtVerify(tokens.id_token, appleKeys, { issuer: 'https://appleid.apple.com', audience: clientId, algorithms: ['RS256'] })
  if (payload.sub !== expectedSubject)
    throw new Error('Apple authorization does not belong to the authenticated user')

  const revoked = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, token: tokens.access_token, token_type_hint: 'access_token' }),
    signal: AbortSignal.timeout(5000),
  })
  if (!revoked.ok)
    throw new Error('Apple authorization revocation failed')
}
