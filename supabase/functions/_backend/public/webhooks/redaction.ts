import type { Context } from 'hono'
import type { StandardSchema } from '../../utils/ark_validation.ts'
import { safeParseSchema } from '../../utils/ark_validation.ts'
import { simpleError } from '../../utils/hono.ts'
import { getWebhookUrlValidationError } from '../../utils/webhook.ts'

interface ValidationIssueLike {
  code?: unknown
}

export function getWebhookValidationErrorMetadata(error: unknown) {
  const issues = Array.isArray((error as { issues?: unknown[] } | undefined)?.issues)
    ? (error as { issues: ValidationIssueLike[] }).issues
    : []

  return {
    success: false,
    issueCount: issues.length,
    issues: issues.slice(0, 10).map(issue => ({
      ...(typeof issue?.code === 'string' ? { code: issue.code } : {}),
    })),
  }
}

export function parseWebhookBody<T>(schema: StandardSchema<T>, bodyRaw: unknown): T {
  const bodyParsed = safeParseSchema(schema, bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body')
  }

  return bodyParsed.data
}

export function getWebhookUrlMetadata(urlString: unknown) {
  if (typeof urlString !== 'string') {
    return { hasUrl: false }
  }

  try {
    const url = new URL(urlString)
    return {
      hasUrl: true,
      protocol: url.protocol,
      hostnameLength: url.hostname.length,
      pathLength: url.pathname.length,
      hasSearch: url.search.length > 0,
      hasHash: url.hash.length > 0,
    }
  }
  catch {
    return {
      hasUrl: true,
      parseable: false,
      length: urlString.length,
    }
  }
}

export function throwIfInvalidWebhookUrl(c: Context, urlString: string) {
  const urlError = getWebhookUrlValidationError(c, urlString)
  if (urlError)
    throw simpleError('invalid_url', urlError, { url: getWebhookUrlMetadata(urlString) })
}
