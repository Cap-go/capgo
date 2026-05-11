import type {
  RESTPostAPIWebhookWithTokenJSONBody,
} from 'discord-api-types/v10'
import type { Context } from 'hono'
import { cloudlog, cloudlogErr } from './logging.ts'
import { getEnv } from './utils.ts'

interface DiscordAlert500PayloadInput {
  body: string
  environment: string
  error: Error
  functionName: string
  hasClientIp: boolean
  hasUserAgent: boolean
  method: string
  rawHeaders: Record<string, string>
  requestId: string
  timestamp: string
  url: string
}

function boolLabel(value: boolean) {
  return value ? 'yes' : 'no'
}

function getPathSegmentCount(path: string) {
  return path.split('/').filter(Boolean).length
}

function getUrlSummary(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl)
    return {
      hasQuery: parsed.search.length > 0,
      hasPath: parsed.pathname.length > 0,
      pathSegmentCount: getPathSegmentCount(parsed.pathname),
    }
  }
  catch {
    const [path = ''] = rawUrl.split('?')
    return {
      hasQuery: rawUrl.includes('?'),
      hasPath: path.length > 0,
      pathSegmentCount: getPathSegmentCount(path),
    }
  }
}

function getHeaderSummary(headers: Record<string, string>) {
  const headerNames = Object.keys(headers).map(headerName => headerName.toLowerCase())
  return {
    count: headerNames.length,
    hasApiKey: headerNames.some(headerName =>
      headerName === 'capgkey'
      || headerName === 'x-api-key'
      || headerName.includes('apikey')
      || headerName.includes('api-key'),
    ),
    hasAuthorization: headerNames.includes('authorization'),
    hasCookie: headerNames.includes('cookie') || headerNames.includes('set-cookie'),
  }
}

function getSafeErrorName(error: Error) {
  const errorName = error?.name ?? 'Error'
  if (/^[\w .:-]{1,80}$/.test(errorName))
    return errorName
  return 'Error'
}

function getErrorLogMetadata(error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  return {
    errorName: error instanceof Error ? getSafeErrorName(error) : 'Error',
    hasMessage: errorMessage.length > 0,
    messageLength: errorMessage.length,
  }
}

function getDiscordPayloadLogMetadata(payload: RESTPostAPIWebhookWithTokenJSONBody) {
  const body = typeof payload === 'string'
    ? { content: payload }
    : payload
  const maybeBody = body as {
    content?: unknown
    embeds?: unknown
  }

  return {
    embedCount: Array.isArray(maybeBody.embeds) ? maybeBody.embeds.length : 0,
    hasContent: typeof maybeBody.content === 'string' && maybeBody.content.length > 0,
    payloadType: typeof payload,
  }
}

function buildDiscordAlert500Payload(input: DiscordAlert500PayloadInput): RESTPostAPIWebhookWithTokenJSONBody {
  const urlSummary = getUrlSummary(input.url)
  const headerSummary = getHeaderSummary(input.rawHeaders)
  const errorMessage = input.error?.message ?? ''
  const errorStack = input.error?.stack ?? ''

  return {
    content: `🚨 **${input.functionName}** Error Alert`,
    embeds: [
      {
        title: `❌ ${input.functionName} Function Failed`,
        description: `**Error:** ${getSafeErrorName(input.error)}`,
        color: 0xFF0000, // Red color
        timestamp: input.timestamp,
        fields: [
          {
            name: '🔍 Request Details',
            value: `**Method:** ${input.method}\n**Path present:** ${boolLabel(urlSummary.hasPath)}\n**Path segments:** ${urlSummary.pathSegmentCount}\n**Has query:** ${boolLabel(urlSummary.hasQuery)}\n**Request ID:** ${input.requestId}`,
            inline: false,
          },
          {
            name: '🌐 Client Info',
            value: `**IP present:** ${boolLabel(input.hasClientIp)}\n**User-Agent present:** ${boolLabel(input.hasUserAgent)}`,
            inline: false,
          },
          {
            name: '📝 Request Body',
            value: `**Present:** ${boolLabel(input.body.length > 0)}\n**Character length:** ${input.body.length}`,
            inline: false,
          },
          {
            name: '🔧 Headers',
            value: `**Count:** ${headerSummary.count}\n**Authorization present:** ${boolLabel(headerSummary.hasAuthorization)}\n**Cookie present:** ${boolLabel(headerSummary.hasCookie)}\n**API key present:** ${boolLabel(headerSummary.hasApiKey)}`,
            inline: false,
          },
          {
            name: '💥 Error Summary',
            value: `**Message present:** ${boolLabel(errorMessage.length > 0)}\n**Message length:** ${errorMessage.length}\n**Stack present:** ${boolLabel(errorStack.length > 0)}`,
            inline: false,
          },
        ],
        footer: {
          text: `Function: ${input.functionName} | Environment: ${input.environment || 'unknown'}`,
        },
      },
    ],
  }
}

export async function sendDiscordAlert(c: Context, payload: RESTPostAPIWebhookWithTokenJSONBody): Promise<boolean> {
  const webhookUrl = getEnv(c, 'DISCORD_ALERT')

  if (!webhookUrl) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Discord not set',
      payload: getDiscordPayloadLogMetadata(payload),
    })
    return true
  }

  try {
    const body = typeof payload === 'string'
      ? { content: payload }
      : payload

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      await response.text() // Consume body to prevent resource leak
      cloudlogErr({ requestId: c.get('requestId'), message: 'Discord webhook failed', status: response.status })
      return true
    }
    return true
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Discord webhook error',
      error: getErrorLogMetadata(error),
    })
    return true
  }
}

export function sendDiscordAlert500(c: Context, functionName: string, body: string, e: Error) {
  const requestId = c.get('requestId') ?? 'unknown'
  const timestamp = new Date().toISOString()
  const userAgent = c.req.header('user-agent')
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')
  const method = c.req.method
  const url = c.req.url
  const rawHeaders = Object.fromEntries((c.req.raw.headers as any).entries())

  const payload = buildDiscordAlert500Payload({
    body,
    environment: getEnv(c, 'ENVIRONMENT') || 'unknown',
    error: e,
    functionName,
    hasClientIp: !!ip,
    hasUserAgent: !!userAgent,
    method,
    rawHeaders,
    requestId,
    timestamp,
    url,
  })

  return sendDiscordAlert(c, payload).catch((e: any) => {
    cloudlogErr({
      requestId,
      functionName,
      message: 'sendDiscordAlert500 failed',
      error: getErrorLogMetadata(e),
    })
  })
}

export const __discordTestUtils__ = {
  buildDiscordAlert500Payload,
  getErrorLogMetadata,
  getDiscordPayloadLogMetadata,
}
