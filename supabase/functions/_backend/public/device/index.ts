import type { Database } from '../../utils/supabase.types.ts'
import type { DeviceLink } from './delete.ts'
import { isChannelSelfRateLimited, recordChannelSelfRequest } from '../../utils/channelSelfRateLimit.ts'
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
  if (body.device_id && body.app_id) {
    const rateLimitStatus = await isChannelSelfRateLimited(c, body.app_id, body.device_id, 'set', body.channel)
    if (rateLimitStatus.limited) {
      cloudlog({ requestId: c.get('requestId'), message: 'Device API set rate limited', app_id: body.app_id, device_id: body.device_id, channel: body.channel })
      return simpleRateLimit({ app_id: body.app_id, device_id: body.device_id, ...buildRateLimitInfo(rateLimitStatus.resetAt) })
    }
  }

  const res = await post(c, body, apikey)

  // Record the request for rate limiting (all requests, not just successful ones, to prevent abuse through repeated invalid requests)
  if (body.device_id && body.app_id) {
    backgroundTask(c, recordChannelSelfRequest(c, body.app_id, body.device_id, 'set', body.channel))
  }

  return res
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
  if (body.device_id && body.app_id) {
    const rateLimitStatus = await isChannelSelfRateLimited(c, body.app_id, body.device_id, 'get')
    if (rateLimitStatus.limited) {
      cloudlog({ requestId: c.get('requestId'), message: 'Device API get rate limited', app_id: body.app_id, device_id: body.device_id })
      return simpleRateLimit({ app_id: body.app_id, device_id: body.device_id, ...buildRateLimitInfo(rateLimitStatus.resetAt) })
    }
  }

  const res = await get(c, body, apikey)

  // Record the request for rate limiting (all requests, not just successful ones, to prevent abuse through repeated invalid requests)
  if (body.device_id && body.app_id) {
    backgroundTask(c, recordChannelSelfRequest(c, body.app_id, body.device_id, 'get'))
  }

  return res
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
  if (body.device_id && body.app_id) {
    const rateLimitStatus = await isChannelSelfRateLimited(c, body.app_id, body.device_id, 'delete')
    if (rateLimitStatus.limited) {
      cloudlog({ requestId: c.get('requestId'), message: 'Device API delete rate limited', app_id: body.app_id, device_id: body.device_id })
      return simpleRateLimit({ app_id: body.app_id, device_id: body.device_id, ...buildRateLimitInfo(rateLimitStatus.resetAt) })
    }
  }

  const res = await deleteOverride(c, body, apikey)

  // Record the request for rate limiting (all requests, not just successful ones, to prevent abuse through repeated invalid requests)
  if (body.device_id && body.app_id) {
    backgroundTask(c, recordChannelSelfRequest(c, body.app_id, body.device_id, 'delete'))
  }

  return res
})
