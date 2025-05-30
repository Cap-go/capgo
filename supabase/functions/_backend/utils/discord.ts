import type { Context } from '@hono/hono'
import { cloudlogErr } from './loggin.ts'
import { getEnv } from './utils.ts'

interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  timestamp?: string
  color?: number
  footer?: {
    text: string
    icon_url?: string
  }
  image?: {
    url: string
  }
  thumbnail?: {
    url: string
  }
  author?: {
    name: string
    url?: string
    icon_url?: string
  }
  fields?: {
    name: string
    value: string
    inline?: boolean
  }[]
}

interface DiscordWebhookPayload {
  content?: string
  username?: string
  avatar_url?: string
  tts?: boolean
  embeds?: DiscordEmbed[]
  allowed_mentions?: {
    parse?: ('everyone' | 'users' | 'roles')[]
    roles?: string[]
    users?: string[]
    replied_user?: boolean
  }
}

export async function sendDiscordAlert(c: Context, payload: DiscordWebhookPayload): Promise<boolean> {
  const webhookUrl = getEnv(c, 'DISCORD_ALERT')

  if (!webhookUrl) {
    console.log({ requestId: c.get('requestId'), message: payload })
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
