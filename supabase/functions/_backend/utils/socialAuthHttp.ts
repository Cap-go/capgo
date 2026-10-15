import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from './hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod'
import { SocialAuthError, socialRegistrationMetadataSchema } from './accountProvisioning.ts'
import { CacheHelper } from './cache.ts'
import { simpleErrorWithStatus, useCors } from './hono.ts'
import { getClientIP } from './rate_limit.ts'
import { emptySupabaseWithClientIP } from './supabase.ts'
import { getEnv } from './utils.ts'

export function createSocialAuthApp(provider: 'apple' | 'google', configured: (c: Context) => boolean) {
  const app = new Hono<MiddlewareKeyVariables>()
  const failure = (c: Context, error: unknown) => {
    const typed = error instanceof SocialAuthError ? error : new SocialAuthError(500, `${provider}_login_failed`)
    const label = provider === 'apple' ? 'Apple' : 'Google'
    return simpleErrorWithStatus(c, typed.status, typed.code, `${label} authentication could not complete`)
  }
  app.onError((error, c) => failure(c, error))
  app.use('*', useCors)
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    try {
      if (c.req.path.endsWith('/capabilities')) {
        await next()
        return
      }
      if (!configured(c))
        throw new SocialAuthError(503, `${provider}_login_unavailable`)
      const cache = new CacheHelper(c)
      const key = cache.buildRequest(`/.${provider}-auth-rate`, { ip: getClientIP(c) })
      const count = (await cache.matchJson<{ count: number }>(key))?.count ?? 0
      if (count >= 30)
        throw new SocialAuthError(429, 'too_many_requests')
      await cache.putJson(key, { count: count + 1 }, 60)
      await next()
    }
    catch (error) {
      // Never forward credentials, provider errors or bodies to error reporters.
      return failure(c, error)
    }
  })
  return app
}

export async function socialJsonBody(c: Context) {
  if (Number(c.req.header('content-length')) > 24000)
    throw new SocialAuthError(400, 'invalid_request')
  try {
    // Consume the original body before an error reporter can inspect credentials.
    const text = await c.req.text()
    if (text.length > 24000)
      throw new Error('Too large')
    return JSON.parse(text)
  }
  catch { throw new SocialAuthError(400, 'invalid_request') }
}

export async function socialExpectedUser(c: Context, reauthenticate?: boolean) {
  if (!reauthenticate)
    return null
  const token = c.req.header('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!token)
    throw new SocialAuthError(401, 'not_authenticated')
  // Full identities are required to bind reauthentication to an existing provider.
  const { data, error } = await emptySupabaseWithClientIP(c).auth.getUser(token)
  if (error || !data.user)
    throw new SocialAuthError(401, 'not_authenticated')
  return data.user
}

export const socialOAuthStartSchema = z.object({
  redirect_uri: z.string().max(2048),
  code_challenge: z.string().regex(/^[\w-]{43}$/),
  client_state: z.string().regex(/^[\w-]{32,128}$/),
  reauthenticate: z.boolean().optional(),
  registration_metadata: socialRegistrationMetadataSchema.optional(),
})
export const socialOAuthExchangeSchema = z.object({
  code: z.string().regex(/^[\w-]{43}$/),
  code_verifier: z.string().regex(/^[\w-]{43,128}$/),
  captcha_token: z.string().min(1).max(4096).optional(),
})

export function socialOAuthConfig(c: Context, provider: 'apple' | 'google') {
  const prefix = `${provider.toUpperCase()}_SIGN_IN_`
  const clientId = getEnv(c, `${prefix}WEB_CLIENT_ID`).trim()
  const callback = getEnv(c, `${prefix}OAUTH_CALLBACK_URL`).trim()
  let redirects: string[] = []
  try {
    const values = JSON.parse(getEnv(c, `${prefix}REDIRECT_URLS`))
    if (Array.isArray(values) && values.every(value => typeof value === 'string'))
      redirects = values
  }
  catch {}
  if (!clientId || !callback.startsWith('https://') || !redirects.length)
    throw new SocialAuthError(503, `${provider}_login_unavailable`)
  return { clientId, callback, redirects }
}
