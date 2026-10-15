import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from './hono.ts'
import { Hono } from 'hono/tiny'
import { SocialAuthError } from './accountProvisioning.ts'
import { CacheHelper } from './cache.ts'
import { simpleErrorWithStatus, useCors } from './hono.ts'
import { getClientIP } from './rate_limit.ts'
import { emptySupabaseWithClientIP } from './supabase.ts'

export function createSocialAuthApp(provider: 'apple' | 'google', configured: (c: Context) => boolean) {
  const app = new Hono<MiddlewareKeyVariables>()
  const failure = (c: Context, error: unknown) => {
    const typed = error instanceof SocialAuthError ? error : new SocialAuthError(500, `${provider}_login_failed`)
    return simpleErrorWithStatus(c, typed.status, typed.code, 'Authentication could not complete')
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
