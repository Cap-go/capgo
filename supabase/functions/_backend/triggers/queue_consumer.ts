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

// Helper function to generate UUID v4
function generateUUID(): string {
  return crypto.randomUUID()
}

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
      const cfId = generateUUID()
      const httpResponse = await http_post_helper(c as any, function_name, function_type, body, cfId)

      return {
        httpResponse,
        cfId,
        ...message,
      }
    }))

    // Update all messages with their CF IDs
    const cfIdUpdates = results.map(result => ({
      msg_id: result.msg_id,
      cf_id: result.cfId,
      queue: queueName,
    }))

    if (cfIdUpdates.length > 0) {
      console.log(`[${queueName}] Updating ${cfIdUpdates.length} messages with CF IDs.`)
      await mass_edit_queue_messages_cf_ids(sql, cfIdUpdates)
    }

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

      const timestamp = new Date().toISOString()
      const failureDetails = messagesFailed.map(msg => ({
        function_name: msg.message.function_name,
        function_type: msg.message.function_type || 'supabase',
        msg_id: msg.msg_id,
        read_count: msg.read_ct,
        status: msg.httpResponse.status,
        status_text: msg.httpResponse.statusText,
        payload_size: JSON.stringify(msg.message.payload).length,
        cf_id: msg.cfId,
      }))

      const groupedByFunction = failureDetails.reduce((acc, detail) => {
        const key = detail.function_name
        if (!acc[key])
          acc[key] = []
        acc[key].push(detail)
        return acc
      }, {} as Record<string, typeof failureDetails>)

      await sendDiscordAlert(c as any, {
        content: `🚨 **Queue Processing Failures** - ${queueName}`,
        embeds: [
          {
            title: `❌ ${messagesFailed.length} Messages Failed Processing`,
            description: `**Queue:** ${queueName}\n**Failed Functions:** ${Object.keys(groupedByFunction).length}\n**Total Failures:** ${messagesFailed.length}`,
            color: 0xFF6B35, // Orange color for warnings
            timestamp,
            fields: [
              {
                name: '📊 Failure Summary',
                value: Object.entries(groupedByFunction)
                  .map(([funcName, failures]) =>
                    `**${funcName}** (${failures[0].function_type}): ${failures.length} failures`,
                  )
                  .join('\n'),
                inline: false,
              },
              {
                name: '🔍 Detailed Failures',
                value: failureDetails.slice(0, 10).map((detail) => {
                  const cfLogUrl = `https://dash.cloudflare.com/${getEnv(c as any, 'CF_ACCOUNT_ANALYTICS_ID')}/workers/services/view/capgo_api-prod/production/observability/logs?workers-observability-view=%22invocations%22&filters=%5B%7B%22key%22%3A%22%24workers.event.request.headers.x-capgo-cf-id%22%2C%22type%22%3A%22string%22%2C%22value%22%3A%22${detail.cf_id}%22%2C%22operation%22%3A%22eq%22%7D%5D`
                  return `**${detail.function_name}** | Status: ${detail.status} | Read: ${detail.read_count}/5 | [CF Logs](${cfLogUrl})`
                }).join('\n'),
                inline: false,
              },
              {
                name: '📈 Status Code Distribution',
                value: Object.entries(
                  failureDetails.reduce((acc, detail) => {
                    acc[detail.status] = (acc[detail.status] || 0) + 1
                    return acc
                  }, {} as Record<number, number>),
                ).map(([status, count]) => `**${status}:** ${count}`).join(' | '),
                inline: false,
              },
              {
                name: '⚠️ Retry Analysis',
                value: `**Will Retry:** ${failureDetails.filter(d => d.read_count < 5).length}\n**Will Archive:** ${failureDetails.filter(d => d.read_count >= 5).length}`,
                inline: true,
              },
              {
                name: '📦 Payload Info',
                value: `**Avg Size:** ${Math.round(failureDetails.reduce((sum, d) => sum + d.payload_size, 0) / failureDetails.length)} bytes\n**Max Size:** ${Math.max(...failureDetails.map(d => d.payload_size))} bytes`,
                inline: true,
              },
            ],
            footer: {
              text: `Queue: ${queueName} | Environment: ${Deno.env.get('ENVIRONMENT') || 'unknown'}`,
            },
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
  cfId: string,
): Promise<Response> {
  const headers = {
    'Content-Type': 'application/json',
    'apisecret': getEnv(c as any, 'API_SECRET'),
    'x-capgo-cf-id': cfId,
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

// Helper function to mass update queue messages with CF IDs
async function mass_edit_queue_messages_cf_ids(
  sql: ReturnType<typeof getPgClient>,
  updates: Array<{ msg_id: number, cf_id: string, queue: string }>,
) {
  try {
    // Build the array of ROW values as a string
    const rowValues = updates.map(u =>
      `ROW(${u.msg_id}::bigint, '${u.cf_id}'::varchar, '${u.queue}'::varchar)::message_update`,
    ).join(',')

    await sql.unsafe(`
      SELECT mass_edit_queue_messages_cf_ids(
        ARRAY[${rowValues}]
      )
    `)
  }
  catch (error) {
    console.error('[Mass Edit CF IDs] Error updating CF IDs:', error)
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
