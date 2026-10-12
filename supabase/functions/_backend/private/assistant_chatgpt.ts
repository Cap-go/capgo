import type { Context } from 'hono'
import type { AuthInfo, honoFactory, MiddlewareKeyVariables } from '../utils/hono.ts'
import { z } from 'zod'
import { sha256Hex } from '../mcp/oauth_utils.ts'
import {
  buildAuthorizeUrl,
  CHATGPT_DEFAULT_ISSUER,
  CHATGPT_PENDING_TTL_SECONDS,
  CHATGPT_REFRESH_MARGIN_MS,
  CHATGPT_RESOURCE,
  CHATGPT_TERMINAL_REFRESH_ERRORS,
  chatGptEndpoints,
  decryptSecret,
  encryptSecret,
  hasPlanUsage,
  newOAuthTransaction,
  pkceChallenge,
  safeReturnTo,
  verifyIdToken,
} from '../utils/chatgpt_oauth.ts'
import { parseBody, quickError, simpleError } from '../utils/hono.ts'
import { middlewareAuth } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { closeClient, getPgClient } from '../utils/pg.ts'
import { safeParseSchema } from '../utils/schema_validation.ts'
import { getEnv } from '../utils/utils.ts'

/**
 * "Continue with ChatGPT" for the console assistant: OpenAI Sign in with ChatGPT with plan usage.
 * The user's ChatGPT subscription pays for the assistant's Responses API calls, Capgo never sees
 * their password and can be disconnected from ChatGPT settings or from the assistant.
 *
 * Config: CHATGPT_CLIENT_ID (oaiapp_..., from https://developers.openai.com/siwc/request-client-id),
 * optional CHATGPT_CLIENT_SECRET for a confidential client, ASSISTANT_TOKEN_SECRET to encrypt tokens,
 * WEBAPP_URL for the registered callback (<WEBAPP_URL>/assistant/chatgpt-callback).
 */

interface ConnectionRow {
  user_id: string
  client_id: string | null
  subject: string | null
  email: string | null
  scopes: string | null
  plan_usage: boolean
  access_token_enc: string | null
  refresh_token_enc: string | null
  access_expires_at: string | null
  pending_verifier_enc: string | null
  pending_nonce: string | null
  pending_return_to: string | null
  pending_expires_at: string | null
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  id_token?: string
  expires_in?: number
  scope?: string
  error?: string
}

export class ChatGptError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

const authorizeSchema = z.object({ returnTo: z.string().max(500).optional() })
const callbackSchema = z.object({ code: z.string().min(1).max(4096), state: z.string().min(16).max(256) })

let jwksCache: { url: string, fetchedAt: number, keys: { keys: JsonWebKey[] } } | null = null

function config(c: Context) {
  const clientId = getEnv(c, 'CHATGPT_CLIENT_ID').trim()
  const secret = getEnv(c, 'ASSISTANT_TOKEN_SECRET').trim()
  const webapp = getEnv(c, 'WEBAPP_URL').replace(/\/$/, '')
  return {
    clientId,
    clientSecret: getEnv(c, 'CHATGPT_CLIENT_SECRET').trim(),
    secret,
    endpoints: chatGptEndpoints(getEnv(c, 'CHATGPT_AUTH_ISSUER') || CHATGPT_DEFAULT_ISSUER),
    redirectUri: `${webapp}/assistant/chatgpt-callback`,
    hostId: getEnv(c, 'CHATGPT_HOST_ID').trim() || undefined,
    enabled: !!clientId && !!secret && !!webapp,
  }
}

export function isChatGptConfigured(c: Context): boolean {
  return config(c).enabled
}

async function withPg<T>(c: Context, fn: (pg: ReturnType<typeof getPgClient>) => Promise<T>): Promise<T> {
  const pg = getPgClient(c)
  try {
    return await fn(pg)
  }
  finally {
    await closeClient(c, pg)
  }
}

function requireUserSession(c: Context<MiddlewareKeyVariables>): AuthInfo {
  const auth = c.get('auth') as AuthInfo | undefined
  if (!auth?.userId || auth.authType !== 'jwt')
    throw quickError(401, 'not_authorized', 'Connecting ChatGPT requires a signed-in console session')
  return auth
}

async function tokenRequest(c: Context, form: Record<string, string>): Promise<{ ok: boolean, status: number, data: TokenResponse }> {
  const cfg = config(c)
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', 'accept': 'application/json' }
  if (cfg.clientSecret)
    headers.authorization = `Basic ${btoa(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`)}`
  const response = await fetch(cfg.endpoints.token, { method: 'POST', headers, body: new URLSearchParams(form) })
  const data = await response.json().catch(() => ({})) as TokenResponse
  if (!response.ok)
    cloudlog({ requestId: c.get('requestId'), message: 'chatgpt_token_error', status: response.status, error: data.error, openaiRequestId: response.headers.get('x-request-id') })
  return { ok: response.ok, status: response.status, data }
}

async function loadJwks(c: Context): Promise<{ keys: JsonWebKey[] }> {
  const url = config(c).endpoints.jwks
  if (jwksCache && jwksCache.url === url && Date.now() - jwksCache.fetchedAt < 3_600_000)
    return jwksCache.keys
  const response = await fetch(url)
  if (!response.ok)
    throw quickError(502, 'chatgpt_jwks_unavailable', 'Cannot verify the ChatGPT sign-in right now')
  const keys = await response.json() as { keys: JsonWebKey[] }
  jwksCache = { url, fetchedAt: Date.now(), keys }
  return keys
}

/** Start the OAuth transaction: store state hash, nonce and the encrypted PKCE verifier, return the ChatGPT URL. */
export async function startChatGptAuthorization(c: Context, userId: string, returnTo: unknown): Promise<string> {
  const cfg = config(c)
  const { state, nonce, verifier } = newOAuthTransaction()
  const stateHash = await sha256Hex(state)
  const verifierEnc = await encryptSecret(verifier, cfg.secret)
  const row = await withPg(c, async (pg) => {
    const { rows } = await pg.query<{ email: string | null, client_id: string | null }>(
      `INSERT INTO public.assistant_chatgpt_connections (user_id, pending_state_hash, pending_verifier_enc, pending_nonce, pending_return_to, pending_expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))
       ON CONFLICT (user_id) DO UPDATE SET pending_state_hash = EXCLUDED.pending_state_hash, pending_verifier_enc = EXCLUDED.pending_verifier_enc,
         pending_nonce = EXCLUDED.pending_nonce, pending_return_to = EXCLUDED.pending_return_to, pending_expires_at = EXCLUDED.pending_expires_at, updated_at = now()
       RETURNING email, client_id`,
      [userId, stateHash, verifierEnc, nonce, safeReturnTo(returnTo), CHATGPT_PENDING_TTL_SECONDS],
    )
    return rows[0]
  })
  return buildAuthorizeUrl({
    endpoints: cfg.endpoints,
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    state,
    nonce,
    codeChallenge: await pkceChallenge(verifier),
    hostId: cfg.hostId,
    loginHint: row?.email ?? undefined,
  })
}

/** Finish the OAuth transaction: exchange the code, verify the ID token and store the encrypted grant. */
export async function completeChatGptAuthorization(c: Context, userId: string, code: string, state: string) {
  const cfg = config(c)
  const stateHash = await sha256Hex(state)
  // Consume the pending transaction atomically so a code can only be redeemed once.
  const pending = await withPg(c, async (pg) => {
    const { rows } = await pg.query<ConnectionRow>(
      `UPDATE public.assistant_chatgpt_connections AS t
       SET pending_state_hash = NULL, pending_verifier_enc = NULL, pending_nonce = NULL, pending_expires_at = NULL, updated_at = now()
       FROM (SELECT user_id, pending_verifier_enc, pending_nonce, pending_return_to, pending_expires_at
             FROM public.assistant_chatgpt_connections WHERE user_id = $1 AND pending_state_hash = $2 FOR UPDATE) AS old
       WHERE t.user_id = old.user_id
       RETURNING old.pending_verifier_enc, old.pending_nonce, old.pending_return_to, old.pending_expires_at`,
      [userId, stateHash],
    )
    return rows[0]
  })
  if (!pending || !pending.pending_expires_at || new Date(pending.pending_expires_at).getTime() <= Date.now())
    throw quickError(410, 'chatgpt_request_expired', 'This ChatGPT sign-in expired. Start again from the assistant.')
  const verifier = await decryptSecret(pending.pending_verifier_enc, cfg.secret)
  if (!verifier || !pending.pending_nonce)
    throw quickError(410, 'chatgpt_request_expired', 'This ChatGPT sign-in expired. Start again from the assistant.')

  const token = await tokenRequest(c, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    code_verifier: verifier,
    resource: CHATGPT_RESOURCE,
  })
  if (!token.ok || !token.data.id_token || !token.data.access_token)
    throw quickError(502, 'chatgpt_exchange_failed', 'ChatGPT did not accept the sign-in. Try again.')

  const claims = await verifyIdToken(token.data.id_token, await loadJwks(c) as { keys: Array<JsonWebKey & { kid?: string }> }, {
    issuer: cfg.endpoints.issuer,
    clientId: cfg.clientId,
    nonce: pending.pending_nonce,
  })
  if (!claims)
    throw quickError(502, 'chatgpt_invalid_id_token', 'The ChatGPT sign-in could not be verified')

  const planUsage = hasPlanUsage(token.data.scope)
  const accessTokenEnc = await encryptSecret(token.data.access_token, cfg.secret)
  const refreshTokenEnc = token.data.refresh_token ? await encryptSecret(token.data.refresh_token, cfg.secret) : null
  await withPg(c, pg => pg.query(
    `UPDATE public.assistant_chatgpt_connections
     SET client_id = $2, subject = $3, email = $4, scopes = $5, plan_usage = $6, access_token_enc = $7, refresh_token_enc = $8,
         access_expires_at = now() + make_interval(secs => $9), connected_at = now(), updated_at = now()
     WHERE user_id = $1`,
    [
      userId,
      cfg.clientId,
      claims.sub,
      claims.email ?? null,
      token.data.scope ?? null,
      planUsage,
      accessTokenEnc,
      refreshTokenEnc,
      token.data.expires_in ?? 3600,
    ],
  ))
  return { returnTo: pending.pending_return_to ?? '/dashboard', email: claims.email ?? null, planUsage }
}

async function clearGrant(c: Context, userId: string) {
  await withPg(c, pg => pg.query(
    `UPDATE public.assistant_chatgpt_connections
     SET access_token_enc = NULL, refresh_token_enc = NULL, access_expires_at = NULL, plan_usage = false, updated_at = now()
     WHERE user_id = $1`,
    [userId],
  ))
}

/**
 * Access token for the user's ChatGPT plan, refreshed when close to expiry.
 * Returns null when the user never connected ChatGPT; throws ChatGptError when they must reconnect.
 */
export async function getChatGptAccessToken(c: Context, userId: string): Promise<string | null> {
  const cfg = config(c)
  if (!cfg.enabled)
    return null
  const row = await withPg(c, async (pg) => {
    const { rows } = await pg.query<ConnectionRow>(
      `SELECT user_id, client_id, scopes, plan_usage, access_token_enc, refresh_token_enc, access_expires_at
       FROM public.assistant_chatgpt_connections WHERE user_id = $1`,
      [userId],
    )
    return rows[0]
  })
  if (!row?.access_token_enc)
    return null
  if (!row.plan_usage)
    throw new ChatGptError('chatgpt_plan_usage_disabled', 'ChatGPT plan usage was not granted. Reconnect and allow it.')

  const expiresAt = row.access_expires_at ? new Date(row.access_expires_at).getTime() : 0
  if (expiresAt - CHATGPT_REFRESH_MARGIN_MS > Date.now()) {
    const token = await decryptSecret(row.access_token_enc, cfg.secret)
    if (token)
      return token
  }

  const refreshToken = await decryptSecret(row.refresh_token_enc, cfg.secret)
  if (!refreshToken) {
    await clearGrant(c, userId)
    throw new ChatGptError('chatgpt_reconnect_required', 'Your ChatGPT session expired. Connect ChatGPT again.')
  }
  const refreshed = await tokenRequest(c, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: row.client_id ?? cfg.clientId,
    resource: CHATGPT_RESOURCE,
  })
  if (!refreshed.ok || !refreshed.data.access_token) {
    if (CHATGPT_TERMINAL_REFRESH_ERRORS.has(refreshed.data.error ?? '')) {
      await clearGrant(c, userId)
      throw new ChatGptError('chatgpt_reconnect_required', 'Your ChatGPT session expired. Connect ChatGPT again.')
    }
    throw new ChatGptError('chatgpt_unavailable', 'ChatGPT is unavailable right now, try again in a moment.')
  }
  // Refresh tokens rotate: replace access token, refresh token, expiry and scopes together.
  const scopes = refreshed.data.scope ?? row.scopes
  await withPg(c, async pg => pg.query(
    `UPDATE public.assistant_chatgpt_connections
     SET access_token_enc = $2, refresh_token_enc = COALESCE($3, refresh_token_enc), access_expires_at = now() + make_interval(secs => $4),
         scopes = $5, plan_usage = $6, updated_at = now()
     WHERE user_id = $1`,
    [
      userId,
      await encryptSecret(refreshed.data.access_token!, cfg.secret),
      refreshed.data.refresh_token ? await encryptSecret(refreshed.data.refresh_token, cfg.secret) : null,
      refreshed.data.expires_in ?? 3600,
      scopes,
      hasPlanUsage(scopes),
    ],
  ))
  return refreshed.data.access_token!
}

/** Routes mounted under /private/assistant/chatgpt (console session only). */
export function registerChatGptRoutes(app: ReturnType<typeof honoFactory.createApp>) {
  app.get('/chatgpt', middlewareAuth(), async (c) => {
    const auth = requireUserSession(c)
    const configured = isChatGptConfigured(c)
    const row = configured
      ? await withPg(c, async (pg) => {
          const { rows } = await pg.query<{ email: string | null, plan_usage: boolean, connected: boolean }>(
            `SELECT email, plan_usage, access_token_enc IS NOT NULL AS connected FROM public.assistant_chatgpt_connections WHERE user_id = $1`,
            [auth.userId],
          )
          return rows[0]
        })
      : undefined
    return c.json({ configured, connected: !!row?.connected, email: row?.connected ? row.email : null, planUsage: !!row?.plan_usage })
  })

  app.post('/chatgpt/authorize', middlewareAuth(), async (c) => {
    const auth = requireUserSession(c)
    if (!isChatGptConfigured(c))
      throw quickError(503, 'chatgpt_not_configured', 'Continue with ChatGPT is not configured on this server')
    const parsed = safeParseSchema(authorizeSchema, await parseBody<unknown>(c))
    if (!parsed.success)
      throw simpleError('invalid_body', 'Invalid authorize body')
    return c.json({ url: await startChatGptAuthorization(c, auth.userId, parsed.data.returnTo) })
  })

  app.post('/chatgpt/callback', middlewareAuth(), async (c) => {
    const auth = requireUserSession(c)
    if (!isChatGptConfigured(c))
      throw quickError(503, 'chatgpt_not_configured', 'Continue with ChatGPT is not configured on this server')
    const parsed = safeParseSchema(callbackSchema, await parseBody<unknown>(c))
    if (!parsed.success)
      throw simpleError('invalid_body', 'Invalid callback body')
    return c.json(await completeChatGptAuthorization(c, auth.userId, parsed.data.code, parsed.data.state))
  })

  app.delete('/chatgpt', middlewareAuth(), async (c) => {
    const auth = requireUserSession(c)
    await withPg(c, pg => pg.query('DELETE FROM public.assistant_chatgpt_connections WHERE user_id = $1', [auth.userId]))
    return c.json({ status: 'ok' })
  })
}
