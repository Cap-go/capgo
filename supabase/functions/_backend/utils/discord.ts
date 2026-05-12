import type {
  RESTPostAPIWebhookWithTokenJSONBody,
} from 'discord-api-types/v10'
import type { Context } from 'hono'
import { sanitizeSensitiveFromString, sanitizeSensitiveHeaders } from './discord_sanitization.ts'
import { cloudlog, cloudlogErr } from './logging.ts'
import { getEnv } from './utils.ts'

export async function sendDiscordAlert(c: Context, payload: RESTPostAPIWebhookWithTokenJSONBody): Promise<boolean> {
  const webhookUrl = getEnv(c, 'DISCORD_ALERT')

  if (!webhookUrl) {
    cloudlog({ requestId: c.get('requestId'), message: 'Discord not set', payload: JSON.stringify(payload) })
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
    cloudlogErr({ requestId: c.get('requestId'), message: 'Discord webhook error', error })
    return true
  }
}

export function sendDiscordAlert500(c: Context, functionName: string, body: string, e: Error) {
  const requestId = c.get('requestId') ?? 'unknown'
  const timestamp = new Date().toISOString()
  const userAgent = c.req.header('user-agent') ?? 'unknown'
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown'
  const method = c.req.method
  const url = c.req.url
  const rawHeaders = Object.fromEntries((c.req.raw.headers as any).entries())
  const headers = sanitizeSensitiveHeaders(rawHeaders)
  const errorMessage = sanitizeSensitiveFromString(e?.message ?? 'Unknown error')
  const errorStack = sanitizeSensitiveFromString(e?.stack ?? 'No stack trace')
  const errorName = e?.name ?? 'Error'
  // Defense-in-depth: remove/sanitize sensitive fields from body string
  const safeBody = sanitizeSensitiveFromString(body)
  const safeErrorObject = sanitizeSensitiveFromString(JSON.stringify(e, Object.getOwnPropertyNames(e), 2))
  return sendDiscordAlert(c, {
    content: `🚨 **${functionName}** Error Alert`,
    embeds: [
      {
        title: `❌ ${functionName} Function Failed`,
        description: `**Error:** ${errorName}\n**Message:** ${errorMessage}`,
        color: 0xFF0000, // Red color
        timestamp,
        fields: [
          {
            name: '🔍 Request Details',
            value: `**Method:** ${method}\n**URL:** ${url}\n**Request ID:** ${requestId}`,
            inline: false,
          },
          {
            name: '🌐 Client Info',
            value: `**IP:** ${ip}\n**User-Agent:** ${userAgent}`,
            inline: false,
          },
          {
            name: '📝 Request Body',
            value: `\`\`\`\n${safeBody}\n\`\`\``,
            inline: false,
          },
          {
            name: '🔧 Headers',
            value: `\`\`\`json\n${JSON.stringify(headers, null, 2).substring(0, 1000)}\n\`\`\``,
            inline: false,
          },
          {
            name: '💥 Error Stack',
            value: `\`\`\`\n${errorStack.substring(0, 1000)}\n\`\`\``,
            inline: false,
          },
          {
            name: '🔍 Full Error Object',
            value: `\`\`\`json\n${safeErrorObject.substring(0, 1000)}\n\`\`\``,
            inline: false,
          },
        ],
        footer: {
          text: `Function: ${functionName} | Environment: ${getEnv(c, 'ENVIRONMENT') || 'unknown'}`,
        },
      },
    ],
  }).catch((e: any) => {
    cloudlogErr({ requestId, functionName, message: 'sendDiscordAlert500 failed', error: e })
  })
}
