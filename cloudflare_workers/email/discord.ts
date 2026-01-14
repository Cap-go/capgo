import type { DiscordAPIMessage, DiscordEmbed, DiscordMessage, DiscordThread, EmailAttachment, Env, ParsedEmail } from './types'
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
 * Creates a Discord message with attachments using multipart/form-data
 * This uploads files directly to Discord (for files under 25MB)
 */
async function createDiscordMessageWithAttachments(
  url: string,
  botToken: string,
  payload: Record<string, unknown>,
  attachments: EmailAttachment[],
): Promise<Response> {
  // Filter attachments that can be uploaded directly to Discord (under 25MB)
  const uploadableAttachments = attachments.filter(a => a.size <= DISCORD_MAX_FILE_SIZE)

  // Log skipped attachments
  const skippedAttachments = attachments.filter(a => a.size > DISCORD_MAX_FILE_SIZE)
  if (skippedAttachments.length > 0) {
    console.warn(`⚠️  Skipping ${skippedAttachments.length} attachment(s) over 25MB Discord limit:`)
    for (const att of skippedAttachments) {
      console.warn(`   - ${att.filename} (${formatFileSize(att.size)})`)
    }
  }

  if (uploadableAttachments.length === 0) {
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
  for (let i = 0; i < uploadableAttachments.length; i++) {
    const attachment = uploadableAttachments[i]

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

  console.log(`📤 Uploading ${uploadableAttachments.length} attachment(s) directly to Discord`)

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
 * Uploads attachments directly to Discord (files under 25MB)
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

  // Prepare payload
  const messagePayload: Record<string, unknown> = {
    content: message.content,
    embeds: message.embeds,
    allowed_mentions: {
      parse: [],
    },
  }

  // If we have attachments to upload directly to Discord, add attachment references
  const attachmentsToUpload = email.attachments?.filter(a => a.size <= DISCORD_MAX_FILE_SIZE) || []
  if (attachmentsToUpload.length > 0) {
    messagePayload.attachments = attachmentsToUpload.map((att, i) => ({
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
    if (attachmentsToUpload.length > 0) {
      // Use multipart/form-data to upload files directly to Discord
      response = await createDiscordMessageWithAttachments(
        url,
        env.DISCORD_BOT_TOKEN,
        payload,
        attachmentsToUpload,
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
 * Uploads attachments directly to Discord (files under 25MB)
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

  // Prepare payload
  const payload: Record<string, unknown> = {
    content,
    allowed_mentions: {
      parse: [],
    },
  }

  // If we have attachments to upload directly to Discord, add attachment references
  const attachmentsToUpload = email.attachments?.filter(a => a.size <= DISCORD_MAX_FILE_SIZE) || []
  if (attachmentsToUpload.length > 0) {
    payload.attachments = attachmentsToUpload.map((att, i) => ({
      id: i,
      filename: att.filename,
      description: `Email attachment: ${att.filename}`,
    }))
  }

  try {
    let response: Response

    if (attachmentsToUpload.length > 0) {
      // Upload files directly to Discord
      response = await createDiscordMessageWithAttachments(
        url,
        env.DISCORD_BOT_TOKEN,
        payload,
        attachmentsToUpload,
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
 */
function formatEmailForDiscord(email: ParsedEmail): DiscordMessage {
  const fromText = email.from.name
    ? `**${email.from.name}** <${email.from.email}>`
    : `**${email.from.email}**`

  // Extract plain text body or convert HTML
  const bodyText = email.body.text || stripHtml(email.body.html || '')
  const truncatedBody = truncateText(bodyText, 1800)

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

  // Note attachments in the embed if there are any
  const attachments = email.attachments || []
  if (attachments.length > 0) {
    const attachmentList = attachments
      .map(a => `• ${a.filename} (${formatFileSize(a.size)})`)
      .join('\n')
    fields.push({
      name: `📎 ${attachments.length} Attachment${attachments.length > 1 ? 's' : ''}`,
      value: attachmentList,
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
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
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
 * Converts HTML to Markdown using Turndown
 * Discord supports Markdown formatting, so this preserves structure nicely
 */
function stripHtml(html: string): string {
  if (!html || html.trim().length === 0) {
    return ''
  }

  try {
    // Use Turndown to convert HTML to Markdown
    const markdown = turndownService.turndown(html)

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
    // Fallback: strip tags manually if Turndown fails
    return html.replace(/<[^>]*>/g, '').trim()
  }
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
