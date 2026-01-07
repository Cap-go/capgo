import type { Context } from 'hono'
import { getRuntimeKey } from 'hono/adapter'
import { cloudlogErr, serializeError } from './logging.ts'

const CACHE_METHOD = 'GET'
const CACHE_NAME = 'capgo-cache'

type CacheLike = CacheStorage & { default?: Cache }

async function resolveGlobalCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined')
    return null

  const cacheStorage = caches as unknown as CacheLike

  // Cloudflare Workers (workerd) has caches.default which is already a Cache
  if (getRuntimeKey() === 'workerd' && cacheStorage.default)
    return cacheStorage.default

  // For other environments (Deno, etc.), we need to open a named cache
  // Check if caches.open is available (standard CacheStorage API)
  if (typeof cacheStorage.open === 'function') {
    try {
      return await cacheStorage.open(CACHE_NAME)
    }
    catch {
      // Cache API not fully supported in this environment
      return null
    }
  }

  return null
}

export type CacheKeyParams = Record<string, string>

export class CacheHelper {
  private cache: Cache | null = null
  private cacheInitialized = false

  constructor(private context: Context) { }

  private async ensureCache(): Promise<Cache | null> {
    if (!this.cacheInitialized) {
      this.cache = await resolveGlobalCache()
      this.cacheInitialized = true
    }
    return this.cache
  }

  get available() {
    // For sync check, assume available if caches exists
    return typeof caches !== 'undefined'
  }

  buildRequest(path: string, params: CacheKeyParams = {}) {
    const url = new URL(this.context.req.url)
    url.pathname = path
    url.search = ''
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
    return new Request(url.toString(), { method: CACHE_METHOD })
  }

  async matchJson<T>(key: Request): Promise<T | null> {
    const cache = await this.ensureCache()
    if (!cache)
      return null
    try {
      const cachedResponse = await cache.match(key)
      if (!cachedResponse)
        return null
      return await cachedResponse.json<T>()
    }
    catch (error) {
      this.logCacheError('Error reading cached response', error)
      return null
    }
  }

  async putJson(key: Request, payload: unknown, ttlSeconds: number) {
    const cache = await this.ensureCache()
    if (!cache)
      return
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': this.buildCacheControl(ttlSeconds),
    })
    const response = new Response(JSON.stringify(payload), { headers })
    try {
      await cache.put(key, response.clone())
    }
    catch (error) {
      this.logCacheError('Error writing cached response', error)
    }
  }

  private buildCacheControl(ttlSeconds: number) {
    const sanitized = Math.max(0, Math.floor(ttlSeconds))
    return `public, s-maxage=${sanitized}`
  }

  private logCacheError(message: string, error: unknown) {
    cloudlogErr({ requestId: this.context.get('requestId'), message, error: serializeError(error) })
  }
}
