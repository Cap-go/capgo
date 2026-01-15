import type { DiscordAPIMessage, DiscordEmbed, DiscordMessage, DiscordThread, EmailAttachment, Env, ParsedEmail } from './types'
import { uploadLargeAttachment } from './r2-storage'
import TurndownService from 'turndown'

const DISCORD_API_BASE = 'https://discord.com/api/v10'

// Initialize Turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
})
const DISCORD_MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB - Discord's limit for bots

/**
 * Result of processing attachments for Discord
 */
interface ProcessedAttachments {
  // Attachments that can be uploaded directly to Discord (<25MB)
  discordAttachments: EmailAttachment[]
  // URLs for large attachments uploaded to R2
  r2Links: Array<{ filename: string, url: string, size: number }>
}

/**
 * Processes attachments - uploads large ones to R2, keeps small ones for Discord
 */
async function processAttachmentsForDiscord(
  env: Env,
  attachments: EmailAttachment[],
  emailMessageId: string,
): Promise<ProcessedAttachments> {
  const discordAttachments: EmailAttachment[] = []
  const r2Links: Array<{ filename: string, url: string, size: number }> = []

  for (const attachment of attachments) {
    if (attachment.size <= DISCORD_MAX_FILE_SIZE) {
      // Small enough for Discord
      discordAttachments.push(attachment)
    }
    else {
      // Too large for Discord - upload to R2
      console.log(`📦 Uploading large attachment to R2: ${attachment.filename} (${formatFileSize(attachment.size)})`)
      const url = await uploadLargeAttachment(env, attachment, emailMessageId)
      if (url) {
        r2Links.push({
          filename: attachment.filename,
          url,
          size: attachment.size,
        })
        console.log(`✅ Large attachment uploaded to R2: ${url}`)
      }
      else {
        console.error(`❌ Failed to upload large attachment to R2: ${attachment.filename}`)
      }
    }
  }

  return { discordAttachments, r2Links }
}

/**
 * Creates a Discord message with attachments using multipart/form-data
 * This uploads files directly to Discord (for files under 25MB)
 */
async function createDiscordMessageWithAttachments(
  url: string,
  botToken: string,
  payload: Record<string, unknown>,
  attachments: EmailAttachment[],
): Promise<Response> {
  if (attachments.length === 0) {
    // No attachments to upload, use regular JSON request
    return fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  }

  // Create multipart form data
  const formData = new FormData()

  // Add the JSON payload
  formData.append('payload_json', JSON.stringify(payload))

  // Add each attachment as a file
  for (let i = 0; i < attachments.length; i++) {
    const attachment = attachments[i]

    // Convert content to Blob
    let blob: Blob
    if (attachment.content instanceof ArrayBuffer) {
      blob = new Blob([attachment.content], { type: attachment.contentType })
    }
    else if (typeof attachment.content === 'string') {
      const binaryString = atob(attachment.content)
      const bytes = new Uint8Array(binaryString.length)
      for (let j = 0; j < binaryString.length; j++) {
        bytes[j] = binaryString.charCodeAt(j)
      }
      blob = new Blob([bytes], { type: attachment.contentType })
    }
    else {
      continue
    }

    formData.append(`files[${i}]`, blob, attachment.filename)
  }

  console.log(`📤 Uploading ${attachments.length} attachment(s) directly to Discord`)

  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      // Don't set Content-Type - fetch will set it automatically with boundary
    },
    body: formData,
  })
}

/**
 * Creates a new forum post (thread) in Discord
 * Small attachments (<25MB) are uploaded directly to Discord
 * Large attachments (>=25MB) are uploaded to R2 with private links
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
  console.log(`   Attachments: ${email.attachments?.length || 0} from email`)

  const url = `${DISCORD_API_BASE}/channels/${env.DISCORD_FORUM_CHANNEL_ID}/threads`
  console.log(`   Discord API URL: ${url}`)

  // Process attachments - upload large ones to R2, keep small ones for Discord
  const { discordAttachments, r2Links } = await processAttachmentsForDiscord(
    env,
    email.attachments || [],
    email.messageId,
  )

  console.log(`   Discord attachments: ${discordAttachments.length}`)
  console.log(`   R2 links: ${r2Links.length}`)

  // Create the initial message content with R2 links if any
  const message = formatEmailForDiscord(email, r2Links)
  console.log(`   Message content length: ${message.content.length}`)
  console.log(`   Number of embeds: ${message.embeds?.length || 0}`)

  // Add category prefix to thread name
  const threadName = categoryPrefix
    ? `${categoryPrefix}${email.subject || 'No Subject'}`
    : email.subject || 'No Subject'

  const truncatedName = truncateThreadName(threadName)
  console.log(`   Thread name: "${threadName}"`)
  console.log(`   Truncated name: "${truncatedName}"`)

  // Prepare payload
  const messagePayload: Record<string, unknown> = {
    content: message.content,
    embeds: message.embeds,
    allowed_mentions: {
      parse: [],
    },
  }

  // If we have attachments to upload directly to Discord, add attachment references
  if (discordAttachments.length > 0) {
    messagePayload.attachments = discordAttachments.map((att, i) => ({
      id: i,
      filename: att.filename,
      description: `Email attachment: ${att.filename}`,
    }))
  }

  const payload = {
    name: truncatedName,
    message: messagePayload,
    auto_archive_duration: 10080, // 7 days
  }

  console.log(`   Payload size: ${JSON.stringify(payload).length} bytes`)

  try {
    console.log('🌐 Sending request to Discord API...')

    let response: Response
    if (discordAttachments.length > 0) {
      // Use multipart/form-data to upload files directly to Discord
      response = await createDiscordMessageWithAttachments(
        url,
        env.DISCORD_BOT_TOKEN,
        payload,
        discordAttachments,
      )
    }
    else {
      // Regular JSON request
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
    }

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
 * Small attachments (<25MB) are uploaded directly to Discord
 * Large attachments (>=25MB) are uploaded to R2 with private links
 */
export async function postToThread(
  env: Env,
  threadId: string,
  email: ParsedEmail,
): Promise<boolean> {
  const url = `${DISCORD_API_BASE}/channels/${threadId}/messages`

  // Process attachments - upload large ones to R2, keep small ones for Discord
  const { discordAttachments, r2Links } = await processAttachmentsForDiscord(
    env,
    email.attachments || [],
    email.messageId,
  )

  // For follow-up messages, just send the plain text body
  let bodyText = email.body.text || ''

  // If text body is empty or looks like it contains MIME boundaries, try HTML
  const hasMimeBoundaries = bodyText.includes('--') && bodyText.includes('Content-Type:')
  if (!bodyText || hasMimeBoundaries) {
    bodyText = stripHtml(email.body.html || '')
  }

  // Clean up any MIME boundaries, headers, and HTML that leaked through
  bodyText = cleanEmailBody(bodyText)

  let content = bodyText.trim() || '(Empty message)'

  // Add R2 links to the message if there are any large attachments
  if (r2Links.length > 0) {
    content += '\n\n📎 **Large Attachments** (expires in 7 days):'
    for (const link of r2Links) {
      content += `\n• [${link.filename}](${link.url}) (${formatFileSize(link.size)})`
    }
  }

  // Prepare payload
  const payload: Record<string, unknown> = {
    content,
    allowed_mentions: {
      parse: [],
    },
  }

  // If we have attachments to upload directly to Discord, add attachment references
  if (discordAttachments.length > 0) {
    payload.attachments = discordAttachments.map((att, i) => ({
      id: i,
      filename: att.filename,
      description: `Email attachment: ${att.filename}`,
    }))
  }

  try {
    let response: Response

    if (discordAttachments.length > 0) {
      // Upload files directly to Discord
      response = await createDiscordMessageWithAttachments(
        url,
        env.DISCORD_BOT_TOKEN,
        payload,
        discordAttachments,
      )
    }
    else {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
    }

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
 * Attachments are uploaded separately via multipart/form-data, Discord will display them
 * Large attachments uploaded to R2 are shown as links
 */
function formatEmailForDiscord(
  email: ParsedEmail,
  r2Links: Array<{ filename: string, url: string, size: number }> = [],
): DiscordMessage {
  const fromText = email.from.name
    ? `**${email.from.name}** <${email.from.email}>`
    : `**${email.from.email}**`

  // Extract plain text body or convert HTML, then clean up any MIME artifacts
  let bodyText = email.body.text || ''

  // If text body is empty or looks like it contains MIME boundaries, try HTML
  const hasMimeBoundaries = bodyText.includes('--') && bodyText.includes('Content-Type:')
  if (!bodyText || hasMimeBoundaries) {
    bodyText = stripHtml(email.body.html || '')
  }

  // Clean up any MIME boundaries, headers, and HTML that leaked through
  bodyText = cleanEmailBody(bodyText)

  const truncatedBody = truncateText(bodyText, 1800) || '(Empty message)'

  // Build fields array
  const fields: Array<{ name: string, value: string, inline?: boolean }> = [
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
  ]

  // Note attachments in the embed if there are any (small ones uploaded to Discord)
  const attachments = email.attachments || []
  const smallAttachments = attachments.filter(a => a.size <= DISCORD_MAX_FILE_SIZE)
  if (smallAttachments.length > 0) {
    const attachmentList = smallAttachments
      .map(a => `• ${a.filename} (${formatFileSize(a.size)})`)
      .join('\n')
    fields.push({
      name: `📎 ${smallAttachments.length} Attachment${smallAttachments.length > 1 ? 's' : ''}`,
      value: attachmentList,
      inline: false,
    })
  }

  // Add R2 links for large attachments
  if (r2Links.length > 0) {
    const r2LinksList = r2Links
      .map(link => `• [${link.filename}](${link.url}) (${formatFileSize(link.size)})`)
      .join('\n')
    fields.push({
      name: `📦 ${r2Links.length} Large Attachment${r2Links.length > 1 ? 's' : ''} (expires in 7 days)`,
      value: r2LinksList,
      inline: false,
    })
  }

  const embed: DiscordEmbed = {
    title: email.subject || 'No Subject',
    description: truncatedBody,
    color: 0x5865F2, // Discord blurple
    fields,
    footer: {
      text: `Message ID: ${email.messageId}`,
    },
    timestamp: email.date?.toISOString() || new Date().toISOString(),
  }

  const content = `📧 New email from ${email.from.email}`

  return {
    content,
    embeds: [embed],
    allowed_mentions: {
      parse: [],
    },
  }
}

/**
 * Formats file size in human readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
 * Cleans up email body text by removing any MIME boundaries or headers that leaked through
 * Note: Does NOT strip HTML tags or decode entities - that's handled by stripHtml for HTML content
 * Plain text content may legitimately contain <email@example.com> or code snippets
 */
function cleanEmailBody(text: string): string {
  if (!text)
    return ''

  // Remove MIME boundaries (lines starting with --)
  // These look like: --0000000000001fc4d80648616a21
  let cleaned = text.replace(/^--[\w-]+$/gm, '')

  // Remove Content-Type headers
  cleaned = cleaned.replace(/^Content-Type:\s*(?:\S[^\n]*|[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF])$/gim, '')

  // Remove Content-Transfer-Encoding headers
  cleaned = cleaned.replace(/^Content-Transfer-Encoding:\s*(?:\S[^\n]*|[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF])$/gim, '')

  // Remove Content-Disposition headers
  cleaned = cleaned.replace(/^Content-Disposition:\s*(?:\S[^\n]*|[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF])$/gim, '')

  // Remove charset declarations
  cleaned = cleaned.replace(/charset="?[^"\s;]+"?/gi, '')

  // Clean up excessive whitespace
  cleaned = cleaned
    .split('\n')
    .map(line => line.trim())
    .filter((line, index, arr) => {
      // Remove empty lines at start
      if (index === 0 && line === '')
        return false
      // Remove consecutive empty lines (keep max 1)
      if (line === '' && arr[index - 1]?.trim() === '')
        return false
      return true
    })
    .join('\n')
    .trim()

  return cleaned
}

/**
 * Decodes common HTML entities
 * Note: &amp; is decoded LAST to prevent double-unescaping (e.g., &amp;lt; → &lt; → <)
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&nbsp;/g, ' ')
    // Handle numeric entities
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number.parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    // Decode &amp; LAST to prevent double-unescaping
    .replace(/&amp;/g, '&')
}

/**
 * Converts HTML to Markdown using Turndown
 * Discord supports Markdown formatting, so this preserves structure nicely
 */
function stripHtml(html: string): string {
  if (!html || html.trim().length === 0) {
    return ''
  }

  try {
    // Use Turndown to convert HTML to Markdown
    let markdown = turndownService.turndown(html)

    // Decode HTML entities that might remain
    markdown = decodeHtmlEntities(markdown)

    // Clean up whitespace while preserving intentional line breaks
    return markdown
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n')
      // Collapse multiple newlines to max two
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
  catch (error) {
    console.error('Error converting HTML to Markdown:', error)
    // Fallback: use character-by-character approach to strip all HTML safely
    let result = stripTagsSafely(html)
    result = decodeHtmlEntities(result)
    return result
  }
}

/**
 * Strips HTML tags using a character-by-character approach
 * This avoids regex-based sanitization vulnerabilities
 */
function stripTagsSafely(html: string): string {
  const result: string[] = []
  let inTag = false

  for (const char of html) {
    if (char === '<') {
      inTag = true
    }
    else if (char === '>') {
      inTag = false
    }
    else if (!inTag) {
      result.push(char)
    }
  }

  return result.join('').trim()
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
