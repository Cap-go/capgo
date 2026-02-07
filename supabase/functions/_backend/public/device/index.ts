import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import type { DeviceLink } from './delete.ts'
import { checkChannelSelfIPRateLimit, isChannelSelfRateLimited, recordChannelSelfIPRequest, recordChannelSelfRequest } from '../../utils/channelSelfRateLimit.ts'
import { getBodyOrQuery, honoFactory, parseBody, simpleRateLimit } from '../../utils/hono.ts'
import { middlewareKey } from '../../utils/hono_middleware.ts'
import { cloudlog } from '../../utils/logging.ts'
import { backgroundTask } from '../../utils/utils.ts'
import { deleteOverride } from './delete.ts'
import { get } from './get.ts'
import { post } from './post.ts'

function buildRateLimitInfo(resetAt?: number) {
  if (typeof resetAt !== 'number' || !Number.isFinite(resetAt)) {
    return {}
  }
  const retryAfterSeconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000))
  return {
    rateLimitResetAt: resetAt,
    retryAfterSeconds,
  }
}

async function assertDeviceIPRateLimit(c: Context, appId: string) {
  const ipRateLimitStatus = await checkChannelSelfIPRateLimit(c, appId, 'Device API IP rate limited')
  if (ipRateLimitStatus.limited) {
    return simpleRateLimit({ reason: 'ip_rate_limit_exceeded', app_id: appId, ...buildRateLimitInfo(ipRateLimitStatus.resetAt) })
  }
}

function recordDeviceIPRateLimit(c: Context, appId: string) {
  // IP rate limiting is a second-layer limiter (per-minute) and is not required
  // for per-operation burst enforcement. Record it in the background.
  return recordChannelSelfIPRequest(c, appId)
}

async function recordDeviceRateLimitSafely(
  c: Context,
  body: Partial<DeviceLink>,
  operation: 'set' | 'get' | 'delete',
) {
  // Intentionally awaited for op-level rate limiting: this is the limiter that
  // must be effective immediately for burst protection.
  if (body.device_id && body.app_id) {
    try {
      await recordChannelSelfRequest(c, body.app_id, body.device_id, operation)
    }
    catch (error) {
      cloudlog({ requestId: c.get('requestId'), message: `Failed to record device ${operation} rate limit`, app_id: body.app_id, device_id: body.device_id, error })
    }
  }
  if (body.app_id) {
    backgroundTask(c, recordDeviceIPRateLimit(c, body.app_id))
  }
}

export const app = honoFactory.createApp()

app.post('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await parseBody<DeviceLink>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']

  cloudlog({ requestId: c.get('requestId'), message: 'body', body })
  cloudlog({
    requestId: c.get('requestId'),
    message: 'apikey context',
    apikeyId: apikey.id,
    userId: apikey.user_id,
    mode: apikey.mode,
  })

  // Rate limit: max 1 set per second per device+app, and same channel set max once per 60 seconds
  // Note: We check device_id && app_id only (not channel) so op-level rate limiting applies even for invalid requests
  if (body.app_id) {
    const ipLimit = await assertDeviceIPRateLimit(c, body.app_id)
    if (ipLimit)
      return ipLimit
  }
  if (body.device_id && body.app_id) {
    // Device API uses operation-level rate limiting only.
    const rateLimitStatus = await isChannelSelfRateLimited(c, body.app_id, body.device_id, 'set')
    if (rateLimitStatus.limited) {
      cloudlog({ requestId: c.get('requestId'), message: 'Device API set rate limited', app_id: body.app_id, device_id: body.device_id, channel: body.channel })
      return simpleRateLimit({ app_id: body.app_id, device_id: body.device_id, ...buildRateLimitInfo(rateLimitStatus.resetAt) })
    }
  }

  try {
    return await post(c, body, apikey)
  }
  finally {
    // Record the request for rate limiting (all requests, not just successful ones, to prevent abuse through repeated invalid requests)
    await recordDeviceRateLimitSafely(c, body, 'set')
  }
})

app.get('/', middlewareKey(['all', 'write', 'read']), async (c) => {
  const body = await getBodyOrQuery<DeviceLink>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'body', body })
  cloudlog({
    requestId: c.get('requestId'),
    message: 'apikey context',
    apikeyId: apikey.id,
    userId: apikey.user_id,
    mode: apikey.mode,
  })

  // Rate limit: max 1 get per second per device+app
  if (body.app_id) {
    const ipLimit = await assertDeviceIPRateLimit(c, body.app_id)
    if (ipLimit)
      return ipLimit
  }
  if (body.device_id && body.app_id) {
    const rateLimitStatus = await isChannelSelfRateLimited(c, body.app_id, body.device_id, 'get')
    if (rateLimitStatus.limited) {
      cloudlog({ requestId: c.get('requestId'), message: 'Device API get rate limited', app_id: body.app_id, device_id: body.device_id })
      return simpleRateLimit({ app_id: body.app_id, device_id: body.device_id, ...buildRateLimitInfo(rateLimitStatus.resetAt) })
    }
  }

  try {
    return await get(c, body, apikey)
  }
  finally {
    // Record the request for rate limiting (all requests, not just successful ones, to prevent abuse through repeated invalid requests)
    await recordDeviceRateLimitSafely(c, body, 'get')
  }
})

app.delete('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<DeviceLink>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'body', body })
  cloudlog({
    requestId: c.get('requestId'),
    message: 'apikey context',
    apikeyId: apikey.id,
    userId: apikey.user_id,
    mode: apikey.mode,
  })

  // Rate limit: max 1 delete per second per device+app
  if (body.app_id) {
    const ipLimit = await assertDeviceIPRateLimit(c, body.app_id)
    if (ipLimit)
      return ipLimit
  }
  if (body.device_id && body.app_id) {
    const rateLimitStatus = await isChannelSelfRateLimited(c, body.app_id, body.device_id, 'delete')
    if (rateLimitStatus.limited) {
      cloudlog({ requestId: c.get('requestId'), message: 'Device API delete rate limited', app_id: body.app_id, device_id: body.device_id })
      return simpleRateLimit({ app_id: body.app_id, device_id: body.device_id, ...buildRateLimitInfo(rateLimitStatus.resetAt) })
    }
  }

  try {
    return await deleteOverride(c, body, apikey)
  }
  finally {
    // Record the request for rate limiting (all requests, not just successful ones, to prevent abuse through repeated invalid requests)
    await recordDeviceRateLimitSafely(c, body, 'delete')
  }
})
