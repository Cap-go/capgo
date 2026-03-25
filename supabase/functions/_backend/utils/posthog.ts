import type { TrackOptions } from '@logsnag/node'
import type { Context } from 'hono'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { existInEnv, getEnv } from './utils.ts'

const POSTHOG_CAPTURE_URL = 'https://eu.i.posthog.com/capture/'

interface PostHogCapturePayload extends Pick<TrackOptions, 'event'>, Pick<TrackOptions, 'channel' | 'description'> {
  distinct_id?: string
  ip?: string
  setPersonProperties?: boolean
  tags?: Record<string, any>
  user_id?: string
}

export async function trackPosthogEvent(c: Context, payload: PostHogCapturePayload) {
  const apiKey = getEnv(c, 'POSTHOG_API_KEY')
  if (!apiKey || !existInEnv(c, 'POSTHOG_API_KEY')) {
    cloudlog({ requestId: c.get('requestId'), message: 'PostHog not configured' })
    return false
  }

  const host = getEnv(c, 'POSTHOG_API_HOST') || POSTHOG_CAPTURE_URL
  const posthogUrl = host.endsWith('/capture/')
    ? host
    : new URL('capture/', host.endsWith('/') ? host : `${host}/`).toString()

  const distinctId = payload.user_id || payload.distinct_id || 'anonymous'

  const properties = {
    ...(payload.tags || {}),
    channel: payload.channel,
    description: payload.description,
    ...(payload.setPersonProperties === false ? {} : { $set: payload.tags }),
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

export async function capturePosthogException(c: Context, payload: {
  error: unknown
  functionName: string
  kind: 'drizzle_error' | 'http_exception' | 'unhandled_error'
  status?: number
}) {
  return trackPosthogEvent(c, {
    event: 'Backend exception',
    distinct_id: `backend:${getEnv(c, 'ENV_NAME') || 'unknown'}:${payload.functionName}`,
    channel: 'backend-errors',
    description: `Unhandled backend error in ${payload.functionName}`,
    setPersonProperties: false,
    tags: {
      error_kind: payload.kind,
      error_message: payload.error instanceof Error ? payload.error.message : String(payload.error),
      error_name: payload.error instanceof Error ? payload.error.name : typeof payload.error,
      function_name: payload.functionName,
      method: c.req.method,
      request_id: c.get('requestId'),
      status: payload.status,
      url: c.req.url,
      ...serializeError(payload.error),
    },
  })
}
