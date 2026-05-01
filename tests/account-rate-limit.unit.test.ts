import type { Context } from 'hono'
import { Hono } from 'hono/tiny'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearFailedAccountAuth,
  isAccountRateLimited,
  normalizeRateLimitAccountIdentifier,
  recordFailedAccountAuth,
} from '../supabase/functions/_backend/utils/rate_limit.ts'

type CacheStore = Map<string, Response>

let previousCaches: typeof globalThis.caches | undefined

function installMemoryCache() {
  const store: CacheStore = new Map()
  const cache = {
    match: async (request: Request) => store.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => {
      store.set(request.url, response.clone())
    },
  }

  previousCaches = globalThis.caches
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      open: async () => cache,
    },
  })

  return store
}

async function withContext<T>(handler: (c: Context) => Promise<T>, ip: string) {
  const app = new Hono()
  app.get('/', async (c) => {
    c.set('requestId', 'account-rate-limit-test')
    const result = await handler(c)
    return c.json(result ?? { ok: true })
  })

  const response = await app.request('http://rate-limit.test/', {
    headers: {
      'cf-connecting-ip': ip,
    },
  })

  return await response.json<T>()
}

describe('account failed-auth rate limiting', () => {
  beforeEach(() => {
    installMemoryCache()
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: previousCaches,
    })
  })

  it('normalizes account identifiers before hashing', () => {
    expect(normalizeRateLimitAccountIdentifier('  Victim@Example.COM  ')).toBe('victim@example.com')
  })

  it('limits by account across different client IPs', async () => {
    for (let attempt = 0; attempt < 19; attempt++) {
      await withContext(c => recordFailedAccountAuth(c, 'Victim@Example.COM'), `198.51.100.${attempt + 1}`)
    }

    const beforeLimit = await withContext(
      c => isAccountRateLimited(c, 'victim@example.com'),
      '203.0.113.2',
    )
    expect(beforeLimit.limited).toBe(false)

    await withContext(c => recordFailedAccountAuth(c, 'victim@example.com'), '203.0.113.3')

    const afterSecondAttempt = await withContext(
      c => isAccountRateLimited(c, 'VICTIM@example.com'),
      '203.0.113.4',
    )
    expect(afterSecondAttempt.limited).toBe(true)
  })

  it('clears the account limiter after successful verification', async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      await withContext(c => recordFailedAccountAuth(c, 'clear-me@example.com'), `198.51.100.${attempt + 1}`)
    }

    const beforeClear = await withContext(
      c => isAccountRateLimited(c, 'clear-me@example.com'),
      '198.51.100.3',
    )
    expect(beforeClear.limited).toBe(true)

    await withContext(c => clearFailedAccountAuth(c, 'clear-me@example.com'), '198.51.100.4')

    const afterClear = await withContext(
      c => isAccountRateLimited(c, 'clear-me@example.com'),
      '198.51.100.5',
    )
    expect(afterClear.limited).toBe(false)
  })
})
