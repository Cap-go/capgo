import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
// --- Worker logic imports ---
import { z } from 'zod'
import { sendDiscordAlert } from '../utils/discord.ts'
import { middlewareAPISecret } from '../utils/hono.ts'
import { closeClient, getPgClient } from '../utils/pg.ts'
import { backgroundTask, getEnv } from '../utils/utils.ts'

// Define constants
const BATCH_SIZE = 950 // Batch size for queue reads limit of CF is 1000 fetches so we take a safe margin

// Zod schema for a message object
export const messageSchema = z.object({
  msg_id: z.coerce.number(),
  read_ct: z.coerce.number(),
  message: z.object({
    payload: z.unknown(),
    function_name: z.string(),
    function_type: z.enum(['netlify', 'cloudflare', 'cloudflare_pp', '']).nullable().optional(),
  }),
})

export const messagesArraySchema = z.array(messageSchema)

async function processQueue(c: Context, sql: ReturnType<typeof getPgClient>, queueName: string) {
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
      const httpResponse = await http_post_helper(c as any, function_name, function_type, body)

      return {
        httpResponse,
        ...message,
      }
    }))

    // Batch remove all messages that have succeeded
    // const successMessages = results.filter(result => result.httpResponse.status >= 200 && result.httpResponse.status < 300)
    const [successMessages, messagesFailed] = results.reduce((acc, result) => {
      acc[(result.httpResponse.status >= 200 && result.httpResponse.status < 300) ? 0 : 1].push(result)
      return acc
    }, [[], []] as [typeof results, typeof results])
    if (successMessages.length > 0) {
      console.log(`[${queueName}] Deleting ${successMessages.length} successful messages from queue.`)
      await delete_queue_message_batch(sql, queueName, successMessages.map(msg => msg.msg_id))
    }
    if (messagesFailed.length > 0) {
      console.log(`[${queueName}] Failed to process ${messagesFailed.length} messages.`)
      await sendDiscordAlert(c as any, {
        content: `Queue: ${queueName}`,
        embeds: [
          {
            title: `Failed to process ${messagesFailed.length} messages.`,
            description: `Queue: ${queueName}`,
            fields: [
              {
                name: 'Messages',
                value: messagesFailed.map(msg => msg.message.function_name).join(', '),
              },
            ],
          },
        ],
      })
      // set visibility timeout to random number to prevent Auto DDOS
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
async function readQueue(sql: ReturnType<typeof getPgClient>, queueName: string) {
  const queueKey = 'readQueue'
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

// The main HTTP POST helper function
export async function http_post_helper(
  c: Context,
  function_name: string,
  function_type: string | null | undefined,
  body: any,
): Promise<Response> {
  const headers = {
    'Content-Type': 'application/json',
    'apisecret': getEnv(c as any, 'API_SECRET'),
  }

  let url: string
  if (function_type === 'cloudflare_pp' && getEnv(c as any, 'CLOUDFLARE_PP_FUNCTION_URL')) {
    url = `${getEnv(c as any, 'CLOUDFLARE_PP_FUNCTION_URL')}/triggers/${function_name}`
  }
  else if (function_type === 'cloudflare' && getEnv(c as any, 'CLOUDFLARE_FUNCTION_URL')) {
    url = `${getEnv(c as any, 'CLOUDFLARE_FUNCTION_URL')}/triggers/${function_name}`
  }
  else if (function_type === 'netlify' && getEnv(c as any, 'NETLIFY_FUNCTION_URL')) {
    url = `${getEnv(c as any, 'NETLIFY_FUNCTION_URL')}/triggers/${function_name}`
  }
  else {
    url = `${getEnv(c as any, 'SUPABASE_URL')}/functions/v1/triggers/${function_name}`
  }

  // Create an AbortController for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)
  // 15 second timeout, as the queue consumer is running every 10 seconds and the visibility timeout is 60 seconds

  try {
    console.log(`[${function_name}] Making HTTP POST request to "${url}" with body:`, body)
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      // signal: controller.signal,
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
async function delete_queue_message_batch(sql: ReturnType<typeof getPgClient>, queueName: string, msgIds: number[]) {
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
async function archive_queue_messages(sql: ReturnType<typeof getPgClient>, queueName: string, msgIds: number[]) {
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
        await processQueue(c as any, sql, queueName)
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
