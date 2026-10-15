import type { Context } from 'hono'
import { base64url, createRemoteJWKSet, jwtVerify } from 'jose'
import { isSocialRolloutEnabled } from './socialAuthConfig.ts'
import { authNonceHash, sanitizeAuthName } from './socialAuthStore.ts'
import { getEnv } from './utils.ts'

export { isSocialRolloutEnabled as isGoogleRolloutEnabled } from './socialAuthConfig.ts'

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

export function googleClientIds(c: Context) {
  const web = getEnv(c, 'GOOGLE_SIGN_IN_WEB_CLIENT_ID').trim()
  const ios = getEnv(c, 'GOOGLE_SIGN_IN_IOS_CLIENT_ID').trim()
  const android = JSON.parse(getEnv(c, 'GOOGLE_SIGN_IN_ANDROID_CLIENT_IDS') || '[]') as unknown
  if ([web, ios].some(id => id && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(id))
    || !Array.isArray(android) || !android.every(id => typeof id === 'string' && /^[\w-]+\.apps\.googleusercontent\.com$/.test(id))) {
    throw new Error('Invalid Google client configuration')
  }
  return { web, ios, native: [...new Set([web, ios, ...android].filter(Boolean))] }
}

export async function verifyGoogleIdentity(c: Context, token: string, nonce: string, accessToken?: string, web = false) {
  const ids = googleClientIds(c)
  const audience = web ? [ids.web].filter(Boolean) : ids.native
  if (!audience.length)
    throw new Error('Google audience unavailable')
  const { payload } = await jwtVerify(token, googleKeys, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience,
    algorithms: ['RS256'],
    requiredClaims: ['sub', 'exp', 'iat', 'nonce', 'email', 'email_verified'],
    maxTokenAge: '10m',
  })
  const hashedNonce = await authNonceHash(nonce)
  if (payload.nonce !== hashedNonce || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 || typeof payload.aud !== 'string'
    || typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(payload.email)
    || (payload.email_verified !== true && payload.email_verified !== 'true')) {
    throw new Error('Invalid Google identity')
  }
  if (payload.azp !== undefined && (typeof payload.azp !== 'string' || !audience.includes(payload.azp)))
    throw new Error('Invalid Google presenter')
  if (payload.at_hash !== undefined) {
    if (!accessToken)
      throw new Error('Google access token required')
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken)))
    if (payload.at_hash !== base64url.encode(hash.slice(0, 16)))
      throw new Error('Invalid Google access token binding')
  }
  return {
    subject: payload.sub,
    email: payload.email.trim().toLowerCase(),
    first_name: sanitizeAuthName(payload.given_name),
    last_name: sanitizeAuthName(payload.family_name),
  }
}

export function isGoogleSignInConfigured(c: Context) {
  try {
    return !!googleClientIds(c).web
  }
  catch { return false }
}
export async function isNativeGoogleLoginConfigured(c: Context) {
  return isGoogleSignInConfigured(c) && isSocialRolloutEnabled(c, 'NATIVE_GOOGLE_LOGIN_ENABLED')
}
