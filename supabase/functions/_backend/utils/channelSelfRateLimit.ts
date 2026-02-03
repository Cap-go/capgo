import type { Context } from 'hono'
import { CacheHelper } from './cache.ts'
import { cloudlog } from './logging.ts'
import { getClientIP } from './rate_limit.ts'
import { getEnv } from './utils.ts'

// Cache path for operation-level rate limiting (1 second between same operations)
const CHANNEL_SELF_OP_RATE_PATH = '/.channel-self-op-rate'
// Cache path for same-channel rate limiting (60 seconds for identical sets)
const CHANNEL_SELF_SAME_SET_PATH = '/.channel-self-same-set'
// Cache path for IP-based rate limiting (per minute)
const CHANNEL_SELF_IP_RATE_PATH = '/.channel-self-ip-rate'

// TTL for operation-level rate limit (1 second)
const OP_RATE_TTL_SECONDS = 1
// TTL for same channel set rate limit (60 seconds)
const SAME_SET_RATE_TTL_SECONDS = 60
// TTL for IP-based rate limit (per minute)
const IP_RATE_TTL_SECONDS = 60

// Default limit - high enough to tolerate NAT/shared IPs while mitigating spoofing abuse
const DEFAULT_IP_RATE_LIMIT = 1000

// Operation types for channel self
export type ChannelSelfOperation = 'set' | 'get' | 'delete' | 'list'

interface RateLimitEntry {
  timestamp: number
}

interface RateLimitCounter {
  count: number
  resetAt?: number
}

export interface ChannelSelfRateLimitStatus {
  limited: boolean
  resetAt?: number
}

export interface ChannelSelfIPRateLimitStatus extends ChannelSelfRateLimitStatus {
  ip?: string
}

function buildOperationRateRequest(c: Context, appId: string, deviceId: string, operation: ChannelSelfOperation) {
  const helper = new CacheHelper(c)
  // Note: We don't check helper.available here because it's set asynchronously.
  // The matchJson/putJson methods internally await cache initialization via ensureCache().
  return {
    helper,
    request: helper.buildRequest(CHANNEL_SELF_OP_RATE_PATH, {
      app_id: appId,
      device_id: deviceId,
      op: operation,
    }),
  }
}

function buildSameSetRequest(c: Context, appId: string, deviceId: string, channel: string) {
  const helper = new CacheHelper(c)
  // Note: We don't check helper.available here because it's set asynchronously.
  // The matchJson/putJson methods internally await cache initialization via ensureCache().
  return {
    helper,
    request: helper.buildRequest(CHANNEL_SELF_SAME_SET_PATH, {
      app_id: appId,
      device_id: deviceId,
      channel,
    }),
  }
}

function buildIpRateRequest(c: Context, appId: string, ip: string) {
  const helper = new CacheHelper(c)
  // Note: We don't check helper.available here because it's set asynchronously.
  // The matchJson/putJson methods internally await cache initialization via ensureCache().
  return {
    helper,
    request: helper.buildRequest(CHANNEL_SELF_IP_RATE_PATH, {
      app_id: appId,
      ip,
    }),
  }
}

function getChannelSelfIpRateLimit(c: Context): number {
  const envLimit = getEnv(c, 'RATE_LIMIT_CHANNEL_SELF_IP')
  if (envLimit) {
    const parsed = Number.parseInt(envLimit, 10)
    if (!Number.isNaN(parsed) && parsed > 0)
      return parsed
  }
  return DEFAULT_IP_RATE_LIMIT
}

/**
 * Check if a device should be rate limited for a channel operation.
 *
 * Rate limiting rules:
 * 1. Same device+app+operation cannot be done more than once per second
 * 2. For 'set' operation: Same device+app+channel combination cannot be set more than once in 60 seconds
 *
 * @returns true if the request should be rate limited, false otherwise
 */
export async function isChannelSelfRateLimited(
  c: Context,
  appId: string,
  deviceId: string,
  operation: ChannelSelfOperation,
  channel?: string,
): Promise<ChannelSelfRateLimitStatus> {
  // Check operation-level rate limit (1 request per second per device+app+operation)
  const opRateEntry = buildOperationRateRequest(c, appId, deviceId, operation)
  const cached = await opRateEntry.helper.matchJson<RateLimitEntry>(opRateEntry.request)
  if (cached) {
    // Device has made the same operation within the last second - rate limit
    return { limited: true, resetAt: cached.timestamp + OP_RATE_TTL_SECONDS * 1000 }
  }

  // For 'set' operation: also check same-set rate limit (same device+app+channel within 60 seconds)
  if (operation === 'set' && channel) {
    const sameSetEntry = buildSameSetRequest(c, appId, deviceId, channel)
    const cachedSet = await sameSetEntry.helper.matchJson<RateLimitEntry>(sameSetEntry.request)
    if (cachedSet) {
      // Same exact set was done within the last 60 seconds - rate limit
      return { limited: true, resetAt: cachedSet.timestamp + SAME_SET_RATE_TTL_SECONDS * 1000 }
    }
  }

  return { limited: false }
}

/**
 * Check if a request should be rate limited by IP address.
 * This is a second-layer limit to mitigate device_id spoofing abuse.
 */
export async function isChannelSelfIPRateLimited(
  c: Context,
  appId: string,
): Promise<ChannelSelfIPRateLimitStatus> {
  const ip = getClientIP(c)
  if (ip === 'unknown') {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'IP rate limit skipped: unknown IP',
      app_id: appId,
    })
    return { limited: false }
  }

  const ipRateEntry = buildIpRateRequest(c, appId, ip)
  const cached = await ipRateEntry.helper.matchJson<RateLimitCounter>(ipRateEntry.request)
  if (!cached) {
    return { limited: false, ip }
  }

  const limit = getChannelSelfIpRateLimit(c)
  const limited = cached.count >= limit
  return { limited, resetAt: cached.resetAt, ip }
}

/**
 * Check IP-based rate limiting and log when limited.
 */
export async function checkChannelSelfIPRateLimit(
  c: Context,
  appId: string,
  logMessage: string,
): Promise<ChannelSelfIPRateLimitStatus> {
  const status = await isChannelSelfIPRateLimited(c, appId)
  if (status.limited) {
    cloudlog({
      requestId: c.get('requestId'),
      message: logMessage,
      app_id: appId,
      ip: status.ip,
    })
  }
  return status
}

/**
 * Record a channel operation for rate limiting purposes.
 * This is called after processing a request to prevent abuse.
 *
 * Note: This records ALL requests (not just successful ones) to prevent
 * abuse through repeated invalid requests. This is intentional for spam protection.
 */
export async function recordChannelSelfRequest(
  c: Context,
  appId: string,
  deviceId: string,
  operation: ChannelSelfOperation,
  channel?: string,
): Promise<void> {
  const timestamp = Date.now()
  const entry: RateLimitEntry = { timestamp }

  // Record operation-level rate limit (1 second TTL)
  const opRateEntry = buildOperationRateRequest(c, appId, deviceId, operation)
  await opRateEntry.helper.putJson(opRateEntry.request, entry, OP_RATE_TTL_SECONDS)

  // For 'set' operation: also record same-set rate limit (60 seconds TTL)
  if (operation === 'set' && channel) {
    const sameSetEntry = buildSameSetRequest(c, appId, deviceId, channel)
    await sameSetEntry.helper.putJson(sameSetEntry.request, entry, SAME_SET_RATE_TTL_SECONDS)
  }
}

/**
 * Record an IP-based request for rate limiting purposes.
 */
export async function recordChannelSelfIPRequest(
  c: Context,
  appId: string,
): Promise<void> {
  const ip = getClientIP(c)
  if (ip === 'unknown')
    return

  const ipRateEntry = buildIpRateRequest(c, appId, ip)
  const existing = await ipRateEntry.helper.matchJson<RateLimitCounter>(ipRateEntry.request)
  const now = Date.now()
  const inWindow = typeof existing?.resetAt === 'number' && existing.resetAt > now
  const resetAt = inWindow ? (existing.resetAt as number) : now + IP_RATE_TTL_SECONDS * 1000
  const newData: RateLimitCounter = {
    count: inWindow ? (existing?.count ?? 0) + 1 : 1,
    resetAt,
  }
  const ttlSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000))

  await ipRateEntry.helper.putJson(ipRateEntry.request, newData, ttlSeconds)
}
