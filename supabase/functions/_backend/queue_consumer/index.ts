import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { timingSafeEqual } from 'hono/utils/buffer'
// --- Worker logic imports ---
import { z } from 'zod'
import { middlewareAPISecret } from '../utils/hono.ts'
import { closeClient, getPgClient } from '../utils/pg.ts'

import { backgroundTask, getEnv } from '../utils/utils.ts'

// Define constants
const BATCH_SIZE = 200 // Batch size for queue reads

// Zod schema for a message object
export const messageSchema = z.object({
  msg_id: z.coerce.number(),
  read_ct: z.coerce.number(),
  message: z.object({
    payload: z.unknown(),
    function_name: z.string(),
    function_type: z.enum(['netlify', 'cloudflare', 'cloudflare_pp']).nullable().optional(),
  }),
})

export const messagesArraySchema = z.array(messageSchema)

async function processQueue(sql: any, queueName: string, envGetters: any) {
  try {
    const messages = await readQueue(sql, queueName)

    if (!messages) {
      console.log(`[${queueName}] No messages found in queue or an error occurred.`)
      return
    }

    const [messagesToProcess, messagesToSkip] = messages.reduce((acc, message) => {
      acc[message.read_ct <= 5 ? 0 : 1].push(message)
      return acc
    }, [[], []] as [typeof messages, typeof messages])

    console.log(`[${queueName}] Processing ${messagesToProcess.length} messages and skipping ${messagesToSkip.length} messages.`)

    // Archive messages that have been read 5 or more times
    if (messagesToSkip.length > 0) {
      console.log(`[${queueName}] Archiving ${messagesToSkip.length} messages that have been read 5 or more times.`)
      await archive_queue_messages(sql, queueName, messagesToSkip.map(msg => msg.msg_id))
    }

    // Process messages that have been read less than 5 times
    const results = await Promise.all(messagesToProcess.map(async (message) => {
      const function_name = message.message.function_name
      const function_type = message.message.function_type
      const body = message.message.payload
      const httpResponse = await http_post_helper(envGetters, function_name, function_type, body)

      return {
        httpResponse,
        ...message,
      }
    }))

    // Batch remove all messages that have succeeded
    const successMessages = results.filter(result => result.httpResponse.status >= 200 && result.httpResponse.status < 300)
    if (successMessages.length > 0) {
      console.log(`[${queueName}] Deleting ${successMessages.length} successful messages from queue.`)
      await delete_queue_message_batch(sql, queueName, successMessages.map(msg => msg.msg_id))
    }

    if (successMessages.length !== messagesToProcess.length) {
      console.log(`[${queueName}] ${successMessages.length} messages were processed successfully, ${messagesToProcess.length - successMessages.length} messages failed.`)
    }
    else {
      console.log(`[${queueName}] All messages were processed successfully.`)
    }
  }
  catch (error) {
    console.error(`[${queueName}] Error processing queue:`, error)
  }
}

// Reads messages from the queue and logs them
async function readQueue(sql: any, queueName: string) {
  const queueKey = 'replicate_data'
  const startTime = Date.now()
  console.log(`[${queueKey}] Starting queue read at ${startTime}.`)

  try {
    const visibilityTimeout = 60
    console.log(`[${queueKey}] Reading messages from queue: ${queueName}`)
    let messages = []
    try {
      messages = await sql`
        SELECT msg_id, message, read_ct
        FROM pgmq.read(${queueName}, ${visibilityTimeout}, ${BATCH_SIZE})
      `
    }
    catch (readError) {
      console.error(`[${queueKey}] Error reading from pgmq queue ${queueName}:`, readError)
      throw readError
    }

    if (!messages || messages.length === 0) {
      console.log(`[${queueKey}] No new messages found in queue ${queueName}.`)
      return
    }

    console.log(`[${queueKey}] Received ${messages.length} messages from queue ${queueName}.`)
    const parsed = messagesArraySchema.safeParse(messages)
    if (parsed.success) {
      return parsed.data
    }
    else {
      console.error(`[${queueKey}] Invalid message format:`, parsed.error)
    }
  }
  catch (error) {
    console.error(`[${queueKey}] Error reading queue messages:`, error)
  }
  finally {
    console.log(`[${queueKey}] Finished reading queue messages in ${Date.now() - startTime}ms.`)
  }
}

// Helper to get the Netlify function URL from the environment
function get_netlify_function_url(envGetters: any): string {
  const url = envGetters('NETLIFY_FUNCTION_URL')
  if (!url)
    throw new Error('NETLIFY_FUNCTION_URL not set in environment')
  return url
}

// Helper to get the API secret from the environment
function get_apikey(envGetters: any): string {
  const key = envGetters('APISECRET')
  if (!key)
    throw new Error('APISECRET not set in environment')
  return key
}

// Add other get_*_function_url helpers as needed, or use stubs for now
function get_cloudflare_function_url(envGetters: any): string {
  const url = envGetters('CLOUDFLARE_FUNCTION_URL')
  if (!url)
    throw new Error('CLOUDFLARE_FUNCTION_URL not set in environment')
  return url
}

function get_cloudflare_pp_function_url(envGetters: any): string {
  const url = envGetters('CLOUDFLARE_PP_FUNCTION_URL')
  if (!url)
    throw new Error('CLOUDFLARE_PP_FUNCTION_URL not set in environment')
  return url
}

function get_db_url(envGetters: any): string {
  const url = envGetters('DB_URL')
  if (!url)
    throw new Error('DB_URL not set in environment')
  return url
}

// The main HTTP POST helper function
export async function http_post_helper(
  envGetters: any,
  function_name: string,
  function_type: string | null | undefined,
  body: any,
): Promise<Response> {
  const headers = {
    'Content-Type': 'application/json',
    'apisecret': get_apikey(envGetters),
  }

  let url: string
  switch (function_type) {
    case 'netlify':
      url = `${get_netlify_function_url(envGetters)}/triggers/${function_name}`
      break
    case 'cloudflare':
      url = `${get_cloudflare_function_url(envGetters)}/triggers/${function_name}`
      break
    case 'cloudflare_pp':
      url = `${get_cloudflare_pp_function_url(envGetters)}/triggers/${function_name}`
      break
    default:
      url = `${get_db_url(envGetters)}/functions/v1/triggers/${function_name}`
      break
  }

  // Create an AbortController for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    return response
  }
  catch (error) {
    console.error(`[${function_name}] Error making HTTP POST request:`, error)
    return new Response('Request Timeout (Internal QUEUE handling error)', { status: 408 })
  }
  finally {
    clearTimeout(timeoutId)
  }
}

// Helper function to delete multiple messages from the queue in a single batch
async function delete_queue_message_batch(sql: any, queueName: string, msgIds: number[]) {
  try {
    if (msgIds.length === 0)
      return
    await sql`
      SELECT pgmq.delete(${queueName}, ARRAY[${sql.array(msgIds)}]::bigint[])
    `
  }
  catch (error) {
    console.error(`[Delete Queue Messages] Error deleting messages ${msgIds.join(', ')} from queue ${queueName}:`, error)
    throw error
  }
}

// Helper function to archive multiple messages from the queue in a single batch
async function archive_queue_messages(sql: any, queueName: string, msgIds: number[]) {
  try {
    if (msgIds.length === 0)
      return
    await sql`
      SELECT pgmq.archive(${queueName}, ARRAY[${sql.array(msgIds)}]::bigint[])
    `
  }
  catch (error) {
    console.error(`[Archive Queue Messages] Error archiving messages ${msgIds.join(', ')} from queue ${queueName}:`, error)
    throw error
  }
}

// --- Hono app setup ---
export const app = new Hono<MiddlewareKeyVariables>()

// /health endpoint
app.get('/health', async (c) => {
  return c.text('OK', 200)
})

app.use('/sync', middlewareAPISecret)

// /sync endpoint
app.post('/sync', async (c) => {
  const handlerStart = Date.now()
  console.log(`[Sync Request] Received trigger to process queue.`)

  // Require JSON body with queue_name
  let body: any
  try {
    body = await c.req.json()
  }
  catch (err) {
    console.error('[Sync Request] Error parsing JSON body:', err)
    return c.text('Invalid or missing JSON body', 400)
  }
  const queueName = body?.queue_name
  if (!queueName || typeof queueName !== 'string') {
    return c.text('Missing or invalid queue_name in body', 400)
  }

  try {
    await backgroundTask(c as any, (async () => {
      console.log(`[Background Queue Sync] Starting background execution for queue: ${queueName}`)
      let sql: ReturnType<typeof getPgClient> | null = null
      try {
        sql = getPgClient(c as any)
        await processQueue(sql, queueName, (key: string) => getEnv(c as any, key))
        console.log(`[Background Queue Sync] Background execution finished successfully.`)
      }
      finally {
        if (sql)
          await closeClient(c as any, sql)
        console.log(`[Background Queue Sync] PostgreSQL connection closed.`)
      }
    })())
    console.log(`[Sync Request] Responding 202 Accepted. Time: ${Date.now() - handlerStart}ms`)
    return c.text('Queue read scheduled', 202)
  }
  catch (error) {
    console.error('[Sync Request] Error handling sync request trigger:', error)
    return c.text(error instanceof Error ? error.message : 'Internal server error during sync request trigger', 500)
  }
})
