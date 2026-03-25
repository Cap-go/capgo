import type { TrackOptions } from '@logsnag/node'
import type { Context } from 'hono'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { existInEnv, getEnv } from './utils.ts'

const POSTHOG_CAPTURE_URL = 'https://eu.i.posthog.com/capture/'
const POSTHOG_EXCEPTION_URL = 'https://eu.i.posthog.com/i/v0/e/'

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

function getPostHogExceptionUrl(host: string) {
  if (host.endsWith('/i/v0/e/'))
    return host

  const normalizedHost = host.replace(/\/capture\/?$/, '/')
  return new URL('i/v0/e/', normalizedHost.endsWith('/') ? normalizedHost : `${normalizedHost}/`).toString()
}

function parseExceptionFrames(stack: string | undefined, fallbackFunctionName: string) {
  const frames = stack?.split('\n')
    .slice(1)
    .map((line) => {
      const trimmed = line.trim()
      const withoutAt = trimmed.startsWith('at ') ? trimmed.slice(3) : trimmed
      let functionName = fallbackFunctionName
      let location = withoutAt

      const groupedLocationIndex = withoutAt.lastIndexOf(' (')
      if (groupedLocationIndex !== -1 && withoutAt.endsWith(')')) {
        functionName = withoutAt.slice(0, groupedLocationIndex).trim() || fallbackFunctionName
        location = withoutAt.slice(groupedLocationIndex + 2, -1)
      }

      const lastColonIndex = location.lastIndexOf(':')
      const secondLastColonIndex = lastColonIndex === -1 ? -1 : location.lastIndexOf(':', lastColonIndex - 1)
      if (lastColonIndex === -1 || secondLastColonIndex === -1) {
        return {
          function: fallbackFunctionName,
          platform: 'custom',
          lang: 'javascript',
        }
      }

      return {
        function: functionName,
        filename: location.slice(0, secondLastColonIndex),
        lineno: Number.parseInt(location.slice(secondLastColonIndex + 1, lastColonIndex), 10),
        colno: Number.parseInt(location.slice(lastColonIndex + 1), 10),
        platform: 'custom',
        lang: 'javascript',
      }
    })
    .filter(Boolean)

  return frames && frames.length > 0
    ? frames
    : [{
        function: fallbackFunctionName,
        platform: 'custom',
        lang: 'javascript',
      }]
}

export async function capturePosthogException(c: Context, payload: {
  error: unknown
  functionName: string
  kind: 'drizzle_error' | 'http_exception' | 'unhandled_error'
  status?: number
}) {
  const apiKey = getEnv(c, 'POSTHOG_API_KEY')
  if (!apiKey || !existInEnv(c, 'POSTHOG_API_KEY')) {
    cloudlog({ requestId: c.get('requestId'), message: 'PostHog not configured' })
    return false
  }

  const host = getEnv(c, 'POSTHOG_API_HOST') || POSTHOG_EXCEPTION_URL
  const posthogUrl = getPostHogExceptionUrl(host)
  const serializedError = serializeError(payload.error)
  const distinctId = `backend:${getEnv(c, 'ENV_NAME') || 'unknown'}:${payload.functionName}`
  const frames = parseExceptionFrames(serializedError.stack, payload.functionName)
  const topFrame = frames[0]
  const fingerprint = [
    distinctId,
    payload.kind,
    serializedError.name || 'Error',
    topFrame?.function || payload.functionName,
    topFrame?.filename || 'unknown',
    String(payload.status ?? 500),
  ].join(':')

  const body = {
    token: apiKey,
    event: '$exception',
    properties: {
      distinct_id: distinctId,
      $exception_list: [{
        type: serializedError.name || 'Error',
        value: serializedError.message,
        mechanism: {
          handled: true,
          synthetic: false,
        },
        stacktrace: {
          type: 'raw',
          frames,
        },
      }],
      $exception_fingerprint: fingerprint,
      error_kind: payload.kind,
      function_name: payload.functionName,
      method: c.req.method,
      request_id: c.get('requestId'),
      status: payload.status,
      url: c.req.url,
    },
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
      cloudlogErr({ requestId: c.get('requestId'), message: 'PostHog exception error', status: res.status, error, event: '$exception', distinctId })
      return false
    }

    cloudlog({ requestId: c.get('requestId'), message: 'PostHog exception sent', event: '$exception', distinctId })
    return true
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'PostHog exception fetch failed', error: serializeError(e), event: '$exception', distinctId })
    return false
  }
}
