export interface Env {
  // KV Namespace for storing email-to-Discord thread mappings
  EMAIL_THREAD_MAPPING: KVNamespace

  // Discord Configuration
  DISCORD_BOT_TOKEN: string
  DISCORD_GUILD_ID: string
  DISCORD_FORUM_CHANNEL_ID: string

  // Email Configuration (Resend)
  EMAIL_FROM_ADDRESS: string
  EMAIL_FROM_NAME?: string
  RESEND_API_KEY: string // Resend API key for sending emails

  // AI Classification
  ANTHROPIC_API_KEY: string
  USE_AI_CLASSIFICATION?: string // "true" or "false", defaults to "true"

  // Environment
  ENV_NAME?: string
}

export interface EmailMessage {
  from: string
  to: string
  subject: string
  headers: Map<string, string>
  raw: ReadableStream | string // Cloudflare provides ReadableStream, but allow string for compatibility
  rawSize: number
}

export interface ParsedEmail {
  from: {
    email: string
    name?: string
  }
  to: string
  subject: string
  body: {
    text?: string
    html?: string
  }
  inReplyTo?: string
  messageId: string
  references?: string[]
  date?: Date
  attachments?: EmailAttachment[]
}

export interface EmailAttachment {
  filename: string
  contentType: string
  content: ArrayBuffer | string // Base64 string or binary data
  size: number
}

export interface ThreadMapping {
  emailMessageId: string
  discordThreadId: string
  discordGuildId: string
  discordChannelId: string
  originalSender: string
  subject: string
  createdAt: number
}

export interface DiscordMessage {
  content: string
  embeds?: DiscordEmbed[]
  allowed_mentions?: {
    parse: string[]
  }
}

export interface DiscordEmbed {
  title?: string
  description?: string
  color?: number
  fields?: Array<{
    name: string
    value: string
    inline?: boolean
  }>
  footer?: {
    text: string
  }
  timestamp?: string
}

export interface DiscordThread {
  id: string
  name: string
  parent_id: string
  guild_id: string
}

export interface DiscordWebhookPayload {
  type: number
  token?: string
  guild_id?: string
  channel_id?: string
  author?: {
    id: string
    username: string
    discriminator: string
  }
  content?: string
  timestamp?: string
  message?: {
    id: string
    channel_id: string
    author: {
      id: string
      username: string
      bot?: boolean
    }
    content: string
    timestamp: string
  }
}

/**
 * Discord API Message object
 * https://discord.com/developers/docs/resources/message#message-object
 */
export interface DiscordAPIMessage {
  id: string
  channel_id: string
  author: {
    id: string
    username: string
    discriminator: string
    avatar?: string
    bot?: boolean
    system?: boolean
  }
  content: string // Empty if bot doesn't have Message Content Intent
  timestamp: string
  edited_timestamp?: string | null
  tts: boolean
  mention_everyone: boolean
  mentions: Array<{
    id: string
    username: string
    discriminator: string
  }>
  mention_roles: string[]
  attachments: Array<{
    id: string
    filename: string
    size: number
    url: string
    proxy_url: string
  }>
  embeds: DiscordEmbed[]
  reactions?: Array<{
    count: number
    me: boolean
    emoji: {
      id: string | null
      name: string
    }
  }>
  type: number // 0 = default, 19 = reply, etc.
  flags?: number
}
