import type { Context } from 'hono'
import { CacheHelper } from './cache.ts'
import { cloudlog } from './logging.ts'
import { getEnv } from './utils.ts'

// Cache TTL constants (in seconds)
const FAILED_AUTH_TTL = 60 * 15 // 15 minutes block for failed auth attempts
const API_KEY_RATE_LIMIT_TTL = 60 // 1 minute window for API key rate limiting

// Default limits - set high to catch only severe abuse, not normal usage
const DEFAULT_FAILED_AUTH_LIMIT = 20 // 20 failed attempts before blocking (catches brute force, allows mistakes)
const DEFAULT_API_KEY_RATE_LIMIT = 2000 // 2000 requests per minute per API key (catches infinite loops)

interface RateLimitData {
  count: number
}

/**
 * Get the client IP address from the request.
 * Cloudflare Workers provide the client IP in cf-connecting-ip header.
 * Returns 'unknown' if no IP headers are found - callers should handle this case.
 */
export function getClientIP(c: Context): string {
  // Cloudflare Workers provide the real client IP
  const cfConnectingIp = c.req.header('cf-connecting-ip')
  if (cfConnectingIp)
    return cfConnectingIp

  // Fallback to x-forwarded-for (less reliable but common)
  const forwardedFor = c.req.header('x-forwarded-for')
  if (forwardedFor) {
    // Take the first IP in the chain (original client)
    return forwardedFor.split(',')[0].trim()
  }

  // Fallback to x-real-ip
  const realIp = c.req.header('x-real-ip')
  if (realIp)
    return realIp

  // If no IP headers found, return unknown
  // Note: In production behind Cloudflare, cf-connecting-ip should always be present
  return 'unknown'
}

/**
 * Check if an IP is rate limited due to failed authentication attempts.
 * Returns true if the IP should be blocked.
 * Note: If cache is unavailable, rate limiting fails open (returns false) to avoid blocking legitimate traffic.
 */
export async function isIPRateLimited(c: Context): Promise<boolean> {
  const ip = getClientIP(c)
  if (ip === 'unknown') {
    // Log warning but don't block - in production behind Cloudflare this shouldn't happen
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Rate limit check skipped: unknown IP (missing cf-connecting-ip header)',
    })
    return false
  }

  const cacheHelper = new CacheHelper(c)
  const cacheKey = cacheHelper.buildRequest('/rate-limit/failed-auth', { ip })
  const data = await cacheHelper.matchJson<RateLimitData>(cacheKey)

  // If no data or cache unavailable, fail open (don't block)
  if (!data)
    return false

  const limit = getFailedAuthLimit(c)
  const isLimited = data.count >= limit

  if (isLimited) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'IP rate limited due to failed auth attempts',
      ip,
      count: data.count,
      limit,
    })
  }

  return isLimited
}

/**
 * Record a failed authentication attempt for an IP.
 * After reaching the configured limit (default 20), the IP will be rate limited.
 * This should be awaited to ensure accurate counting before returning error responses.
 */
export async function recordFailedAuth(c: Context): Promise<void> {
  const ip = getClientIP(c)
  if (ip === 'unknown') {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Failed auth not recorded: unknown IP',
    })
    return
  }

  const cacheHelper = new CacheHelper(c)
  const cacheKey = cacheHelper.buildRequest('/rate-limit/failed-auth', { ip })
  const existingData = await cacheHelper.matchJson<RateLimitData>(cacheKey)

  const newData: RateLimitData = {
    count: (existingData?.count ?? 0) + 1,
  }

  await cacheHelper.putJson(cacheKey, newData, FAILED_AUTH_TTL)

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Recorded failed auth attempt',
    ip,
    count: newData.count,
  })
}

/**
 * Clear failed auth attempts for an IP after successful authentication.
 * Uses a 60 second TTL to ensure cache consistency across Cloudflare edge nodes.
 */
export async function clearFailedAuth(c: Context): Promise<void> {
  const ip = getClientIP(c)
  if (ip === 'unknown')
    return

  const cacheHelper = new CacheHelper(c)
  const cacheKey = cacheHelper.buildRequest('/rate-limit/failed-auth', { ip })

  // Set count to 0 to effectively clear the rate limit
  // Use 60s TTL for cache consistency across Cloudflare edge nodes
  await cacheHelper.putJson(cacheKey, { count: 0 }, 60)
}

/**
 * Check if an API key is rate limited.
 * Returns true if the API key has exceeded its configured rate limit.
 * Note: If cache is unavailable, rate limiting fails open (returns false).
 */
export async function isAPIKeyRateLimited(c: Context, apiKeyId: number): Promise<boolean> {
  const cacheHelper = new CacheHelper(c)
  const cacheKey = cacheHelper.buildRequest('/rate-limit/apikey', { id: String(apiKeyId) })
  const data = await cacheHelper.matchJson<RateLimitData>(cacheKey)

  // If no data or cache unavailable, fail open (don't block)
  if (!data)
    return false

  const limit = getAPIKeyRateLimit(c)
  const isLimited = data.count >= limit

  if (isLimited) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'API key rate limited',
      apiKeyId,
      count: data.count,
      limit,
    })
  }

  return isLimited
}

/**
 * Record an API call for rate limiting purposes.
 * Tracks the number of calls per API key within the configured time window.
 * This should be awaited to ensure accurate counting before checking limits.
 */
export async function recordAPIKeyUsage(c: Context, apiKeyId: number): Promise<void> {
  const cacheHelper = new CacheHelper(c)
  const cacheKey = cacheHelper.buildRequest('/rate-limit/apikey', { id: String(apiKeyId) })
  const existingData = await cacheHelper.matchJson<RateLimitData>(cacheKey)

  const newData: RateLimitData = {
    count: (existingData?.count ?? 0) + 1,
  }

  await cacheHelper.putJson(cacheKey, newData, API_KEY_RATE_LIMIT_TTL)
}

/**
 * Get the failed auth limit from environment or use default (20).
 */
function getFailedAuthLimit(c: Context): number {
  const envLimit = getEnv(c, 'RATE_LIMIT_FAILED_AUTH')
  if (envLimit) {
    const parsed = Number.parseInt(envLimit, 10)
    if (!Number.isNaN(parsed) && parsed > 0)
      return parsed
  }
  return DEFAULT_FAILED_AUTH_LIMIT
}

/**
 * Get the API key rate limit from environment or use default (2000/minute).
 */
function getAPIKeyRateLimit(c: Context): number {
  const envLimit = getEnv(c, 'RATE_LIMIT_API_KEY')
  if (envLimit) {
    const parsed = Number.parseInt(envLimit, 10)
    if (!Number.isNaN(parsed) && parsed > 0)
      return parsed
  }
  return DEFAULT_API_KEY_RATE_LIMIT
}
