import type {
  RESTPostAPIWebhookWithTokenJSONBody,
} from 'discord-api-types/v10'
import type { Context } from 'hono'
import { cloudlog, cloudlogErr } from './logging.ts'
import { getEnv } from './utils.ts'

// Fields that should be completely removed from logs (never logged)
const REMOVED_FIELDS = ['password']
// Fields that should show first 4 and last 4 characters
const PARTIALLY_REDACTED_FIELDS = ['secret', 'token', 'apikey', 'api_key', 'api-key', 'authorization', 'credential', 'private_key', 'capgkey']

// Partially redact a value - show first 4 and last 4 characters
function partialRedact(value: string): string {
  if (value.length <= 8) {
    return '***REDACTED***'
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

function shouldRemoveField(key: string): boolean {
  const lowerKey = key.toLowerCase()
  return REMOVED_FIELDS.some(field => lowerKey.includes(field))
}

function shouldPartiallyRedactField(key: string): boolean {
  const lowerKey = key.toLowerCase()
  return PARTIALLY_REDACTED_FIELDS.some(field => lowerKey.includes(field))
}

function sanitizeSensitiveValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(item => sanitizeSensitiveValue(item))

  if (typeof value === 'string')
    return sanitizeSensitiveText(value)

  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [key, fieldValue] of Object.entries(value)) {
      if (shouldRemoveField(key))
        continue

      if (shouldPartiallyRedactField(key)) {
        sanitized[key] = partialRedact(String(fieldValue ?? ''))
        continue
      }

      sanitized[key] = sanitizeSensitiveValue(fieldValue)
    }
    return sanitized
  }

  return value
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const keys = Array.from(parsed.searchParams.keys())

    for (const key of keys) {
      if (shouldRemoveField(key)) {
        parsed.searchParams.delete(key)
        continue
      }

      if (shouldPartiallyRedactField(key)) {
        const value = parsed.searchParams.get(key) ?? ''
        parsed.searchParams.set(key, partialRedact(value))
      }
    }

    return parsed.toString()
  }
  catch {
    return sanitizeSensitiveKeyValues(url)
  }
}

function sanitizeSensitiveKeyValues(str: string): string {
  let result = str

  // Redact sensitive key/value pairs in free-form text, query strings, and form bodies.
  for (const field of REMOVED_FIELDS) {
    const keyValueRegex = new RegExp(`([^\\s&?;=:]*${field}[^\\s&?;=:]*)(\\s*[=:]\\s*)([^\\s&;]*)`, 'gi')
    result = result.replace(keyValueRegex, (_match, key, separator) => `${key}${separator}***REDACTED***`)
  }

  for (const field of PARTIALLY_REDACTED_FIELDS) {
    const keyValueRegex = new RegExp(`([^\\s&?;=:]*${field}[^\\s&?;=:]*)(\\s*[=:]\\s*)([^\\s&;]*)`, 'gi')
    result = result.replace(keyValueRegex, (_match, key, separator, value) => `${key}${separator}${partialRedact(value)}`)
  }

  // Completely remove password-like fields (including the key)
  for (const field of REMOVED_FIELDS) {
    const jsonRegexWithComma = new RegExp(`"[^"]*${field}[^"]*"\\s*:\\s*"[^"]*"\\s*,?\\s*`, 'gi')
    result = result.replace(jsonRegexWithComma, '')
    // Clean up any resulting double commas or leading/trailing commas in objects
    result = result.replace(/,\s*,/g, ',')
    result = result.replace(/\{\s*,/g, '{')
    result = result.replace(/,\s*\}/g, '}')
  }

  // Partially redact other sensitive field values (show first 4 and last 4 chars)
  for (const field of PARTIALLY_REDACTED_FIELDS) {
    const jsonRegex = new RegExp(`("[^"]*${field}[^"]*"\\s*:\\s*)"([^"]*)"`, 'gi')
    result = result.replace(jsonRegex, (_match, prefix, value) => {
      return `${prefix}"${partialRedact(value)}"`
    })
  }

  return result
}

function sanitizeSensitiveText(str: string): string {
  const result = str.replace(/https?:\/\/[^\s`"'<>]+/gi, value => sanitizeUrl(value))
  return sanitizeSensitiveKeyValues(result)
}

// Remove or redact sensitive fields from a string that might contain JSON
function sanitizeSensitiveFromString(str: string): string {
  try {
    const parsed = JSON.parse(str)
    return JSON.stringify(sanitizeSensitiveValue(parsed))
  }
  catch {
    return sanitizeSensitiveText(str)
  }
}

// Sanitize sensitive headers - remove or redact
function sanitizeSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    // Skip password-related headers entirely
    if (shouldRemoveField(key)) {
      continue
    }
    else if (shouldPartiallyRedactField(key)) {
      sanitized[key] = partialRedact(value)
    }
    else {
      sanitized[key] = value
    }
  }
  return sanitized
}

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
  const url = sanitizeUrl(c.req.url)
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
