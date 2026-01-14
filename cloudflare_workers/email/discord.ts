import type { DiscordAPIMessage, DiscordEmbed, DiscordMessage, DiscordThread, Env, ParsedEmail } from './types'

const DISCORD_API_BASE = 'https://discord.com/api/v10'

/**
 * Creates a new forum post (thread) in Discord
 */
export async function createForumThread(
  env: Env,
  email: ParsedEmail,
  categoryPrefix?: string,
): Promise<DiscordThread | null> {
  console.log('🟣 createForumThread: Starting...')
  console.log(`   Forum Channel ID: ${env.DISCORD_FORUM_CHANNEL_ID}`)
  console.log(`   Bot Token present: ${!!env.DISCORD_BOT_TOKEN}`)
  console.log(`   Bot Token length: ${env.DISCORD_BOT_TOKEN?.length || 0}`)

  const url = `${DISCORD_API_BASE}/channels/${env.DISCORD_FORUM_CHANNEL_ID}/threads`
  console.log(`   Discord API URL: ${url}`)

  // Create the initial message content
  const message = formatEmailForDiscord(email)
  console.log(`   Message content length: ${message.content.length}`)
  console.log(`   Number of embeds: ${message.embeds?.length || 0}`)

  // Add category prefix to thread name
  const threadName = categoryPrefix
    ? `${categoryPrefix}${email.subject || 'No Subject'}`
    : email.subject || 'No Subject'

  const truncatedName = truncateThreadName(threadName)
  console.log(`   Thread name: "${threadName}"`)
  console.log(`   Truncated name: "${truncatedName}"`)

  const payload = {
    name: truncatedName,
    message: {
      content: message.content,
      embeds: message.embeds,
      allowed_mentions: {
        parse: [],
      },
    },
    auto_archive_duration: 10080, // 7 days
  }

  console.log(`   Payload size: ${JSON.stringify(payload).length} bytes`)

  try {
    console.log('🌐 Sending request to Discord API...')
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    console.log(`📡 Discord API response status: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      const error = await response.text()
      console.error('❌ Failed to create Discord thread')
      console.error(`   Status: ${response.status}`)
      console.error(`   Response: ${error}`)
      return null
    }

    const thread = await response.json() as DiscordThread
    console.log('✅ Discord thread created successfully!')
    console.log(`   Thread ID: ${thread.id}`)
    console.log(`   Thread name: ${thread.name}`)
    return thread
  }
  catch (error) {
    console.error('❌ Error creating Discord thread:', error)
    console.error('   Error type:', error instanceof Error ? error.constructor.name : typeof error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
      console.error('   Error stack:', error.stack)
    }
    return null
  }
}

/**
 * Posts a message to an existing Discord thread
 * Only sends the email body text, no embeds (those are only for the initial thread creation)
 */
export async function postToThread(
  env: Env,
  threadId: string,
  email: ParsedEmail,
): Promise<boolean> {
  const url = `${DISCORD_API_BASE}/channels/${threadId}/messages`

  // For follow-up messages, just send the plain text body
  const bodyText = email.body.text || stripHtml(email.body.html || '')
  const content = bodyText.trim() || '(Empty message)'

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        allowed_mentions: {
          parse: [],
        },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Failed to post to Discord thread:', response.status, error)
      return false
    }

    return true
  }
  catch (error) {
    console.error('Error posting to Discord thread:', error)
    return false
  }
}

/**
 * Formats an email for display in Discord
 */
function formatEmailForDiscord(email: ParsedEmail): DiscordMessage {
  const fromText = email.from.name
    ? `**${email.from.name}** <${email.from.email}>`
    : `**${email.from.email}**`

  // Extract plain text body or convert HTML
  const bodyText = email.body.text || stripHtml(email.body.html || '')
  const truncatedBody = truncateText(bodyText, 1800)

  const embed: DiscordEmbed = {
    title: email.subject || 'No Subject',
    description: truncatedBody,
    color: 0x5865F2, // Discord blurple
    fields: [
      {
        name: 'From',
        value: fromText,
        inline: true,
      },
      {
        name: 'To',
        value: email.to,
        inline: true,
      },
    ],
    footer: {
      text: `Message ID: ${email.messageId}`,
    },
    timestamp: email.date?.toISOString() || new Date().toISOString(),
  }

  return {
    content: `📧 New email from ${email.from.email}`,
    embeds: [embed],
    allowed_mentions: {
      parse: [],
    },
  }
}

/**
 * Truncates thread name to Discord's 100 character limit
 */
function truncateThreadName(name: string): string {
  const maxLength = 100
  if (name.length <= maxLength)
    return name
  return `${name.substring(0, maxLength - 3)}...`
}

/**
 * Truncates text to specified length
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength)
    return text
  return `${text.substring(0, maxLength - 3)}...`
}

/**
 * Converts HTML to readable plain text
 * Preserves structure by converting block elements to newlines and decoding entities
 */
function stripHtml(html: string): string {
  let text = html
    // Remove style and script blocks
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Handle line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    // Handle block-level elements with double newlines
    .replace(/<\/(p|div|h[1-6]|article|section|header|footer|main|aside|nav|blockquote|pre)>/gi, '\n\n')
    .replace(/<(p|div|h[1-6]|article|section|header|footer|main|aside|nav|blockquote|pre)[^>]*>/gi, '')
    // Handle list items
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    // Handle table rows
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<\/tr>/gi, '')
    // Handle table cells with spacing
    .replace(/<td[^>]*>/gi, ' ')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<th[^>]*>/gi, ' ')
    .replace(/<\/th>/gi, ' | ')
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, '')

  // Decode HTML entities
  text = decodeHtmlEntities(text)

  // Clean up whitespace while preserving intentional line breaks
  text = text
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    // Collapse multiple newlines to max two
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
}

/**
 * Decodes common HTML entities to their character equivalents
 */
function decodeHtmlEntities(text: string): string {
  // Replace named entities using a map
  // Use Unicode escape sequences for special quotes to avoid encoding issues
  const entityMap: [string, string][] = [
    ['&nbsp;', ' '],
    ['&amp;', '&'],
    ['&lt;', '<'],
    ['&gt;', '>'],
    ['&quot;', '"'],
    ['&#39;', "'"],
    ['&apos;', "'"],
    ['&mdash;', '\u2014'], // —
    ['&ndash;', '\u2013'], // –
    ['&hellip;', '\u2026'], // …
    ['&lsquo;', '\u2018'], // '
    ['&rsquo;', '\u2019'], // '
    ['&ldquo;', '\u201C'], // "
    ['&rdquo;', '\u201D'], // "
    ['&bull;', '\u2022'], // •
    ['&middot;', '\u00B7'], // ·
    ['&copy;', '\u00A9'], // ©
    ['&reg;', '\u00AE'], // ®
    ['&trade;', '\u2122'], // ™
    ['&euro;', '\u20AC'], // €
    ['&pound;', '\u00A3'], // £
    ['&yen;', '\u00A5'], // ¥
    ['&cent;', '\u00A2'], // ¢
    ['&deg;', '\u00B0'], // °
    ['&times;', '\u00D7'], // ×
    ['&divide;', '\u00F7'], // ÷
    ['&plusmn;', '\u00B1'], // ±
    ['&frac12;', '\u00BD'], // ½
    ['&frac14;', '\u00BC'], // ¼
    ['&frac34;', '\u00BE'], // ¾
  ]

  let result = text
  for (const [entity, char] of entityMap) {
    result = result.split(entity).join(char)
  }

  // Replace numeric entities (&#123; or &#x1F600;)
  result = result
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))

  return result
}

/**
 * Fetches messages from a Discord thread
 */
export async function getThreadMessages(
  env: Env,
  threadId: string,
  limit: number = 50,
): Promise<DiscordAPIMessage[] | null> {
  const url = `${DISCORD_API_BASE}/channels/${threadId}/messages?limit=${limit}`

  try {
    console.log(`🔵 Fetching messages from Discord thread ${threadId}`)
    console.log(`   URL: ${url}`)

    const response = await fetch(url, {
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      },
    })

    console.log(`   Response status: ${response.status}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Failed to fetch thread messages: ${response.status}`)
      console.error(`   Error response: ${errorText}`)

      // Return null for 404 (thread deleted) so caller can clean up
      if (response.status === 404) {
        console.error(`   Thread ${threadId} not found - may have been deleted`)
        return null
      }

      return []
    }

    const messages = await response.json() as DiscordAPIMessage[]
    console.log(`   Fetched ${messages.length} message(s)`, messages)

    // Log full message objects for debugging
    for (const msg of messages) {
      console.log(`   Message ${msg.id}:`)
      console.log(`     - Type: ${msg.type}`)
      console.log(`     - Author: ${msg.author?.username} (ID: ${msg.author?.id}, Bot: ${msg.author?.bot})`)
      console.log(`     - Content: "${msg.content}"`)
      console.log(`     - Content length: ${msg.content?.length || 0}`)
      console.log(`     - Timestamp: ${msg.timestamp}`)
      console.log(`     - Has embeds: ${msg.embeds?.length > 0}`)
      console.log(`     - Has attachments: ${msg.attachments?.length > 0}`)
      console.log(`     - Raw message keys: ${Object.keys(msg).join(', ')}`)
    }

    // Check if all messages have empty content - indicates missing Message Content Intent
    const allEmpty = messages.every(msg => !msg.content || msg.content.length === 0)
    if (allEmpty && messages.length > 0) {
      console.error('⚠️  WARNING: All messages have empty content!')
      console.error('⚠️  This likely means the Discord bot is missing the "Message Content Intent" privilege.')
      console.error('⚠️  To fix this:')
      console.error('⚠️  1. Go to https://discord.com/developers/applications')
      console.error('⚠️  2. Select your application')
      console.error('⚠️  3. Go to the "Bot" tab')
      console.error('⚠️  4. Scroll to "Privileged Gateway Intents"')
      console.error('⚠️  5. Enable "MESSAGE CONTENT INTENT"')
      console.error('⚠️  6. Save changes')
      console.error('⚠️  Note: Bots do NOT need Gateway connection to access message content via REST API')
    }

    return messages
  }
  catch (error) {
    console.error('❌ Error fetching thread messages:', error)
    return []
  }
}
