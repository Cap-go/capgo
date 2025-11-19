import type { Context } from 'hono'
import { getRuntimeKey } from 'hono/adapter'
import { cloudlogErr, serializeError } from './logging.ts'

const CACHE_METHOD = 'GET'

type CacheLike = Cache & { default?: Cache }

function resolveGlobalCache(): Cache | null {
  if (typeof caches === 'undefined')
    return null

  const cacheStorage = caches as any as CacheLike
  if (getRuntimeKey() === 'workerd' && cacheStorage.default)
    return cacheStorage.default
  return cacheStorage
}

export type CacheKeyParams = Record<string, string>

export class CacheHelper {
  private cache: Cache | null

  constructor(private context: Context) {
    this.cache = resolveGlobalCache()
  }

  get available() {
    return this.cache !== null
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
    if (!this.cache)
      return null
    try {
      const cachedResponse = await this.cache.match(key)
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
    if (!this.cache)
      return
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': this.buildCacheControl(ttlSeconds),
    })
    const response = new Response(JSON.stringify(payload), { headers })
    try {
      await this.cache.put(key, response.clone())
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
