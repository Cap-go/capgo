import type { Context } from 'hono'
import { CacheHelper } from './cache.ts'

// Cache path for operation-level rate limiting (1 second between same operations)
const CHANNEL_SELF_OP_RATE_PATH = '/.channel-self-op-rate'
// Cache path for same-channel rate limiting (60 seconds for identical sets)
const CHANNEL_SELF_SAME_SET_PATH = '/.channel-self-same-set'

// TTL for operation-level rate limit (1 second)
const OP_RATE_TTL_SECONDS = 1
// TTL for same channel set rate limit (60 seconds)
const SAME_SET_RATE_TTL_SECONDS = 60

// Operation types for channel self
export type ChannelSelfOperation = 'set' | 'get' | 'delete' | 'list'

interface RateLimitEntry {
  timestamp: number
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
): Promise<boolean> {
  // Check operation-level rate limit (1 request per second per device+app+operation)
  const opRateEntry = buildOperationRateRequest(c, appId, deviceId, operation)
  const cached = await opRateEntry.helper.matchJson<RateLimitEntry>(opRateEntry.request)
  if (cached) {
    // Device has made the same operation within the last second - rate limit
    return true
  }

  // For 'set' operation: also check same-set rate limit (same device+app+channel within 60 seconds)
  if (operation === 'set' && channel) {
    const sameSetEntry = buildSameSetRequest(c, appId, deviceId, channel)
    const cachedSet = await sameSetEntry.helper.matchJson<RateLimitEntry>(sameSetEntry.request)
    if (cachedSet) {
      // Same exact set was done within the last 60 seconds - rate limit
      return true
    }
  }

  return false
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
