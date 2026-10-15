import type { Context } from 'hono'
import type { AppleAttempt } from '../utils/appleAuthStore.ts'
import { z } from 'zod'
import { SocialAuthError as AppleAuthError, checkSocialEmail, finishSocialSignIn, getCaptchaSecret, isAuthRateLimitError, isCaptchaFailedError, socialRegistrationMetadataSchema as registrationMetadataSchema } from '../utils/accountProvisioning.ts'
import { appleHash, appleQuery, appleRandom, openAppleCredential, rememberAppleName, sealAppleCredential } from '../utils/appleAuthStore.ts'
import { isAppleRolloutEnabled, isAppleSignInConfigured, isNativeAppleLoginConfigured, verifyAppleIdentity } from '../utils/appleSignIn.ts'
import { createSocialAuthApp, socialOAuthExchangeSchema as exchangeSchema, socialExpectedUser as expectedUser, socialJsonBody as jsonBody, socialOAuthConfig, socialOAuthStartSchema as startSchema } from '../utils/socialAuthHttp.ts'
import { emptySupabaseWithClientIP } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

const credentialSchema = z.object({
  id_token: z.string().min(1).max(16384),
  nonce: z.string().min(32).max(128),
  first_name: z.string().max(1024).optional(),
  last_name: z.string().max(1024).optional(),
  captcha_token: z.string().min(1).max(4096).optional(),
  reauthenticate: z.boolean().optional(),
  registration_metadata: registrationMetadataSchema.optional(),
})
export const app = createSocialAuthApp('apple', isAppleSignInConfigured)

type AppleCredential = z.infer<typeof credentialSchema>

async function verifyCredential(c: Context, body: AppleCredential, web: boolean, expectedSubject: string | null) {
  if (!web && !body.reauthenticate && !await isNativeAppleLoginConfigured(c))
    throw new AppleAuthError(503, 'apple_login_unavailable')
  if (getCaptchaSecret(c) && !body.captcha_token)
    throw new AppleAuthError(422, 'captcha_failed')
  let identity
  try {
    identity = await verifyAppleIdentity(c, body.id_token, body.nonce, web)
  }
  catch {
    throw new AppleAuthError(400, 'invalid_apple_credential')
  }
  if (expectedSubject && identity.subject !== expectedSubject)
    throw new AppleAuthError(403, 'reauth_user_mismatch')
  const caller = await expectedUser(c, body.reauthenticate)
  if (caller) {
    if (!caller.identities?.some(item => item.provider === 'apple' && item.identity_data?.sub === identity.subject))
      throw new AppleAuthError(403, 'reauth_user_mismatch')
  }
  return { identity, caller }
}

async function complete(c: Context, body: AppleCredential, web = false, expectedId: string | null = null, expectedSubject: string | null = null) {
  const { identity, caller } = await verifyCredential(c, body, web, expectedSubject)
  expectedId = caller?.id ?? expectedId
  await checkSocialEmail(c, identity.email, 'apple')
  // Save before any network exchange/profile write that could fail or be interrupted.
  const name = await rememberAppleName(c, identity.subject, body.first_name, body.last_name)
  await appleQuery(c, `DELETE FROM public.apple_auth_token_uses WHERE token_hash IN
    (SELECT token_hash FROM public.apple_auth_token_uses WHERE expires_at < now() ORDER BY expires_at LIMIT 100)`, [])
  const used = await appleQuery(c, `INSERT INTO public.apple_auth_token_uses (token_hash)
    VALUES ($1) ON CONFLICT DO NOTHING RETURNING token_hash`, [await appleHash(body.id_token)])
  if (!used.length)
    throw new AppleAuthError(400, 'invalid_apple_credential')
  const client = emptySupabaseWithClientIP(c)
  const { data, error } = await client.auth.signInWithIdToken({
    provider: 'apple',
    token: body.id_token,
    nonce: body.nonce,
    options: { captchaToken: body.captcha_token },
  })
  if (error) {
    if (isCaptchaFailedError(error))
      throw new AppleAuthError(422, 'captcha_failed')
    if (isAuthRateLimitError(error))
      throw new AppleAuthError(429, 'too_many_requests')
    throw new AppleAuthError(400, 'invalid_apple_credential')
  }
  const user = data.user
  if (!data.session || !user?.email)
    throw new AppleAuthError(500, 'apple_login_failed')
  try {
    if (expectedId && user.id !== expectedId)
      throw new AppleAuthError(403, 'reauth_user_mismatch')
    if (!user.identities?.some(item => item.provider === 'apple' && item.identity_data?.sub === identity.subject))
      throw new AppleAuthError(400, 'invalid_apple_credential')
    await appleQuery(c, 'UPDATE public.apple_auth_names SET user_id = $2 WHERE subject = $1 AND (user_id IS NULL OR user_id = $2)', [identity.subject, user.id])
    return await finishSocialSignIn(c, client, { ...user, email: user.email }, data.session, name, body.registration_metadata, 'apple')
  }
  catch (error_) {
    // Only revoke the just-created session. Never delete existing/linked auth users.
    await client.auth.signOut({ scope: 'local' }).catch(() => {})
    throw error_
  }
}

app.post('/', async (c) => {
  const parsed = credentialSchema.safeParse(await jsonBody(c))
  if (!parsed.success)
    throw new AppleAuthError(400, 'invalid_request')
  return c.json(await complete(c, parsed.data))
})

function oauthConfig(c: Context) {
  return socialOAuthConfig(c, 'apple')
}

app.post('/start', async (c) => {
  const config = oauthConfig(c)
  const parsed = startSchema.safeParse(await jsonBody(c))
  if (!parsed.success || !config.redirects.includes(parsed.data.redirect_uri))
    throw new AppleAuthError(400, 'invalid_request')
  const body = parsed.data
  const redirect = new URL(body.redirect_uri)
  if (redirect.hash || redirect.username || redirect.password || !['https:', 'capgo:'].includes(redirect.protocol))
    throw new AppleAuthError(400, 'invalid_request')
  const caller = await expectedUser(c, body.reauthenticate)
  const subject = caller?.identities?.find(identity => identity.provider === 'apple')?.identity_data?.sub
  if (caller && (typeof subject !== 'string' || !subject))
    throw new AppleAuthError(403, 'reauth_user_mismatch')
  if (!caller && !await isAppleRolloutEnabled(c, 'WEB_APPLE_LOGIN_ENABLED'))
    throw new AppleAuthError(503, 'apple_login_unavailable')
  const state = appleRandom()
  const nonce = appleRandom()
  // Bounded indexed expiry cleanup; no additional cron or full-table sweep.
  await appleQuery(c, `DELETE FROM public.apple_auth_attempts WHERE state_hash IN
    (SELECT state_hash FROM public.apple_auth_attempts WHERE expires_at < now() ORDER BY expires_at LIMIT 100)`, [])
  await appleQuery(c, `DELETE FROM public.apple_auth_names WHERE subject IN
    (SELECT subject FROM public.apple_auth_names WHERE user_id IS NULL AND created_at < now() - interval '30 days' ORDER BY created_at LIMIT 100)`, [])
  await appleQuery(c, `INSERT INTO public.apple_auth_attempts
    (state_hash, nonce, redirect_uri, code_challenge, client_state, expected_user_id, registration_metadata, expected_subject)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [await appleHash(state), nonce, body.redirect_uri, body.code_challenge, body.client_state, caller?.id ?? null, JSON.stringify(body.registration_metadata ?? {}), subject ?? null])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))
  const url = new URL('https://appleid.apple.com/auth/authorize')
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callback,
    response_type: 'code id_token',
    response_mode: 'form_post',
    scope: 'name email',
    state,
    nonce: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
  }).toString()
  return c.json({ authorization_url: url.toString(), expires_in: 600 })
})

function finishRedirect(c: Context, attempt: AppleAttempt, fields: Record<string, string>) {
  const url = new URL(attempt.redirect_uri)
  url.hash = new URLSearchParams({ ...fields, state: attempt.client_state }).toString()
  return c.redirect(url.toString(), 303)
}

app.post('/callback', async (c) => {
  oauthConfig(c)
  const text = await c.req.text()
  if (text.length > 24000)
    throw new AppleAuthError(400, 'invalid_request')
  const form = new URLSearchParams(text)
  const state = form.get('state') ?? ''
  if (!/^[\w-]{43}$/.test(state))
    throw new AppleAuthError(400, 'invalid_request')
  const [attempt] = await appleQuery<AppleAttempt>(c, `SELECT * FROM public.apple_auth_attempts
    WHERE state_hash = $1 AND expires_at > now() AND callback_claimed = false`, [await appleHash(state)])
  if (!attempt)
    throw new AppleAuthError(400, 'invalid_exchange')
  try {
    const token = form.get('id_token') ?? ''
    const code = form.get('code') ?? ''
    if (form.has('error') || !token || !code || code.length > 4096)
      throw new Error('Authorization failed')
    const identity = await verifyAppleIdentity(c, token, attempt.nonce, true, code)
    let profile: { name?: { firstName?: unknown, lastName?: unknown } } = {}
    try {
      profile = JSON.parse(form.get('user') ?? '{}') ?? {}
    }
    catch {}
    // The user object is optional display data, bound to this verified identity.
    await rememberAppleName(c, identity.subject, profile.name?.firstName, profile.name?.lastName)
    const exchange = appleRandom()
    const committed = await appleQuery(c, `UPDATE public.apple_auth_attempts SET callback_claimed = true, exchange_hash = $2, credential = $3
      WHERE state_hash = $1 AND callback_claimed = false AND expires_at > now() RETURNING state_hash`, [attempt.state_hash, await appleHash(exchange), await sealAppleCredential(c, { id_token: token, authorization_code: code })])
    if (!committed.length)
      throw new Error('Authorization already completed')
    return finishRedirect(c, attempt, { apple_code: exchange })
  }
  catch {
    return finishRedirect(c, attempt, { apple_error: 'apple_authorization_failed' })
  }
})

app.post('/exchange', async (c) => {
  oauthConfig(c)
  const parsed = exchangeSchema.safeParse(await jsonBody(c))
  if (!parsed.success)
    throw new AppleAuthError(400, 'invalid_request')
  const body = parsed.data
  if (getCaptchaSecret(c) && !body.captcha_token)
    throw new AppleAuthError(422, 'captcha_failed')
  // Atomic consumption also checks the verifier: a wrong verifier cannot burn a code.
  const [attempt] = await appleQuery<AppleAttempt>(c, `DELETE FROM public.apple_auth_attempts
    WHERE exchange_hash = $1 AND code_challenge = $2 AND expires_at > now() RETURNING *`, [await appleHash(body.code), await appleHash(body.code_verifier)])
  if (!attempt?.credential)
    throw new AppleAuthError(400, 'invalid_exchange')
  const credential = await openAppleCredential<{ id_token: string, authorization_code: string }>(c, attempt.credential)
  const response = await complete(c, { id_token: credential.id_token, nonce: attempt.nonce, captcha_token: body.captcha_token, registration_metadata: attempt.registration_metadata as z.infer<typeof registrationMetadataSchema> }, true, attempt.expected_user_id, attempt.expected_subject)
  return c.json({ ...response, authorization_code: credential.authorization_code })
})

app.get('/capabilities', async (c) => {
  try {
    const config = oauthConfig(c)
    if (!isAppleSignInConfigured(c) || !await isAppleRolloutEnabled(c, 'WEB_APPLE_LOGIN_ENABLED'))
      return c.json({ web: { enabled: false, redirect_uris: [] } })
    const response = await fetch(`${getEnv(c, 'SUPABASE_URL')}/auth/v1/settings`, {
      headers: { apikey: getEnv(c, 'SUPABASE_ANON_KEY') },
      signal: AbortSignal.timeout(5000),
    })
    const settings = await response.json() as { external?: { apple?: boolean } }
    if (!response.ok || settings.external?.apple !== true)
      return c.json({ web: { enabled: false, redirect_uris: [] } })
    return c.json({ web: { enabled: true, redirect_uris: config.redirects } })
  }
  catch {
    return c.json({ web: { enabled: false, redirect_uris: [] } })
  }
})
