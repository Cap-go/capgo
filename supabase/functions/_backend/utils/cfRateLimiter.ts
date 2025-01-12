import type { Context, Next } from '@hono/hono'
import { createMiddleware } from 'hono/factory'

const RATE_LIMIT_CONTEXT_KEY = '.rateLimited'
// const STATUS_TOO_MANY_REQUESTS = 429

export interface RateLimitBinding {
  limit: LimitFunc
}

export interface LimitFunc {
  (options: LimitOptions): Promise<RateLimitResult>
}

interface RateLimitResult {
  success: boolean
}

export interface LimitOptions {
  key: string
}

export interface RateLimitResponse {
  key: string
  success: boolean
}

export interface RateLimitOptions {
  continueOnRateLimit: boolean
}

export interface RateLimitKeyFunc {
  (c: Context): string
}

export function rateLimit(rateLimitBinding: RateLimitBinding, keyFunc: RateLimitKeyFunc, rateLimit: string = '', customMessage: string = '') {
  return createMiddleware(async (c: Context, next: Next) => {
    const key = keyFunc(c)
    if (!key) {
      console.warn('the provided keyFunc returned an empty rate limiting key: bypassing rate limits')
    }
    if (key) {
      const { success } = await rateLimitBinding.limit({ key })
      c.set(RATE_LIMIT_CONTEXT_KEY, success)

      if (!success) {
        // throw new HTTPException(STATUS_TOO_MANY_REQUESTS, {
        //   res: c.text("rate limited", { status: STATUS_TOO_MANY_REQUESTS }),
        // });
        if (!customMessage) {
          console.warn(`The rate limit has been reached for key: ${key} and rate limit binding: ${rateLimit}`)
        } else {
          console.warn(`The rate limit has been reached for key: ${key} and rate limit binding: ${rateLimit}. Custom message: ${customMessage}`)
        }
      }
    }

    // Call the next handler/middleware in the stack on success
    await next()
  })
}

export function wasRateLimited(c: Context): boolean {
  return c.get(RATE_LIMIT_CONTEXT_KEY) as boolean
}
