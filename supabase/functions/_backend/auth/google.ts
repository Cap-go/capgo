import type { Context } from 'hono'
import type { GoogleAttempt } from '../utils/googleAuthStore.ts'
import { z } from 'zod'
import { checkSocialEmail, getCaptchaSecret, SocialAuthError as GoogleAuthError, isAuthRateLimitError, isCaptchaFailedError, socialRegistrationMetadataSchema as registrationMetadataSchema, saveSocialProfile } from '../utils/accountProvisioning.ts'
import { googleHash, googleQuery, googleRandom, openGoogleCredential, sealGoogleCredential } from '../utils/googleAuthStore.ts'
import { googleClientIds, isGoogleRolloutEnabled, isGoogleSignInConfigured, isNativeGoogleLoginConfigured, verifyGoogleIdentity } from '../utils/googleSignIn.ts'
import { getSocialAuthSetting } from '../utils/socialAuthConfig.ts'
import { createSocialAuthApp, socialExpectedUser as expectedUser, socialJsonBody as jsonBody } from '../utils/socialAuthHttp.ts'
import { emptySupabaseWithClientIP } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

const credentialSchema = z.object({
  id_token: z.string().min(1).max(16384),
  nonce: z.string().min(32).max(128),
  access_token: z.string().min(1).max(8192).optional(),
  captcha_token: z.string().min(1).max(4096).optional(),
  reauthenticate: z.boolean().optional(),
  registration_metadata: registrationMetadataSchema.optional(),
})
const startSchema = z.object({
  redirect_uri: z.string().max(2048),
  code_challenge: z.string().regex(/^[\w-]{43}$/),
  client_state: z.string().regex(/^[\w-]{32,128}$/),
  reauthenticate: z.boolean().optional(),
  registration_metadata: registrationMetadataSchema.optional(),
})
const exchangeSchema = z.object({
  code: z.string().regex(/^[\w-]{43}$/),
  code_verifier: z.string().regex(/^[\w-]{43,128}$/),
  captcha_token: z.string().min(1).max(4096).optional(),
})

export const app = createSocialAuthApp('google', isGoogleSignInConfigured)

type GoogleCredential = z.infer<typeof credentialSchema>

async function verifyCredential(c: Context, body: GoogleCredential, web: boolean, expectedSubject: string | null) {
  if (!web && !body.reauthenticate && !await isNativeGoogleLoginConfigured(c))
    throw new GoogleAuthError(503, 'google_login_unavailable')
  if (getCaptchaSecret(c) && !body.captcha_token)
    throw new GoogleAuthError(422, 'captcha_failed')
  let identity
  try {
    identity = await verifyGoogleIdentity(c, body.id_token, body.nonce, body.access_token, web)
  }
  catch {
    throw new GoogleAuthError(400, 'invalid_google_credential')
  }
  if (expectedSubject && identity.subject !== expectedSubject)
    throw new GoogleAuthError(403, 'reauth_user_mismatch')
  const caller = await expectedUser(c, body.reauthenticate)
  if (caller) {
    if (!caller.identities?.some(item => item.provider === 'google' && item.identity_data?.sub === identity.subject))
      throw new GoogleAuthError(403, 'reauth_user_mismatch')
  }
  return { identity, caller }
}

async function complete(c: Context, body: GoogleCredential, web = false, expectedId: string | null = null, expectedSubject: string | null = null) {
  const { identity, caller } = await verifyCredential(c, body, web, expectedSubject)
  expectedId = caller?.id ?? expectedId
  await checkSocialEmail(c, identity.email, 'google')
  const name = identity
  await googleQuery(c, `DELETE FROM public.google_auth_token_uses WHERE token_hash IN
    (SELECT token_hash FROM public.google_auth_token_uses WHERE expires_at < now() ORDER BY expires_at LIMIT 100)`, [])
  const used = await googleQuery(c, `INSERT INTO public.google_auth_token_uses (token_hash)
    VALUES ($1) ON CONFLICT DO NOTHING RETURNING token_hash`, [await googleHash(body.id_token)])
  if (!used.length)
    throw new GoogleAuthError(400, 'invalid_google_credential')
  const client = emptySupabaseWithClientIP(c)
  const { data, error } = await client.auth.signInWithIdToken({
    provider: 'google',
    token: body.id_token,
    nonce: body.nonce,
    access_token: body.access_token,
    options: { captchaToken: body.captcha_token },
  })
  if (error) {
    if (isCaptchaFailedError(error))
      throw new GoogleAuthError(422, 'captcha_failed')
    if (isAuthRateLimitError(error))
      throw new GoogleAuthError(429, 'too_many_requests')
    throw new GoogleAuthError(400, 'invalid_google_credential')
  }
  const user = data.user
  if (!data.session || !user?.email)
    throw new GoogleAuthError(500, 'google_login_failed')
  try {
    if (expectedId && user.id !== expectedId)
      throw new GoogleAuthError(403, 'reauth_user_mismatch')
    if (!user.identities?.some(item => item.provider === 'google' && item.identity_data?.sub === identity.subject))
      throw new GoogleAuthError(400, 'invalid_google_credential')
    // Linked accounts can have a different primary email; enforce both identities.
    await checkSocialEmail(c, user.email, 'google')
    const disabled = await client.rpc('is_account_disabled', { user_id: user.id })
    if (disabled.error)
      throw new GoogleAuthError(500, 'google_login_failed')
    if (disabled.data) {
      // Scheduled deletion remains restorable: issue the normal session but skip
      // provisioning and let the existing auth guard send it to accountDisabled.
      return {
        user,
        is_new_user: false,
        name_status: 'unavailable',
        account_status: 'disabled',
        session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
      }
    }
    const profile = await saveSocialProfile(c, client, { ...user, email: user.email }, name, body.registration_metadata, 'google')
    return {
      user,
      account_status: 'active',
      ...profile,
      session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
    }
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
    throw new GoogleAuthError(400, 'invalid_request')
  return c.json(await complete(c, parsed.data))
})

function oauthConfig(c: Context) {
  const clientId = getEnv(c, 'GOOGLE_SIGN_IN_WEB_CLIENT_ID').trim()
  const callback = getEnv(c, 'GOOGLE_SIGN_IN_OAUTH_CALLBACK_URL').trim()
  let redirects: string[] = []
  try {
    const values = JSON.parse(getEnv(c, 'GOOGLE_SIGN_IN_REDIRECT_URLS'))
    if (Array.isArray(values) && values.every(value => typeof value === 'string'))
      redirects = values
  }
  catch {}
  if (!clientId || !callback.startsWith('https://') || !redirects.length)
    throw new GoogleAuthError(503, 'google_login_unavailable')
  const secret = getEnv(c, 'GOOGLE_SIGN_IN_WEB_CLIENT_SECRET').trim()
  if (!secret)
    throw new GoogleAuthError(503, 'google_login_unavailable')
  return { clientId, callback, redirects, secret }
}

app.post('/start', async (c) => {
  const config = oauthConfig(c)
  const parsed = startSchema.safeParse(await jsonBody(c))
  if (!parsed.success || !config.redirects.includes(parsed.data.redirect_uri))
    throw new GoogleAuthError(400, 'invalid_request')
  const body = parsed.data
  const redirect = new URL(body.redirect_uri)
  if (redirect.hash || redirect.username || redirect.password || !['https:', 'capgo:'].includes(redirect.protocol))
    throw new GoogleAuthError(400, 'invalid_request')
  const caller = await expectedUser(c, body.reauthenticate)
  const subject = caller?.identities?.find(identity => identity.provider === 'google')?.identity_data?.sub
  if (caller && (typeof subject !== 'string' || !subject))
    throw new GoogleAuthError(403, 'reauth_user_mismatch')
  if (!caller && !await isGoogleRolloutEnabled(c, 'WEB_GOOGLE_LOGIN_ENABLED'))
    throw new GoogleAuthError(503, 'google_login_unavailable')
  const state = googleRandom()
  const nonce = googleRandom()
  const providerVerifier = googleRandom()
  // Bounded indexed expiry cleanup; no additional cron or full-table sweep.
  await googleQuery(c, `DELETE FROM public.google_auth_attempts WHERE state_hash IN
    (SELECT state_hash FROM public.google_auth_attempts WHERE expires_at < now() ORDER BY expires_at LIMIT 100)`, [])
  await googleQuery(c, `INSERT INTO public.google_auth_attempts
    (state_hash, nonce, redirect_uri, code_challenge, client_state, expected_user_id, registration_metadata, expected_subject, provider_verifier)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [await googleHash(state), nonce, body.redirect_uri, body.code_challenge, body.client_state, caller?.id ?? null, JSON.stringify(body.registration_metadata ?? {}), subject ?? null, providerVerifier])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callback,
    response_type: 'code',
    response_mode: 'form_post',
    scope: 'openid email profile',
    prompt: 'select_account',
    code_challenge: await googleHash(providerVerifier),
    code_challenge_method: 'S256',
    state,
    nonce: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
  }).toString()
  return c.json({ authorization_url: url.toString(), expires_in: 600 })
})

function finishRedirect(c: Context, attempt: GoogleAttempt, fields: Record<string, string>) {
  const url = new URL(attempt.redirect_uri)
  url.hash = new URLSearchParams({ ...fields, state: attempt.client_state }).toString()
  return c.redirect(url.toString(), 303)
}

app.post('/callback', async (c) => {
  const config = oauthConfig(c)
  const text = await c.req.text()
  if (text.length > 24000)
    throw new GoogleAuthError(400, 'invalid_request')
  const form = new URLSearchParams(text)
  const state = form.get('state') ?? ''
  if (!/^[\w-]{43}$/.test(state))
    throw new GoogleAuthError(400, 'invalid_request')
  const [attempt] = await googleQuery<GoogleAttempt>(c, `UPDATE public.google_auth_attempts SET callback_claimed = true
    WHERE state_hash = $1 AND callback_claimed = false AND expires_at > now() RETURNING *`, [await googleHash(state)])
  if (!attempt)
    throw new GoogleAuthError(400, 'invalid_exchange')
  try {
    const code = form.get('code') ?? ''
    if (form.has('error') || !code || code.length > 4096)
      throw new Error('Authorization failed')
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.secret, redirect_uri: config.callback, grant_type: 'authorization_code', code_verifier: attempt.provider_verifier }),
      signal: AbortSignal.timeout(5000),
    })
    const credential = await response.json() as { id_token?: string, access_token?: string }
    if (!response.ok || !credential.id_token || !credential.access_token)
      throw new Error('Exchange failed')
    await verifyGoogleIdentity(c, credential.id_token, attempt.nonce, credential.access_token, true)
    const exchange = googleRandom()
    const saved = await googleQuery(c, `UPDATE public.google_auth_attempts SET exchange_hash = $2, credential = $3
      WHERE state_hash = $1 AND callback_claimed = true AND expires_at > now() RETURNING state_hash`, [attempt.state_hash, await googleHash(exchange), await sealGoogleCredential(c, credential)])
    if (!saved.length)
      throw new Error('Exchange expired')
    return finishRedirect(c, attempt, { google_code: exchange })
  }
  catch { return finishRedirect(c, attempt, { google_error: 'google_authorization_failed' }) }
})

app.post('/exchange', async (c) => {
  oauthConfig(c)
  const parsed = exchangeSchema.safeParse(await jsonBody(c))
  if (!parsed.success)
    throw new GoogleAuthError(400, 'invalid_request')
  const body = parsed.data
  if (getCaptchaSecret(c) && !body.captcha_token)
    throw new GoogleAuthError(422, 'captcha_failed')
  // Atomic consumption also checks the verifier: a wrong verifier cannot burn a code.
  const [attempt] = await googleQuery<GoogleAttempt>(c, `DELETE FROM public.google_auth_attempts
    WHERE exchange_hash = $1 AND code_challenge = $2 AND expires_at > now() RETURNING *`, [await googleHash(body.code), await googleHash(body.code_verifier)])
  if (!attempt?.credential)
    throw new GoogleAuthError(400, 'invalid_exchange')
  const credential = await openGoogleCredential<{ id_token: string, access_token: string }>(c, attempt.credential)
  const response = await complete(c, { id_token: credential.id_token, access_token: credential.access_token, nonce: attempt.nonce, captcha_token: body.captcha_token, registration_metadata: attempt.registration_metadata as z.infer<typeof registrationMetadataSchema> }, true, attempt.expected_user_id, attempt.expected_subject)
  return c.json(response)
})

app.get('/capabilities', async (c) => {
  const disabled = { native: { enabled: false }, web: { enabled: false, redirect_uris: [] as string[] } }
  try {
    const ids = googleClientIds(c)
    const response = await fetch(`${getEnv(c, 'SUPABASE_URL')}/auth/v1/settings`, { headers: { apikey: getEnv(c, 'SUPABASE_ANON_KEY') }, signal: AbortSignal.timeout(5000) })
    const settings = await response.json() as { external?: { google?: boolean } }
    if (!response.ok || settings.external?.google !== true || !ids.web)
      return c.json(disabled)
    const [nativeEnabled, webEnabled, minVersion] = await Promise.all([
      isGoogleRolloutEnabled(c, 'NATIVE_GOOGLE_LOGIN_ENABLED'),
      isGoogleRolloutEnabled(c, 'WEB_GOOGLE_LOGIN_ENABLED'),
      getSocialAuthSetting(c, 'NATIVE_GOOGLE_IOS_MIN_VERSION'),
    ])
    let redirects: string[] = []
    try {
      redirects = webEnabled ? oauthConfig(c).redirects : []
    }
    catch {}
    return c.json({
      native: { enabled: nativeEnabled && !!ids.ios && /^\d+\.\d+\.\d+$/.test(minVersion), ios_client_id: ids.ios || undefined, web_client_id: ids.web, ios_min_version: minVersion || undefined },
      web: { enabled: redirects.length > 0, redirect_uris: redirects },
    })
  }
  catch { return c.json(disabled) }
})
