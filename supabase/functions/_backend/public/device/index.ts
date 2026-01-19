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

export const app = honoFactory.createApp()

app.post('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await parseBody<DeviceLink>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']

  cloudlog({ requestId: c.get('requestId'), message: 'body', body })
  cloudlog({ requestId: c.get('requestId'), message: 'apikey', apikey })

  // Rate limit: max 1 set per second per device+app, and same channel set max once per 60 seconds
  // Note: We check device_id && app_id only (not channel) so op-level rate limiting applies even for invalid requests
  if (body.device_id && body.app_id) {
    const isRateLimited = await isChannelSelfRateLimited(c, body.app_id, body.device_id, 'set', body.channel)
    if (isRateLimited) {
      cloudlog({ requestId: c.get('requestId'), message: 'Device API set rate limited', app_id: body.app_id, device_id: body.device_id, channel: body.channel })
      return simpleRateLimit({ app_id: body.app_id, device_id: body.device_id })
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
  cloudlog({ requestId: c.get('requestId'), message: 'apikey', apikey })

  // Rate limit: max 1 get per second per device+app
  if (body.device_id && body.app_id) {
    const isRateLimited = await isChannelSelfRateLimited(c, body.app_id, body.device_id, 'get')
    if (isRateLimited) {
      cloudlog({ requestId: c.get('requestId'), message: 'Device API get rate limited', app_id: body.app_id, device_id: body.device_id })
      return simpleRateLimit({ app_id: body.app_id, device_id: body.device_id })
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
  cloudlog({ requestId: c.get('requestId'), message: 'apikey', apikey })

  // Rate limit: max 1 delete per second per device+app
  if (body.device_id && body.app_id) {
    const isRateLimited = await isChannelSelfRateLimited(c, body.app_id, body.device_id, 'delete')
    if (isRateLimited) {
      cloudlog({ requestId: c.get('requestId'), message: 'Device API delete rate limited', app_id: body.app_id, device_id: body.device_id })
      return simpleRateLimit({ app_id: body.app_id, device_id: body.device_id })
    }
  }

  const res = await deleteOverride(c, body, apikey)

  // Record the request for rate limiting (all requests, not just successful ones, to prevent abuse through repeated invalid requests)
  if (body.device_id && body.app_id) {
    backgroundTask(c, recordChannelSelfRequest(c, body.app_id, body.device_id, 'delete'))
  }

  return res
})
