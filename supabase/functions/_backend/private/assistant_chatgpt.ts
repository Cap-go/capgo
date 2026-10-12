import type { Context } from 'hono'
import type { AuthInfo, honoFactory, MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { z } from 'zod'
import { sha256Hex } from '../mcp/oauth_utils.ts'
import {
  buildAuthorizeUrl,
  CHATGPT_AGENT_NAME,
  CHATGPT_DEFAULT_ISSUER,
  CHATGPT_DYNAMIC_CLIENT_ID,
  CHATGPT_LOOPBACK_REDIRECT_URI,
  CHATGPT_PENDING_TTL_SECONDS,
  CHATGPT_REFRESH_MARGIN_MS,
  CHATGPT_RESOURCE,
  CHATGPT_TERMINAL_REFRESH_ERRORS,
  chatGptEndpoints,
  decryptSecret,
  encryptSecret,
  hasPlanUsage,
  newHostId,
  newOAuthTransaction,
  pkceChallenge,
  resolveIssuedClientId,
  safeReturnTo,
  verifyIdToken,
} from '../utils/chatgpt_oauth.ts'
import { parseBody, quickError, simpleError } from '../utils/hono.ts'
import { middlewareAuth } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { closeClient, getPgClient } from '../utils/pg.ts'
import { safeParseSchema } from '../utils/schema_validation.ts'
import { checkKey, supabaseAdmin } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

/**
 * "Continue with ChatGPT" for the console assistant: OpenAI Sign in with ChatGPT with plan usage.
 * The user's ChatGPT subscription pays for the assistant's Responses API calls.
 *
 * Two client modes:
 *  - dynamic (default): same flow as the Capgo browser app. The first sign-in registers an agent
 *    client (client_id=dynamic_agent_client + agent_name_hint + ext_agent_host_id) and OpenAI
 *    issues a per-user oaiapp_ client in the callback. The redirect must be the http loopback
 *    CHATGPT_LOOPBACK_REDIRECT_URI: the native app intercepts it in an in-app web view, the web
 *    console asks the user to paste the address the sign-in window lands on.
 *  - partner: CHATGPT_CLIENT_ID (+ optional CHATGPT_CLIENT_SECRET) from the OpenAI commercial trial,
 *    with the https redirect <WEBAPP_URL>/assistant/chatgpt-callback.
 *
 * The same row also keeps the encrypted "MCP · Capgo Assistant" API key so it never sits in the browser.
 * ASSISTANT_TOKEN_SECRET encrypts every secret stored here.
 */

type ApikeyRow = Database['public']['Tables']['apikeys']['Row']

export interface ConnectionRow {
  user_id: string
  apikey_enc: string | null
  host_id: string | null
  client_id: string | null
  email: string | null
  scopes: string | null
  plan_usage: boolean
  access_token_enc: string | null
  refresh_token_enc: string | null
  access_expires_at: string | null
  pending_verifier_enc: string | null
  pending_nonce: string | null
  pending_client_id: string | null
  pending_redirect_uri: string | null
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

export type ChatGptMode = 'dynamic' | 'partner'

export class ChatGptError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

const authorizeSchema = z.object({ returnTo: z.string().max(500).optional() })
const callbackSchema = z.object({
  code: z.string().min(1).max(4096),
  state: z.string().min(16).max(256),
  clientId: z.string().min(1).max(200).optional(),
})
const keySchema = z.object({ apikey: z.string().min(1).max(512) })
const AUTH_FETCH_TIMEOUT_MS = 15_000

let jwksCache: { url: string, fetchedAt: number, keys: { keys: JsonWebKey[] } } | null = null

function config(c: Context) {
  const partnerClientId = getEnv(c, 'CHATGPT_CLIENT_ID').trim()
  const webapp = getEnv(c, 'WEBAPP_URL').replace(/\/$/, '')
  const mode: ChatGptMode = partnerClientId ? 'partner' : 'dynamic'
  const secret = getEnv(c, 'ASSISTANT_TOKEN_SECRET').trim()
  return {
    mode,
    partnerClientId,
    clientSecret: getEnv(c, 'CHATGPT_CLIENT_SECRET').trim(),
    secret,
    endpoints: chatGptEndpoints(getEnv(c, 'CHATGPT_AUTH_ISSUER') || CHATGPT_DEFAULT_ISSUER),
    redirectUri: mode === 'partner' ? `${webapp}/assistant/chatgpt-callback` : CHATGPT_LOOPBACK_REDIRECT_URI,
    enabled: !!secret && (mode === 'dynamic' || !!webapp),
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

export function requireUserSession(c: Context<MiddlewareKeyVariables>): AuthInfo {
  const auth = c.get('auth') as AuthInfo | undefined
  if (!auth?.userId || auth.authType !== 'jwt')
    throw quickError(401, 'not_authorized', 'The assistant requires a signed-in console session')
  return auth
}

async function loadRow(c: Context, userId: string): Promise<ConnectionRow | undefined> {
  return withPg(c, async (pg) => {
    const { rows } = await pg.query<ConnectionRow>('SELECT * FROM public.assistant_chatgpt_connections WHERE user_id = $1', [userId])
    return rows[0]
  })
}

async function tokenRequest(c: Context, form: Record<string, string>): Promise<{ ok: boolean, status: number, data: TokenResponse }> {
  const cfg = config(c)
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', 'accept': 'application/json' }
  // Only the partner client is confidential; dynamically issued clients are public (no secret).
  if (cfg.clientSecret && form.client_id === cfg.partnerClientId)
    headers.authorization = `Basic ${btoa(`${encodeURIComponent(cfg.partnerClientId)}:${encodeURIComponent(cfg.clientSecret)}`)}`
  let response: Response
  try {
    response = await fetch(cfg.endpoints.token, { method: 'POST', headers, body: new URLSearchParams(form), signal: AbortSignal.timeout(AUTH_FETCH_TIMEOUT_MS) })
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'chatgpt_token_network_error', error: error instanceof Error ? error.message : String(error) })
    return { ok: false, status: 0, data: {} }
  }
  const data = await response.json().catch(() => ({})) as TokenResponse
  if (!response.ok)
    cloudlog({ requestId: c.get('requestId'), message: 'chatgpt_token_error', status: response.status, error: data.error, openaiRequestId: response.headers.get('x-request-id') })
  return { ok: response.ok, status: response.status, data }
}

async function loadJwks(c: Context): Promise<{ keys: JsonWebKey[] }> {
  const url = config(c).endpoints.jwks
  if (jwksCache && jwksCache.url === url && Date.now() - jwksCache.fetchedAt < 3_600_000)
    return jwksCache.keys
  const response = await fetch(url, { signal: AbortSignal.timeout(AUTH_FETCH_TIMEOUT_MS) }).catch(() => null)
  if (!response?.ok)
    throw quickError(502, 'chatgpt_jwks_unavailable', 'Cannot verify the ChatGPT sign-in right now')
  const keys = await response.json() as { keys: JsonWebKey[] }
  jwksCache = { url, fetchedAt: Date.now(), keys }
  return keys
}

/** Start the OAuth transaction: store state hash, nonce and the encrypted PKCE verifier, return the ChatGPT URL. */
export async function startChatGptAuthorization(c: Context, userId: string, returnTo: unknown) {
  const cfg = config(c)
  const row = await loadRow(c, userId)
  const hostId = row?.host_id ?? newHostId()
  // Dynamic mode reuses the client issued at the first registration for later sign-ins.
  const clientId = cfg.mode === 'partner' ? cfg.partnerClientId : (row?.client_id ?? CHATGPT_DYNAMIC_CLIENT_ID)
  const { state, nonce, verifier } = newOAuthTransaction()
  const stateHash = await sha256Hex(state)
  const verifierEnc = await encryptSecret(verifier, cfg.secret)
  await withPg(c, pg => pg.query(
    `INSERT INTO public.assistant_chatgpt_connections (user_id, host_id, pending_state_hash, pending_verifier_enc, pending_nonce, pending_client_id, pending_redirect_uri, pending_return_to, pending_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(secs => $9))
     ON CONFLICT (user_id) DO UPDATE SET host_id = EXCLUDED.host_id, pending_state_hash = EXCLUDED.pending_state_hash,
       pending_verifier_enc = EXCLUDED.pending_verifier_enc, pending_nonce = EXCLUDED.pending_nonce, pending_client_id = EXCLUDED.pending_client_id,
       pending_redirect_uri = EXCLUDED.pending_redirect_uri, pending_return_to = EXCLUDED.pending_return_to, pending_expires_at = EXCLUDED.pending_expires_at, updated_at = now()`,
    [userId, hostId, stateHash, verifierEnc, nonce, clientId, cfg.redirectUri, safeReturnTo(returnTo), CHATGPT_PENDING_TTL_SECONDS],
  ))
  const url = buildAuthorizeUrl({
    endpoints: cfg.endpoints,
    clientId,
    redirectUri: cfg.redirectUri,
    state,
    nonce,
    codeChallenge: await pkceChallenge(verifier),
    hostId: cfg.mode === 'dynamic' ? hostId : (getEnv(c, 'CHATGPT_HOST_ID').trim() || undefined),
    agentNameHint: clientId === CHATGPT_DYNAMIC_CLIENT_ID ? CHATGPT_AGENT_NAME : undefined,
    loginHint: row?.email ?? undefined,
  })
  return { url, mode: cfg.mode, redirectUri: cfg.redirectUri }
}

/** Finish the OAuth transaction: exchange the code, verify the ID token and store the encrypted grant. */
export async function completeChatGptAuthorization(c: Context, userId: string, code: string, state: string, callbackClientId?: string) {
  const cfg = config(c)
  const stateHash = await sha256Hex(state)
  // Consume the pending transaction atomically so a code can only be redeemed once.
  const pending = await withPg(c, async (pg) => {
    const { rows } = await pg.query<ConnectionRow>(
      `UPDATE public.assistant_chatgpt_connections AS t
       SET pending_state_hash = NULL, pending_verifier_enc = NULL, pending_nonce = NULL, pending_client_id = NULL,
           pending_redirect_uri = NULL, pending_expires_at = NULL, updated_at = now()
       FROM (SELECT user_id, pending_verifier_enc, pending_nonce, pending_client_id, pending_redirect_uri, pending_return_to, pending_expires_at
             FROM public.assistant_chatgpt_connections WHERE user_id = $1 AND pending_state_hash = $2 FOR UPDATE) AS old
       WHERE t.user_id = old.user_id
       RETURNING old.pending_verifier_enc, old.pending_nonce, old.pending_client_id, old.pending_redirect_uri, old.pending_return_to, old.pending_expires_at`,
      [userId, stateHash],
    )
    return rows[0]
  })
  if (!pending?.pending_expires_at || new Date(pending.pending_expires_at).getTime() <= Date.now())
    throw quickError(410, 'chatgpt_request_expired', 'This ChatGPT sign-in expired. Start again from the assistant.')
  const verifier = await decryptSecret(pending.pending_verifier_enc, cfg.secret)
  if (!verifier || !pending.pending_nonce || !pending.pending_client_id || !pending.pending_redirect_uri)
    throw quickError(410, 'chatgpt_request_expired', 'This ChatGPT sign-in expired. Start again from the assistant.')

  const clientId = resolveIssuedClientId(pending.pending_client_id, callbackClientId)
  if (!clientId)
    throw quickError(400, 'chatgpt_invalid_client', 'ChatGPT did not return the expected client. Start again from the assistant.')

  const token = await tokenRequest(c, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: pending.pending_redirect_uri,
    client_id: clientId,
    code_verifier: verifier,
    resource: CHATGPT_RESOURCE,
  })
  if (!token.ok || !token.data.id_token || !token.data.access_token)
    throw quickError(502, 'chatgpt_exchange_failed', 'ChatGPT did not accept the sign-in. Try again.')

  const claims = await verifyIdToken(token.data.id_token, await loadJwks(c) as { keys: Array<JsonWebKey & { kid?: string }> }, {
    issuer: cfg.endpoints.issuer,
    clientId,
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
    [userId, clientId, claims.sub, claims.email ?? null, token.data.scope ?? null, planUsage, accessTokenEnc, refreshTokenEnc, token.data.expires_in ?? 3600],
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
export async function getChatGptAccessToken(c: Context, userId: string, row?: ConnectionRow): Promise<string | null> {
  const cfg = config(c)
  if (!cfg.enabled)
    return null
  row ??= await loadRow(c, userId)
  if (!row?.access_token_enc || !row.client_id)
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
    client_id: row.client_id,
    resource: CHATGPT_RESOURCE,
  })
  const accessToken = refreshed.data.access_token
  if (!refreshed.ok || !accessToken) {
    if (CHATGPT_TERMINAL_REFRESH_ERRORS.has(refreshed.data.error ?? '')) {
      await clearGrant(c, userId)
      throw new ChatGptError('chatgpt_reconnect_required', 'Your ChatGPT session expired. Connect ChatGPT again.')
    }
    throw new ChatGptError('chatgpt_unavailable', 'ChatGPT is unavailable right now, try again in a moment.')
  }
  // Refresh tokens rotate: replace access token, refresh token, expiry and scopes together.
  const scopes = refreshed.data.scope ?? row.scopes
  const accessTokenEnc = await encryptSecret(accessToken, cfg.secret)
  const refreshTokenEnc = refreshed.data.refresh_token ? await encryptSecret(refreshed.data.refresh_token, cfg.secret) : null
  await withPg(c, pg => pg.query(
    `UPDATE public.assistant_chatgpt_connections
     SET access_token_enc = $2, refresh_token_enc = COALESCE($3, refresh_token_enc), access_expires_at = now() + make_interval(secs => $4),
         scopes = $5, plan_usage = $6, updated_at = now()
     WHERE user_id = $1`,
    [userId, accessTokenEnc, refreshTokenEnc, refreshed.data.expires_in ?? 3600, scopes, hasPlanUsage(scopes)],
  ))
  return accessToken
}

/**
 * The stored "MCP · Capgo Assistant" API key, checked against the database on every use so a
 * revoked or expired key is dropped and the console creates a new one.
 */
export async function getAssistantApiKey(c: Context, userId: string): Promise<{ key: string, row: ApikeyRow, connection: ConnectionRow } | null> {
  const cfg = config(c)
  const connection = await loadRow(c, userId)
  const key = cfg.secret ? await decryptSecret(connection?.apikey_enc, cfg.secret) : null
  if (!connection || !key)
    return null
  const row = await checkKey(c, key, supabaseAdmin(c))
  if (!row || row.user_id !== userId) {
    await withPg(c, pg => pg.query('UPDATE public.assistant_chatgpt_connections SET apikey_enc = NULL, updated_at = now() WHERE user_id = $1', [userId]))
    return null
  }
  return { key, row, connection }
}

/** Routes mounted under /private/assistant (console session only). */
export function registerChatGptRoutes(app: ReturnType<typeof honoFactory.createApp>) {
  app.get('/status', middlewareAuth(), async (c) => {
    const auth = requireUserSession(c)
    const cfg = config(c)
    const row = cfg.secret ? await loadRow(c, auth.userId) : undefined
    return c.json({
      chatgpt: {
        configured: cfg.enabled,
        mode: cfg.mode,
        connected: !!row?.access_token_enc,
        email: row?.access_token_enc ? row.email : null,
        planUsage: !!row?.plan_usage,
      },
      hasKey: !!row?.apikey_enc,
    })
  })

  app.post('/key', middlewareAuth(), async (c) => {
    const auth = requireUserSession(c)
    const cfg = config(c)
    if (!cfg.secret)
      throw quickError(503, 'assistant_not_configured', 'The assistant is not configured on this server')
    const parsed = safeParseSchema(keySchema, await parseBody<unknown>(c))
    if (!parsed.success)
      throw simpleError('invalid_body', 'Invalid key body')
    // The key must be one the signed-in user owns: never store someone else's key.
    const apikey = await checkKey(c, parsed.data.apikey, supabaseAdmin(c))
    if (!apikey || apikey.user_id !== auth.userId)
      throw quickError(403, 'invalid_apikey', 'The API key does not belong to the signed-in user')
    await withPg(c, async pg => pg.query(
      `INSERT INTO public.assistant_chatgpt_connections (user_id, apikey_enc) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET apikey_enc = EXCLUDED.apikey_enc, updated_at = now()`,
      [auth.userId, await encryptSecret(parsed.data.apikey, cfg.secret)],
    ))
    return c.json({ status: 'ok' })
  })

  app.post('/chatgpt/authorize', middlewareAuth(), async (c) => {
    const auth = requireUserSession(c)
    if (!isChatGptConfigured(c))
      throw quickError(503, 'chatgpt_not_configured', 'Continue with ChatGPT is not configured on this server')
    const parsed = safeParseSchema(authorizeSchema, await parseBody<unknown>(c))
    if (!parsed.success)
      throw simpleError('invalid_body', 'Invalid authorize body')
    return c.json(await startChatGptAuthorization(c, auth.userId, parsed.data.returnTo))
  })

  app.post('/chatgpt/callback', middlewareAuth(), async (c) => {
    const auth = requireUserSession(c)
    if (!isChatGptConfigured(c))
      throw quickError(503, 'chatgpt_not_configured', 'Continue with ChatGPT is not configured on this server')
    const parsed = safeParseSchema(callbackSchema, await parseBody<unknown>(c))
    if (!parsed.success)
      throw simpleError('invalid_body', 'Invalid callback body')
    return c.json(await completeChatGptAuthorization(c, auth.userId, parsed.data.code, parsed.data.state, parsed.data.clientId))
  })

  // Sign out of ChatGPT: drop the grant and the issued client so the next sign-in can pick any account.
  app.delete('/chatgpt', middlewareAuth(), async (c) => {
    const auth = requireUserSession(c)
    await withPg(c, pg => pg.query(
      `UPDATE public.assistant_chatgpt_connections
       SET client_id = NULL, subject = NULL, email = NULL, scopes = NULL, plan_usage = false, access_token_enc = NULL,
           refresh_token_enc = NULL, access_expires_at = NULL, connected_at = NULL, updated_at = now()
       WHERE user_id = $1`,
      [auth.userId],
    ))
    return c.json({ status: 'ok' })
  })
}
