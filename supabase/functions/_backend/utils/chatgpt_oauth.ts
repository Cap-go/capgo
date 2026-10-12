import { base64UrlDecode, base64UrlEncode, randomToken } from '../mcp/oauth_utils.ts'

/**
 * Pure helpers for OpenAI "Sign in with ChatGPT" with ChatGPT plan usage
 * (https://developers.openai.com/siwc). Kept free of Hono / database imports for unit tests.
 */

export const CHATGPT_DEFAULT_ISSUER = 'https://auth.openai.com'
/**
 * Dynamic agent registration: the first sign-in uses this client_id and OpenAI issues a per-user
 * oaiapp_ client in the callback. Same flow as the Capgo browser app, no partner approval needed.
 */
export const CHATGPT_DYNAMIC_CLIENT_ID = 'dynamic_agent_client'
export const CHATGPT_AGENT_NAME = 'Capgo'
/** Dynamic registration only accepts an http loopback redirect. The console reads the code from it. */
export const CHATGPT_LOOPBACK_REDIRECT_URI = 'http://127.0.0.1:1455/auth/callback'
export const CHATGPT_RESOURCE = 'https://api.openai.com/v1'
/** Identity + refresh token + Responses API access billed to the user's ChatGPT plan. */
export const CHATGPT_SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
export const CHATGPT_PLAN_USAGE_SCOPE = 'chatgpt.tokens.use.direct'
/** The OAuth transaction (state, nonce, PKCE verifier) must complete within this window. */
export const CHATGPT_PENDING_TTL_SECONDS = 10 * 60
/** Refresh a little before the 1 hour access token expires. */
export const CHATGPT_REFRESH_MARGIN_MS = 60_000
/** Refresh errors after which the stored grant is unusable and the user must sign in again. */
export const CHATGPT_TERMINAL_REFRESH_ERRORS = new Set([
  'invalid_grant',
  'invalid_refresh_token',
  'token_expired',
  'refresh_token_expired',
  'refresh_token_invalidated',
  'refresh_token_reused',
])

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export interface ChatGptEndpoints {
  issuer: string
  authorize: string
  token: string
  jwks: string
}

export function chatGptEndpoints(issuer = CHATGPT_DEFAULT_ISSUER): ChatGptEndpoints {
  const base = issuer.replace(/\/$/, '')
  return {
    issuer: base,
    authorize: `${base}/api/accounts/authorize`,
    token: `${base}/api/accounts/oauth/token`,
    jwks: `${base}/api/accounts/oauth/jwks`,
  }
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))))
}

export interface AuthorizeParams {
  endpoints: ChatGptEndpoints
  clientId: string
  redirectUri: string
  state: string
  nonce: string
  codeChallenge: string
  hostId?: string
  /** Sent on first dynamic registration only. */
  agentNameHint?: string
  loginHint?: string
}

export function buildAuthorizeUrl(params: AuthorizeParams): string {
  const url = new URL(params.endpoints.authorize)
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('scope', CHATGPT_SCOPES)
  url.searchParams.set('resource', CHATGPT_RESOURCE)
  url.searchParams.set('state', params.state)
  url.searchParams.set('nonce', params.nonce)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('code_challenge', params.codeChallenge)
  if (params.hostId)
    url.searchParams.set('ext_agent_host_id', params.hostId)
  if (params.agentNameHint)
    url.searchParams.set('agent_name_hint', params.agentNameHint)
  if (params.loginHint)
    url.searchParams.set('login_hint', params.loginHint)
  return url.toString()
}

export function newHostId(): string {
  return `urn:uuid:${crypto.randomUUID()}`
}

/**
 * Validate the client_id returned by the callback. A registration must return a newly issued client;
 * a re-authorization may omit it but must never switch to another client.
 */
export function resolveIssuedClientId(pendingClientId: string, callbackClientId: string | undefined): string | null {
  if (pendingClientId === CHATGPT_DYNAMIC_CLIENT_ID) {
    if (!callbackClientId || callbackClientId === CHATGPT_DYNAMIC_CLIENT_ID)
      return null
    return callbackClientId
  }
  if (callbackClientId && callbackClientId !== pendingClientId)
    return null
  return pendingClientId
}

export function newOAuthTransaction() {
  return { state: randomToken(32), nonce: randomToken(32), verifier: randomToken(48) }
}

async function secretKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', encoder.encode(`capgo-assistant-chatgpt:${secret}`))
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(plaintext: string, secret: string): Promise<string> {
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await secretKey(secret), encoder.encode(plaintext))
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ciphertext))}`
}

export async function decryptSecret(payload: string | null | undefined, secret: string): Promise<string | null> {
  const [ivPart, dataPart] = (payload ?? '').split('.')
  if (!ivPart || !dataPart)
    return null
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlDecode(ivPart) }, await secretKey(secret), base64UrlDecode(dataPart))
    return decoder.decode(plaintext)
  }
  catch {
    return null
  }
}

/** Only same-origin console paths survive the round trip through OpenAI. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string')
    return '/dashboard'
  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\') || trimmed.length > 500)
    return '/dashboard'
  return trimmed
}

export interface IdTokenClaims {
  iss: string
  aud: string | string[]
  sub: string
  exp: number
  iat: number
  nonce?: string
  email?: string
}

interface Jwk extends JsonWebKey {
  kid?: string
}

function decodeJson<T>(part: string): T {
  return JSON.parse(decoder.decode(base64UrlDecode(part))) as T
}

/** Verify an RS256 OpenID Connect ID token against a JWKS (signature, issuer, audience, expiry, nonce). */
export async function verifyIdToken(
  idToken: string,
  jwks: { keys: Jwk[] },
  expected: { issuer: string, clientId: string, nonce: string },
  now = Date.now(),
): Promise<IdTokenClaims | null> {
  const parts = idToken.split('.')
  if (parts.length !== 3)
    return null
  let header: { alg?: string, kid?: string }
  let claims: IdTokenClaims
  try {
    header = decodeJson(parts[0])
    claims = decodeJson(parts[1])
  }
  catch {
    return null
  }
  if (header.alg !== 'RS256')
    return null
  const jwk = jwks.keys.find(key => key.kid === header.kid && (key.kty === 'RSA'))
  if (!jwk)
    return null
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlDecode(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`))
  if (!valid)
    return null

  const skewSeconds = 5
  const nowSeconds = Math.floor(now / 1000)
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (claims.iss !== expected.issuer || !audiences.includes(expected.clientId))
    return null
  if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.exp !== 'number' || typeof claims.iat !== 'number')
    return null
  if (claims.exp + skewSeconds < nowSeconds || claims.iat - skewSeconds > nowSeconds)
    return null
  if (claims.nonce !== expected.nonce)
    return null
  return claims
}

export function hasPlanUsage(scope: string | null | undefined): boolean {
  return (scope ?? '').split(/\s+/).includes(CHATGPT_PLAN_USAGE_SCOPE)
}
