import type { TrackOptions } from '@logsnag/node'
import type { Context } from 'hono'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { existInEnv, getEnv } from './utils.ts'

const POSTHOG_CAPTURE_URL = 'https://eu.i.posthog.com/capture/'

export async function trackPosthogEvent(c: Context, payload: Pick<TrackOptions, 'event'> & { user_id?: string } & Pick<TrackOptions, 'channel' | 'description'> & { ip?: string, tags?: Record<string, any> }) {
  const apiKey = getEnv(c, 'POSTHOG_API_KEY')
  if (!apiKey || !existInEnv(c, 'POSTHOG_API_KEY')) {
    cloudlog({ requestId: c.get('requestId'), message: 'PostHog not configured' })
    return false
  }

  const host = getEnv(c, 'POSTHOG_API_HOST') || POSTHOG_CAPTURE_URL
  const posthogUrl = host.endsWith('/capture/')
    ? host
    : new URL('capture/', host.endsWith('/') ? host : `${host}/`).toString()

  const distinctId = payload.user_id || 'anonymous'

  const properties = {
    ...(payload.tags || {}),
    channel: payload.channel,
    description: payload.description,
    $set: payload.tags,
  }

  const body = {
    api_key: apiKey,
    event: payload.event,
    distinct_id: distinctId,
    properties,
    ip: payload.ip,
    timestamp: new Date().toISOString(),
  }

  try {
    const res = await fetch(posthogUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const error = await res.text()
      cloudlogErr({ requestId: c.get('requestId'), message: 'PostHog error', status: res.status, error, event: payload.event, distinctId })
      return false
    }

    cloudlog({ requestId: c.get('requestId'), message: 'PostHog event sent', event: payload.event, distinctId })
    return true
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'PostHog fetch failed', error: serializeError(e), event: payload.event, distinctId })
    return false
  }
}
