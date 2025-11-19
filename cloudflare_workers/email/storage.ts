import type { Env, ThreadMapping } from './types'
import { cleanMessageId } from './email-parser'

const MAPPING_PREFIX = 'email:thread:'
const THREAD_PREFIX = 'thread:email:'

/**
 * Stores a mapping between an email message ID and Discord thread ID
 */
export async function storeThreadMapping(
  env: Env,
  emailMessageId: string,
  discordThreadId: string,
  discordGuildId: string,
  discordChannelId: string,
  originalSender: string,
  subject: string,
): Promise<void> {
  const cleanedMessageId = cleanMessageId(emailMessageId)

  const mapping: ThreadMapping = {
    emailMessageId: cleanedMessageId,
    discordThreadId,
    discordGuildId,
    discordChannelId,
    originalSender,
    subject,
    createdAt: Date.now(),
  }

  // Store bidirectional mapping
  // Email -> Discord
  await env.EMAIL_THREAD_MAPPING.put(
    `${MAPPING_PREFIX}${cleanedMessageId}`,
    JSON.stringify(mapping),
    {
      expirationTtl: 60 * 60 * 24 * 30, // 30 days
    },
  )

  // Discord -> Email (for replies)
  await env.EMAIL_THREAD_MAPPING.put(
    `${THREAD_PREFIX}${discordThreadId}`,
    JSON.stringify(mapping),
    {
      expirationTtl: 60 * 60 * 24 * 30, // 30 days
    },
  )
}

/**
 * Gets the Discord thread ID for an email message ID
 */
export async function getDiscordThreadId(
  env: Env,
  emailMessageId: string,
): Promise<ThreadMapping | null> {
  const cleanedMessageId = cleanMessageId(emailMessageId)
  const key = `${MAPPING_PREFIX}${cleanedMessageId}`

  const data = await env.EMAIL_THREAD_MAPPING.get(key)
  if (!data)
    return null

  try {
    return JSON.parse(data) as ThreadMapping
  }
  catch {
    return null
  }
}

/**
 * Gets the email mapping for a Discord thread ID
 */
export async function getEmailMapping(
  env: Env,
  discordThreadId: string,
): Promise<ThreadMapping | null> {
  const key = `${THREAD_PREFIX}${discordThreadId}`

  const data = await env.EMAIL_THREAD_MAPPING.get(key)
  if (!data)
    return null

  try {
    return JSON.parse(data) as ThreadMapping
  }
  catch {
    return null
  }
}

/**
 * Deletes a thread mapping
 */
export async function deleteThreadMapping(
  env: Env,
  emailMessageId: string,
): Promise<void> {
  const cleanedMessageId = cleanMessageId(emailMessageId)

  // Get the mapping first to find the thread ID
  const mapping = await getDiscordThreadId(env, cleanedMessageId)

  if (mapping) {
    // Delete both directions
    await env.EMAIL_THREAD_MAPPING.delete(`${MAPPING_PREFIX}${cleanedMessageId}`)
    await env.EMAIL_THREAD_MAPPING.delete(`${THREAD_PREFIX}${mapping.discordThreadId}`)
  }
}

/**
 * Updates the expiration of a thread mapping (to keep active threads alive)
 */
export async function refreshThreadMapping(
  env: Env,
  emailMessageId: string,
): Promise<void> {
  const mapping = await getDiscordThreadId(env, emailMessageId)

  if (mapping) {
    // Re-store with fresh TTL
    await storeThreadMapping(
      env,
      mapping.emailMessageId,
      mapping.discordThreadId,
      mapping.discordGuildId,
      mapping.discordChannelId,
      mapping.originalSender,
      mapping.subject,
    )
  }
}

/**
 * Gets all active thread mappings from KV
 * Returns an array of all thread mappings
 */
export async function getAllThreadMappings(env: Env): Promise<ThreadMapping[]> {
  const mappings: ThreadMapping[] = []

  // List all keys with the thread prefix (Discord -> Email mapping)
  // We use the THREAD_PREFIX because we want unique threads, not duplicate email entries
  const list = await env.EMAIL_THREAD_MAPPING.list({ prefix: THREAD_PREFIX })

  for (const key of list.keys) {
    const data = await env.EMAIL_THREAD_MAPPING.get(key.name)
    if (data) {
      try {
        const mapping = JSON.parse(data) as ThreadMapping
        mappings.push(mapping)
      }
      catch (error) {
        console.error(`Failed to parse mapping for key ${key.name}:`, error)
      }
    }
  }

  return mappings
}
