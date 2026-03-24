import type { TrackOptions } from '@logsnag/node'
import type { Context } from 'hono'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { getEnv } from './utils.ts'

const POSTHOG_CAPTURE_URL = 'https://eu.i.posthog.com/capture/'
const POSTHOG_MAX_CAUSE_RECURSION = 4
const NODE_STACK_FILENAME_SEPARATOR = /^\s*-{4,}$/

interface PostHogStackFrame {
  platform: 'node:javascript'
  filename?: string
  function?: string
  lineno?: number
  colno?: number
  in_app?: boolean
}

interface PostHogException {
  type: string
  value: string
  mechanism: {
    type: 'generic' | 'middleware'
    handled: boolean
    synthetic: boolean
  }
  stacktrace?: {
    type: 'raw'
    frames: PostHogStackFrame[]
  }
}

interface PostHogCapturePayload {
  event: string
  distinct_id: string
  properties: Record<string, any>
  ip?: string
  timestamp: string
}

interface PostHogExceptionCaptureOptions {
  distinctId?: string
  handled?: boolean
  additionalProperties?: Record<string, any>
}

interface ExceptionLike {
  type: string
  value: string
  stack?: string
  cause?: ExceptionLike
  synthetic: boolean
}

interface ParsedStackLocation {
  location: string
  lineno?: number
  colno?: number
}

function getPostHogCaptureUrl(c: Context) {
  const host = getEnv(c, 'POSTHOG_API_HOST') || POSTHOG_CAPTURE_URL
  return host.endsWith('/capture/')
    ? host
    : new URL('capture/', host.endsWith('/') ? host : `${host}/`).toString()
}

async function sendPostHogCapture(c: Context, body: PostHogCapturePayload) {
  const apiKey = getEnv(c, 'POSTHOG_API_KEY')
  if (!apiKey) {
    cloudlog({ requestId: c.get('requestId'), message: 'PostHog not configured' })
    return false
  }

  const posthogUrl = getPostHogCaptureUrl(c)

  try {
    const res = await fetch(posthogUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        ...body,
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      cloudlogErr({ requestId: c.get('requestId'), message: 'PostHog error', status: res.status, error, event: body.event, distinctId: body.distinct_id })
      return false
    }

    cloudlog({ requestId: c.get('requestId'), message: 'PostHog event sent', event: body.event, distinctId: body.distinct_id })
    return true
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'PostHog fetch failed', error: serializeError(e), event: body.event, distinctId: body.distinct_id })
    return false
  }
}

function parseIntOrUndefined(input: string | undefined): number | undefined {
  if (input === undefined)
    return undefined

  const parsed = Number.parseInt(input, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

function safeDecodeUri(value: string): string {
  try {
    return decodeURI(value)
  }
  catch {
    return value
  }
}

function isIntegerString(input: string) {
  return input.length > 0 && [...input].every(char => char >= '0' && char <= '9')
}

function splitStackLocation(location: string): ParsedStackLocation {
  const lastColon = location.lastIndexOf(':')
  const secondLastColon = lastColon === -1 ? -1 : location.lastIndexOf(':', lastColon - 1)

  if (secondLastColon === -1)
    return { location }

  const maybeLine = location.slice(secondLastColon + 1, lastColon)
  const maybeColumn = location.slice(lastColon + 1)
  if (!isIntegerString(maybeLine) || !isIntegerString(maybeColumn))
    return { location }

  return {
    location: location.slice(0, secondLastColon),
    lineno: parseIntOrUndefined(maybeLine),
    colno: parseIntOrUndefined(maybeColumn),
  }
}

function filenameIsInApp(filename: string, isNative = false): boolean {
  const isInternal = isNative
    || (filename
      && !filename.startsWith('/')
      && !filename.match(/^[A-Z]:/)
      && !filename.startsWith('.')
      && !filename.match(/^[a-z][a-z0-9.+-]*:\/\//i))

  return !isInternal && filename !== undefined && !filename.includes('node_modules/')
}

function parseNodeStackTrace(stack: string, skipFirstLines = 0): PostHogStackFrame[] {
  const frames: PostHogStackFrame[] = []

  for (const rawLine of stack.split('\n').slice(skipFirstLines)) {
    const line = rawLine.trimEnd()
    const trimmedLine = line.trimStart()
    if (trimmedLine.startsWith('at ')) {
      const withoutAt = trimmedLine.slice(3)
      const withoutAsync = withoutAt.startsWith('async ') ? withoutAt.slice(6) : withoutAt
      const functionSeparator = withoutAsync.endsWith(')') ? withoutAsync.lastIndexOf(' (') : -1
      const rawFunctionName = functionSeparator === -1 ? undefined : withoutAsync.slice(0, functionSeparator)
      const rawLocation = functionSeparator === -1
        ? withoutAsync
        : withoutAsync.slice(functionSeparator + 2, -1)
      let object: string | undefined
      let method: string | undefined
      let functionName = rawFunctionName
      let typeName: string | undefined
      let methodName: string | undefined

      if (functionName) {
        let methodStart = functionName.lastIndexOf('.')
        if (functionName[methodStart - 1] === '.')
          methodStart--

        if (methodStart > 0) {
          object = functionName.slice(0, methodStart)
          method = functionName.slice(methodStart + 1)
          const objectEnd = object.indexOf('.Module')
          if (objectEnd > 0) {
            functionName = functionName.slice(objectEnd + 1)
            object = object.slice(0, objectEnd)
          }
        }
      }

      if (method) {
        typeName = object
        methodName = method
      }

      if (method === '<anonymous>') {
        methodName = undefined
        functionName = undefined
      }

      if (functionName === undefined) {
        methodName = methodName || '<anonymous>'
        functionName = typeName ? `${typeName}.${methodName}` : methodName
      }

      const isNative = rawLocation === 'native'
      const parsedLocation = splitStackLocation(rawLocation)
      let filename = parsedLocation.location.startsWith('file://') ? parsedLocation.location.slice(7) : parsedLocation.location

      if (filename?.match(/\/[A-Z]:/i))
        filename = filename.slice(1)

      const frame: PostHogStackFrame = {
        platform: 'node:javascript',
        in_app: filenameIsInApp(filename || '', isNative),
      }
      if (filename)
        frame.filename = safeDecodeUri(filename)
      if (functionName)
        frame.function = functionName
      if (parsedLocation.lineno !== undefined)
        frame.lineno = parsedLocation.lineno
      if (parsedLocation.colno !== undefined)
        frame.colno = parsedLocation.colno

      frames.push(frame)
      continue
    }

    if (line.match(NODE_STACK_FILENAME_SEPARATOR)) {
      frames.push({
        filename: line,
        platform: 'node:javascript',
      })
    }
  }

  return frames
}

function coerceError(error: unknown, depth = 0): ExceptionLike {
  const syntheticException = new Error('PostHog syntheticException')

  if (error instanceof Error) {
    const cause = depth < POSTHOG_MAX_CAUSE_RECURSION && error.cause
      ? coerceError(error.cause, depth + 1)
      : undefined
    return {
      type: error.name || 'Error',
      value: error.message || 'Unknown error',
      stack: error.stack || syntheticException.stack,
      cause,
      synthetic: false,
    }
  }

  if (typeof error === 'string') {
    return {
      type: 'Error',
      value: error,
      stack: syntheticException.stack,
      synthetic: true,
    }
  }

  if (error && typeof error === 'object') {
    const name = typeof (error as { name?: unknown }).name === 'string' ? (error as { name: string }).name : 'Error'
    const message = typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : 'Unknown error'
    const stack = typeof (error as { stack?: unknown }).stack === 'string' ? (error as { stack: string }).stack : syntheticException.stack
    const causeValue = (error as { cause?: unknown }).cause
    const cause = depth < POSTHOG_MAX_CAUSE_RECURSION && causeValue !== undefined
      ? coerceError(causeValue, depth + 1)
      : undefined

    return {
      type: name,
      value: message,
      stack,
      cause,
      synthetic: typeof (error as { stack?: unknown }).stack !== 'string',
    }
  }

  return {
    type: 'Error',
    value: 'Unknown error',
    stack: syntheticException.stack,
    synthetic: true,
  }
}

function toExceptionList(exception: ExceptionLike, handled: boolean, topLevel = true): PostHogException[] {
  const current: PostHogException = {
    type: exception.type,
    value: exception.value,
    mechanism: {
      type: 'middleware',
      handled: topLevel ? handled : true,
      synthetic: exception.synthetic,
    },
  }

  if (exception.stack) {
    current.stacktrace = {
      type: 'raw',
      frames: parseNodeStackTrace(exception.stack, exception.synthetic ? 1 : 0),
    }
  }

  const exceptions = [current]
  if (exception.cause)
    exceptions.push(...toExceptionList(exception.cause, true, false))

  return exceptions
}

export async function trackPosthogEvent(c: Context, payload: Pick<TrackOptions, 'event'> & { user_id?: string } & Pick<TrackOptions, 'channel' | 'description'> & { ip?: string, tags?: Record<string, any> }) {
  const distinctId = payload.user_id || 'anonymous'

  const properties = {
    ...(payload.tags || {}),
    channel: payload.channel,
    description: payload.description,
    $set: payload.tags,
  }

  return sendPostHogCapture(c, {
    event: payload.event,
    distinct_id: distinctId,
    properties,
    ip: payload.ip,
    timestamp: new Date().toISOString(),
  })
}

export async function capturePosthogException(c: Context, error: unknown, options: PostHogExceptionCaptureOptions = {}) {
  const distinctId = options.distinctId || c.get('auth')?.userId || c.get('requestId') || crypto.randomUUID()
  const exception = coerceError(error)
  const properties: Record<string, any> = {
    $exception_list: toExceptionList(exception, options.handled ?? false),
    $exception_level: 'error',
    ...(options.additionalProperties || {}),
  }

  if (!options.distinctId && !c.get('auth')?.userId)
    properties.$process_person_profile = false

  return sendPostHogCapture(c, {
    event: '$exception',
    distinct_id: distinctId,
    properties,
    timestamp: new Date().toISOString(),
  })
}
