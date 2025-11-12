import type { EmailMessage, Env, ParsedEmail } from './types'
import { classifyEmail, classifyEmailHeuristic } from './classifier'
import { createForumThread, postToThread } from './discord'
import { extractThreadId, parseEmail } from './email-parser'
import { formatDiscordMessageAsEmail, sendEmail } from './email-sender'
import { getDiscordThreadId, getEmailMapping, refreshThreadMapping, storeThreadMapping } from './storage'

/**
 * Email Worker - Handles incoming emails and Discord webhooks
 */
export default {
  async email(message: EmailMessage, env: Env): Promise<void> {
    console.log('====================================')
    console.log('📧 EMAIL WORKER: Email received')
    console.log('====================================')

    try {
      // Log raw email metadata
      console.log('📨 Raw email metadata:', {
        from: message.from,
        to: message.to,
        subject: message.subject,
        rawSize: message.rawSize,
        rawType: typeof message.raw,
        headerKeys: Array.from(message.headers.keys()),
      })

      // Debug: Log all headers
      console.log('📋 All email headers:')
      for (const [key, value] of message.headers.entries()) {
        console.log(`   ${key}: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`)
      }

      // Parse the email
      console.log('🔍 Parsing email...')
      const parsedEmail = parseEmail(message)

      console.log('✅ Email parsed:', {
        from: parsedEmail.from,
        to: parsedEmail.to,
        subject: parsedEmail.subject,
        messageId: parsedEmail.messageId,
        inReplyTo: parsedEmail.inReplyTo,
        hasBody: !!parsedEmail.body.text || !!parsedEmail.body.html,
        bodyTextLength: parsedEmail.body.text?.length || 0,
      })

      // Check if this is a reply to an existing thread
      const threadId = extractThreadId(parsedEmail)
      console.log('🔗 Thread detection:', {
        isReply: !!threadId,
        threadId,
        inReplyTo: parsedEmail.inReplyTo,
        referencesCount: parsedEmail.references?.length || 0,
      })

      if (threadId) {
        // This is a reply - always process replies to existing threads
        console.log('↩️  Processing as REPLY to existing thread:', threadId)
        await handleEmailReply(env, parsedEmail, threadId)
      }
      else {
        // This is a new conversation - classify it first
        console.log('🆕 Processing as NEW email - starting classification...')
        const useAI = env.USE_AI_CLASSIFICATION !== 'false' // Default to true
        console.log(`🤖 AI Classification: ${useAI ? 'ENABLED' : 'DISABLED (using heuristic)'}`)

        const classification = useAI
          ? await classifyEmail(env, parsedEmail)
          : classifyEmailHeuristic(parsedEmail)

        console.log('📊 Email classification result:', {
          category: classification.category,
          confidence: classification.confidence,
          shouldProcess: classification.shouldProcess,
          reason: classification.reason,
        })

        if (classification.shouldProcess) {
          // Only process support, sales, and query emails
          console.log(`✅ Email WILL BE PROCESSED (category: ${classification.category})`)
          await handleNewEmail(env, parsedEmail, classification.category)
        }
        else {
          console.log(`⏭️  Email IGNORED (category: ${classification.category}):`, classification.reason)
        }
      }

      console.log('====================================')
      console.log('✅ EMAIL WORKER: Processing complete')
      console.log('====================================')
    }
    catch (error) {
      console.error('❌ ERROR processing email:', error)
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
      console.log('====================================')
      // Note: Email Workers should not throw errors or the email will be retried
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Health check endpoint
    if (url.pathname === '/health' || url.pathname === '/ok') {
      return new Response('OK', { status: 200 })
    }

    // Discord webhook handler
    if (url.pathname === '/discord-webhook' && request.method === 'POST') {
      return await handleDiscordWebhook(request, env)
    }

    return new Response('Not Found', { status: 404 })
  },
}

/**
 * Handles a new email by creating a Discord forum thread
 */
async function handleNewEmail(env: Env, email: ParsedEmail, category?: string): Promise<void> {
  const categoryPrefix = category ? `[${category.toUpperCase()}] ` : ''
  console.log(`📝 handleNewEmail: Creating Discord thread`)
  console.log(`   Category: ${category || 'uncategorized'}`)
  console.log(`   Prefix: "${categoryPrefix}"`)
  console.log(`   Subject: "${email.subject}"`)
  console.log(`   From: ${email.from.email}`)

  // Create a new forum thread
  console.log(`🔵 Calling createForumThread...`)
  const thread = await createForumThread(env, email, categoryPrefix)

  if (!thread) {
    console.error('❌ Failed to create Discord thread - received null/undefined')
    return
  }

  console.log('✅ Discord thread created successfully!')
  console.log(`   Thread ID: ${thread.id}`)
  console.log(`   Guild ID: ${thread.guild_id}`)
  console.log(`   Parent ID: ${thread.parent_id}`)

  // Store the mapping
  await storeThreadMapping(
    env,
    email.messageId,
    thread.id,
    thread.guild_id,
    thread.parent_id,
    email.from.email,
    email.subject,
  )

  console.log('Stored thread mapping')
}

/**
 * Handles an email reply by posting to existing Discord thread
 */
async function handleEmailReply(env: Env, email: ParsedEmail, threadId: string): Promise<void> {
  console.log('Processing email reply for thread ID:', threadId)

  // Get the Discord thread ID from the mapping
  const mapping = await getDiscordThreadId(env, threadId)

  if (!mapping) {
    console.log('No mapping found, creating new thread')
    await handleNewEmail(env, email)
    return
  }

  console.log('Found existing Discord thread:', mapping.discordThreadId)

  // Post to the existing thread
  const success = await postToThread(env, mapping.discordThreadId, email)

  if (success) {
    // Refresh the mapping TTL to keep it alive
    await refreshThreadMapping(env, threadId)
    console.log('Posted to Discord thread successfully')
  }
  else {
    console.error('Failed to post to Discord thread')
  }
}

/**
 * Handles Discord webhook for replies
 * This endpoint should be registered as a webhook in your Discord channel settings
 */
async function handleDiscordWebhook(request: Request, env: Env): Promise<Response> {
  try {
    const payload = await request.json() as any

    // Handle Discord webhook verification
    if (payload.type === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Handle message creation in a thread
    if (payload.type === 0 && payload.channel_id) {
      await handleDiscordMessage(env, payload)
    }

    return new Response('OK', { status: 200 })
  }
  catch (error) {
    console.error('Error handling Discord webhook:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

/**
 * Handles a Discord message and sends it as an email reply
 */
async function handleDiscordMessage(env: Env, payload: any): Promise<void> {
  const channelId = payload.channel_id
  const author = payload.author || payload.member?.user

  // Ignore bot messages (including our own)
  if (author?.bot)
    return

  // Get the thread mapping
  const mapping = await getEmailMapping(env, channelId)

  if (!mapping) {
    console.log('No email mapping found for Discord thread:', channelId)
    return
  }

  console.log('Found email mapping for thread:', channelId)

  // Format the Discord message as an email
  const emailContent = formatDiscordMessageAsEmail(
    author?.username || 'Discord User',
    payload.content || '',
    mapping.subject,
  )

  // Send the email reply
  const success = await sendEmail(env, {
    ...emailContent,
    to: mapping.originalSender,
    inReplyTo: mapping.emailMessageId,
    references: [mapping.emailMessageId],
  })

  if (success) {
    console.log('Sent email reply to:', mapping.originalSender)
  }
  else {
    console.error('Failed to send email reply')
  }
}

/**
 * Alternative: Use a scheduled handler to poll Discord for new messages
 * This is useful if webhooks are not available
 */
export async function scheduled(event: ScheduledEvent, env: Env): Promise<void> {
  // This could poll recent Discord threads and send emails for new messages
  // Not implemented in this example
  console.log('Scheduled handler triggered')
}
