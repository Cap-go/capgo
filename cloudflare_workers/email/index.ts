import type { EmailMessage, Env, ParsedEmail, ThreadMapping } from './types'
import { classifyEmail, classifyEmailHeuristic } from './classifier'
import { createForumThread, getThreadMessages, postToThread } from './discord'
import { extractThreadId, getAllPotentialThreadIds, parseEmail } from './email-parser'
import { formatDiscordMessageAsEmail, sendEmail } from './email-sender'
import { deleteThreadMapping, getAllThreadMappings, getDiscordThreadId, refreshThreadMapping, storeThreadMapping } from './storage'

/**
 * Generates a unique message ID for an email
 */
function generateMessageId(fromAddress: string, timestamp: number): string {
  const domain = fromAddress.split('@')[1] || 'usecapgo.com'
  const randomPart = Math.random().toString(36).substring(2, 15)
  return `${timestamp}.${randomPart}@${domain}`
}

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

      // Read the raw email stream if needed
      let rawEmailText = ''
      if (message.raw && typeof message.raw !== 'string') {
        console.log('📖 Reading email body from ReadableStream...')
        try {
          const reader = message.raw.getReader()
          const decoder = new TextDecoder()
          const chunks: string[] = []

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(decoder.decode(value, { stream: true }))
          }

          rawEmailText = chunks.join('')
          console.log(`✅ Email body read: ${rawEmailText.length} characters`)
        }
        catch (error) {
          console.error('❌ Error reading email stream:', error)
        }
      }
      else if (typeof message.raw === 'string') {
        rawEmailText = message.raw
      }

      // Parse the email
      console.log('🔍 Parsing email...')
      const parsedEmail = parseEmail(message, rawEmailText)

      console.log('✅ Email parsed:', {
        from: parsedEmail.from,
        to: parsedEmail.to,
        subject: parsedEmail.subject,
        messageId: parsedEmail.messageId,
        inReplyTo: parsedEmail.inReplyTo,
        hasBody: !!parsedEmail.body.text || !!parsedEmail.body.html,
        bodyTextLength: parsedEmail.body.text?.length || 0,
        bodyHtmlLength: parsedEmail.body.html?.length || 0,
      })

      // Log email body content for debugging
      if (parsedEmail.body.text) {
        console.log('📄 Email body (text):')
        console.log(parsedEmail.body.text.substring(0, 500) + (parsedEmail.body.text.length > 500 ? '...' : ''))
      }
      if (parsedEmail.body.html) {
        console.log('📄 Email body (html):')
        console.log(parsedEmail.body.html.substring(0, 500) + (parsedEmail.body.html.length > 500 ? '...' : ''))
      }
      if (!parsedEmail.body.text && !parsedEmail.body.html) {
        console.warn('⚠️  No email body found!')
      }

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

    return new Response('Not Found', { status: 404 })
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    console.log('====================================')
    console.log('⏰ SCHEDULED WORKER: Polling Discord for new messages')
    console.log('====================================')

    try {
      // Get all thread mappings from KV
      const mappings = await getAllThreadMappings(env)
      console.log(`📋 Found ${mappings.length} active thread mappings`)

      for (const mapping of mappings) {
        await processThreadForNewMessages(env, mapping)
      }

      console.log('====================================')
      console.log('✅ SCHEDULED WORKER: Polling complete')
      console.log('====================================')
    }
    catch (error) {
      console.error('❌ ERROR in scheduled worker:', error)
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    }
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
async function handleEmailReply(env: Env, email: ParsedEmail, _threadId: string): Promise<void> {
  console.log('Processing email reply - checking all potential thread IDs')

  // Get all potential thread IDs from References and In-Reply-To headers
  const allPotentialIds = getAllPotentialThreadIds(email)
  console.log(`Found ${allPotentialIds.length} potential thread ID(s) to check:`, allPotentialIds)

  // Try to find a mapping for any of the potential thread IDs
  let mapping: ThreadMapping | null = null
  let foundThreadId: string | null = null

  for (const potentialId of allPotentialIds) {
    console.log(`Checking thread ID: ${potentialId}`)
    mapping = await getDiscordThreadId(env, potentialId)
    if (mapping) {
      foundThreadId = potentialId
      console.log(`✅ Found mapping for thread ID: ${potentialId}`)
      break
    }
  }

  if (!mapping) {
    console.log('❌ No mapping found for any thread ID, creating new thread')
    await handleNewEmail(env, email)
    return
  }

  console.log('Found existing Discord thread:', mapping.discordThreadId)

  // Post to the existing thread
  const success = await postToThread(env, mapping.discordThreadId, email)

  if (success) {
    // Refresh the mapping TTL to keep it alive
    await refreshThreadMapping(env, foundThreadId!)
    console.log('Posted to Discord thread successfully')
  }
  else {
    console.error('Failed to post to Discord thread')
  }
}

/**
 * Process a single thread to check for new messages and send emails
 */
async function processThreadForNewMessages(env: Env, mapping: ThreadMapping): Promise<void> {
  console.log(`🔍 Checking thread ${mapping.discordThreadId} for new messages`)
  console.log(`   Thread info:`)
  console.log(`   - Subject: ${mapping.subject}`)
  console.log(`   - Original sender: ${mapping.originalSender}`)
  console.log(`   - Email message ID: ${mapping.emailMessageId}`)

  // Get the last processed message ID from KV
  const lastMessageKey = `last-message:${mapping.discordThreadId}`
  const lastMessageId = await env.EMAIL_THREAD_MAPPING.get(lastMessageKey)
  console.log(`   - Last processed message ID: ${lastMessageId || 'none'}`)

  // Fetch recent messages from Discord
  console.log(`   Fetching recent messages from Discord...`)
  const messages = await getThreadMessages(env, mapping.discordThreadId, 10)

  // Check if thread was deleted (404)
  if (messages === null) {
    console.log(`   🗑️  Thread was deleted - cleaning up mapping`)
    await deleteThreadMapping(env, mapping.emailMessageId)
    // Also delete the last-message tracking
    await env.EMAIL_THREAD_MAPPING.delete(lastMessageKey)
    return
  }

  console.log(`   - Fetched ${messages.length} total message(s) from Discord`)

  if (messages.length === 0) {
    console.log(`   ⚠️  No messages found in thread`)
    return
  }

  // Log all messages for debugging
  console.log(`   All messages in thread:`)
  for (const msg of messages) {
    console.log(`   - ID: ${msg.id}, Author: ${msg.author?.username || 'unknown'}, Bot: ${msg.author?.bot || false}, Content length: ${msg.content?.length || 0}`)
  }

  // Filter out bot messages and messages we've already processed
  const humanMessages = messages.filter(msg => !msg.author.bot)
  console.log(`   - ${humanMessages.length} human message(s) (filtered out ${messages.length - humanMessages.length} bot messages)`)

  const newMessages = humanMessages
    .filter(msg => !lastMessageId || msg.id > lastMessageId)
    .reverse() // Process oldest first

  console.log(`   - ${newMessages.length} new message(s) to process`)

  if (newMessages.length === 0) {
    console.log(`   ✅ No new messages to process`)
    return
  }

  // Process each new message
  for (const message of newMessages) {
    console.log(`📤 Processing message ${message.id}:`)
    console.log(`   - Author: ${message.author.username}`)
    console.log(`   - Raw content: "${message.content}"`)
    console.log(`   - Content length: ${message.content?.length || 0} characters`)

    // Skip messages with empty content
    if (!message.content || message.content.trim().length === 0) {
      console.error(`   ⚠️  Skipping message ${message.id} - empty content`)
      console.error(`   ⚠️  This indicates the bot is missing "Message Content Intent" privilege`)
      console.error(`   ⚠️  Enable it at: https://discord.com/developers/applications → Bot → Privileged Gateway Intents`)

      // Still track this message ID so we don't keep retrying it
      await env.EMAIL_THREAD_MAPPING.put(
        lastMessageKey,
        message.id,
        { expirationTtl: 60 * 60 * 24 * 30 }, // 30 days
      )
      continue
    }

    // Format the Discord message as an email
    const emailContent = formatDiscordMessageAsEmail(
      message.author.username,
      message.content,
      mapping.subject,
    )

    // Generate a unique Message-ID for this outgoing email
    const ourMessageId = generateMessageId(env.EMAIL_FROM_ADDRESS, Date.now())
    console.log(`   - Generated Message-ID: ${ourMessageId}`)
    console.log(`   - Formatted email text: "${emailContent.text}"`)
    console.log(`   - Email subject: "${emailContent.subject}"`)
    console.log(`   - Sending to: ${mapping.originalSender}`)
    console.log(`   - In-Reply-To: ${mapping.emailMessageId}`)

    // Send the email reply with our custom Message-ID
    const success = await sendEmail(env, {
      ...emailContent,
      to: mapping.originalSender,
      inReplyTo: mapping.emailMessageId,
      references: [mapping.emailMessageId],
      messageId: ourMessageId, // Use our generated Message-ID
    })

    if (success) {
      console.log(`✅ Email sent successfully to ${mapping.originalSender}`)
      console.log(`   Storing our Message-ID in KV: ${ourMessageId}`)

      // Store our Message-ID in KV so customer replies can find this thread
      await storeThreadMapping(
        env,
        ourMessageId, // Store the Message-ID we just generated
        mapping.discordThreadId,
        mapping.discordGuildId,
        mapping.discordChannelId,
        mapping.originalSender,
        mapping.subject,
      )

      console.log(`   Storing last processed message ID: ${message.id}`)
      // Update the last processed message ID
      await env.EMAIL_THREAD_MAPPING.put(lastMessageKey, message.id, {
        expirationTtl: 30 * 24 * 60 * 60, // 30 days
      })
    }
    else {
      console.error(`❌ Failed to send email reply`)
    }
  }

  // Refresh the thread mapping TTL to keep it alive
  console.log(`   Refreshing thread mapping TTL...`)
  await refreshThreadMapping(env, mapping.emailMessageId)
  console.log(`   ✅ Thread mapping TTL refreshed`)
}
