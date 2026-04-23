import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
// --- Worker logic imports ---
import { z } from 'zod/mini'
import { sendDiscordAlert } from '../utils/discord.ts'
import { BRES, middlewareAPISecret, parseBody, simpleError } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { closeClient, getPgClient } from '../utils/pg.ts'
import { backgroundTask, getEnv } from '../utils/utils.ts'

// Define constants
const DEFAULT_BATCH_SIZE = 950 // Default batch size for queue reads limit of CF is 1000 fetches so we take a safe margin
export const MAX_QUEUE_READS = 5
const DISCORD_IGNORED_ERROR_CODES = new Set(['version_not_found', 'no_channel'])

// Zod schema for a message object
export const messageSchema = z.object({
  msg_id: z.coerce.number(),
  read_ct: z.coerce.number(),
  message: z.looseObject({
    payload: z.optional(z.unknown()),
    function_name: z.string(),
    function_type: z.nullable(z.optional(z.enum(['cloudflare', 'cloudflare_pp', '']))),
  }),
})

interface Message {
  msg_id: number
  read_ct: number
  message: {
    payload?: any
    function_name: string
    function_type?: 'cloudflare' | 'cloudflare_pp' | '' | null
    [key: string]: unknown
  }
}

export const messagesArraySchema = z.array(messageSchema)

interface FailureDetail {
  function_name: string
  function_type: string
  msg_id: number
  read_count: number
  status: number
  status_text: string
  error_code?: string
  error_message?: string
  response_body?: string
  payload_size: number
  cf_id: string
}

function extractMessageBody(message: Message): Record<string, unknown> {
  if (message.message?.payload !== undefined)
    return (message.message.payload ?? {}) as Record<string, unknown>

  const { function_name: _functionName, function_type: _functionType, ...legacyBody } = message.message ?? {}
  return legacyBody
}

function getActionableQueueFailures(failureDetails: FailureDetail[]): FailureDetail[] {
  return failureDetails.filter((detail) => {
    if (detail.read_count < MAX_QUEUE_READS)
      return false
    return !detail.error_code || !DISCORD_IGNORED_ERROR_CODES.has(detail.error_code)
  })
}

function truncateDiscordField(value: string, maxLength = 1024): string {
  if (value.length <= maxLength)
    return value
  return `${value.slice(0, maxLength - 15)}... (truncated)`
}

function sanitizeDiscordResponseBody(value: string): string {
  return value
    .replace(/[\w.%+-]+@[\w.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\b(Bearer\s+)[\w.~+/-]+=*/gi, '$1[REDACTED_TOKEN]')
    .replace(/((?:api[-_]?key|token|authorization|password|secret|access[-_]?token|refresh[-_]?token)["']?\s*[:=]\s*["']?)([^"',\s}]+)/gi, '$1[REDACTED]')
    .replace(/\b[\dA-F]{32,}\b/gi, '[REDACTED_TOKEN]')
    .replace(/\b[\w+/=-]{40,}\b/g, '[REDACTED_TOKEN]')
}

// Helper function to generate UUID v4
function generateUUID(): string {
  return crypto.randomUUID()
}

async function processQueue(c: Context, db: ReturnType<typeof getPgClient>, queueName: string, batchSize: number = DEFAULT_BATCH_SIZE) {
  const messages = await readQueue(c, db, queueName, batchSize)

  if (!messages) {
    cloudlog(`[${queueName}] No messages found in queue or an error occurred.`)
    return
  }

  const [messagesToProcess, messagesToSkip] = messages.reduce((acc, message) => {
    acc[message.read_ct <= 5 ? 0 : 1].push(message)
    return acc
  }, [[], []] as [typeof messages, typeof messages])

  cloudlog(`[${queueName}] Processing ${messagesToProcess.length} messages and skipping ${messagesToSkip.length} messages.`)

  // Archive messages that have been read 5 or more times
  if (messagesToSkip.length > 0) {
    cloudlog(`[${queueName}] Archiving ${messagesToSkip.length} messages that have been read 5 or more times.`)
    await archive_queue_messages(c, db, queueName, messagesToSkip.map(msg => msg.msg_id))
  }

  // Process messages that have been read less than 5 times
  const results = await Promise.all(messagesToProcess.map(async (message) => {
    const function_name = message.message?.function_name ?? 'unknown'
    const function_type = message.message?.function_type ?? 'supabase'
    const body = extractMessageBody(message)
    if (message.message?.payload === undefined && Object.keys(body).length > 0) {
      cloudlog({
        requestId: c.get('requestId'),
        message: `[${queueName}] Using legacy queue message body shape for ${function_name}.`,
        msgId: message.msg_id,
      })
    }
    const cfId = generateUUID()
    const httpResponse = await http_post_helper(c, function_name, function_type, body, cfId)
    const errorDetails = await extractErrorDetails(httpResponse)

    return {
      httpResponse,
      errorDetails,
      cfId,
      payloadSize: JSON.stringify(body).length,
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
    cloudlog({ requestId: c.get('requestId'), message: `[${queueName}] Updating ${cfIdUpdates.length} messages with CF IDs.` })
    await mass_edit_queue_messages_cf_ids(c, db, cfIdUpdates)
  }

  // Batch remove all messages that have succeeded
  // const successMessages = results.filter(result => result.httpResponse.status >= 200 && result.httpResponse.status < 300)
  const [successMessages, messagesFailed] = results.reduce((acc, result) => {
    acc[(result.httpResponse.status >= 200 && result.httpResponse.status < 300) ? 0 : 1].push(result)
    return acc
  }, [[], []] as [typeof results, typeof results])
  if (successMessages.length > 0) {
    cloudlog({ requestId: c.get('requestId'), message: `[${queueName}] Deleting ${successMessages.length} successful messages from queue.` })
    await delete_queue_message_batch(c, db, queueName, successMessages.map(msg => msg.msg_id))
  }
  if (messagesFailed.length > 0) {
    cloudlog({ requestId: c.get('requestId'), message: `[${queueName}] Failed to process ${messagesFailed.length} messages.` })

    const timestamp = new Date().toISOString()
    const failureDetails = messagesFailed.map(msg => ({
      function_name: msg.message?.function_name ?? 'unknown',
      function_type: msg.message?.function_type ?? 'supabase',
      msg_id: msg.msg_id,
      read_count: msg.read_ct,
      status: msg.httpResponse.status,
      status_text: msg.httpResponse.statusText,
      error_code: msg.errorDetails.errorCode ?? undefined,
      error_message: msg.errorDetails.errorMessage ?? undefined,
      response_body: msg.errorDetails.bodyPreview ?? undefined,
      payload_size: msg.payloadSize,
      cf_id: msg.cfId,
    }))

    const actionableFailures = getActionableQueueFailures(failureDetails)

    const groupedByFunction = actionableFailures.reduce((acc, detail) => {
      const key = detail.function_name
      acc[key] ??= []
      acc[key].push(detail)
      return acc
    }, {} as Record<string, typeof actionableFailures>)

    if (actionableFailures.length > 0) {
      await sendDiscordAlert(c, {
        content: `🚨 **Queue Processing Failures** - ${queueName}`,
        embeds: [
          {
            title: `❌ ${actionableFailures.length} Messages Failed Processing`,
            description: `**Queue:** ${queueName}\n**Failed Functions:** ${Object.keys(groupedByFunction).length}\n**Total Failures:** ${actionableFailures.length}`,
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
                value: truncateDiscordField(actionableFailures.slice(0, 10).map((detail) => {
                  const cfLogUrl = `https://dash.cloudflare.com/${getEnv(c, 'CF_ACCOUNT_ANALYTICS_ID')}/workers/services/view/capgo_api-prod/production/observability/logs?workers-observability-view=%22invocations%22&filters=%5B%7B%22key%22%3A%22%24workers.event.request.headers.x-capgo-cf-id%22%2C%22type%22%3A%22string%22%2C%22value%22%3A%22${detail.cf_id}%22%2C%22operation%22%3A%22eq%22%7D%5D`
                  const errorInfo = detail.error_code ? ` | Error: ${detail.error_code}` : ''
                  const messageInfo = detail.error_message ? ` | ${truncateDiscordField(detail.error_message.replace(/\s+/g, ' ').trim(), 180)}` : ''
                  return `**${detail.function_name}** | Status: ${detail.status} | Read: ${detail.read_count}/${MAX_QUEUE_READS}${errorInfo}${messageInfo} | [CF Logs](${cfLogUrl})`
                }).join('\n')),
                inline: false,
              },
              {
                name: '📈 Status Code Distribution',
                value: Object.entries(
                  actionableFailures.reduce((acc, detail) => {
                    acc[detail.status] = (acc[detail.status] ?? 0) + 1
                    return acc
                  }, {} as Record<number, number>),
                ).map(([status, count]) => `**${status}:** ${count}`).join(' | '),
                inline: false,
              },
              {
                name: '⚠️ Retry Analysis',
                value: `**Retry Budget Exhausted:** ${actionableFailures.length}\n**Will Archive:** ${actionableFailures.length}`,
                inline: true,
              },
              {
                name: '📦 Payload Info',
                value: `**Avg Size:** ${Math.round(actionableFailures.reduce((sum, d) => sum + d.payload_size, 0) / actionableFailures.length)} bytes\n**Max Size:** ${Math.max(...actionableFailures.map(d => d.payload_size))} bytes`,
                inline: true,
              },
              {
                name: '🧾 Sanitized Response Body',
                value: truncateDiscordField(actionableFailures
                  .map(detail => detail.response_body ? `**${detail.function_name}:** ${sanitizeDiscordResponseBody(detail.response_body)}` : `**${detail.function_name}:** (empty)`)
                  .join('\n')),
                inline: false,
              },
            ],
            footer: {
              text: `Queue: ${queueName} | Environment: ${getEnv(c, 'ENVIRONMENT') ?? 'unknown'}`,
            },
          },
        ],
      })
    }
    else {
      cloudlog({
        requestId: c.get('requestId'),
        message: `[${queueName}] Suppressed Discord alert for retryable or ignored queue failures.`,
        retryingFailures: failureDetails.filter(detail => detail.read_count < MAX_QUEUE_READS).length,
        ignoredErrors: Array.from(DISCORD_IGNORED_ERROR_CODES),
      })
    }
    // set visibility timeout to random number to prevent Auto DDOS
  }

  if (successMessages.length !== messagesToProcess.length) {
    cloudlog({ requestId: c.get('requestId'), message: `[${queueName}] ${successMessages.length} messages were processed successfully, ${messagesToProcess.length - successMessages.length} messages failed.` })
  }
  else {
    cloudlog({ requestId: c.get('requestId'), message: `[${queueName}] All messages were processed successfully.` })
  }
}

async function extractErrorDetails(response: Response): Promise<{
  errorCode: string | null
  errorMessage: string | null
  bodyPreview: string | null
}> {
  if (response.status < 400) {
    return {
      bodyPreview: null,
      errorCode: null,
      errorMessage: null,
    }
  }
  const cloned = response.clone()
  const contentType = cloned.headers.get('content-type') ?? ''
  let payload: any = null
  let bodyPreview: string | null = null
  try {
    if (contentType.includes('application/json')) {
      const text = await cloned.text()
      bodyPreview = text.slice(0, 500)
      payload = text ? JSON.parse(text) : null
    }
    else {
      const text = await cloned.text()
      bodyPreview = text ? text.slice(0, 500) : null
      if (text) {
        try {
          payload = JSON.parse(text)
        }
        catch {
          payload = null
        }
      }
    }
  }
  catch {
    payload = null
  }
  if (payload && typeof payload === 'object') {
    const errorCode = payload.error ?? payload.errorCode
    const errorMessage = payload.message ?? payload.errorMessage
    if (typeof errorCode === 'string') {
      return {
        bodyPreview,
        errorCode,
        errorMessage: typeof errorMessage === 'string' ? errorMessage : null,
      }
    }
  }
  return {
    bodyPreview,
    errorCode: null,
    errorMessage: null,
  }
}

// Reads messages from the queue and logs them
async function readQueue(c: Context, db: ReturnType<typeof getPgClient>, queueName: string, batchSize: number = DEFAULT_BATCH_SIZE): Promise<Message[]> {
  const queueKey = 'readQueue'
  const startTime = Date.now()
  let messages: Message[] = []

  cloudlog({ requestId: c.get('requestId'), message: `[${queueKey}] Starting queue read at ${startTime}.` })

  try {
    const visibilityTimeout = 120
    cloudlog(`[${queueKey}] Reading messages from queue: ${queueName}`)
    try {
      const result = await db.query(
        'SELECT msg_id, message, read_ct FROM pgmq.read($1, $2, $3)',
        [queueName, visibilityTimeout, batchSize],
      )
      messages = result.rows
    }
    catch (readError) {
      throw simpleError('error_reading_from_pgmq_queue', 'Error reading from pgmq queue', { queueName }, readError)
    }

    if (!messages || (messages && messages.length === 0)) {
      cloudlog({ requestId: c.get('requestId'), message: `[${queueKey}] No new messages found in queue ${queueName}.` })
      return messages
    }

    cloudlog({ requestId: c.get('requestId'), message: `[${queueKey}] Received ${messages.length} messages from queue ${queueName}.` })
    const parsed = messagesArraySchema.safeParse(messages)
    if (parsed.success) {
      return parsed.data as Message[]
    }
    else {
      throw simpleError('invalid_message_format', 'Invalid message format', { parsed: parsed.error })
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: `[${queueKey}] Error reading queue messages:`, error })
  }
  finally {
    cloudlog({ requestId: c.get('requestId'), message: `[${queueKey}] Finished reading queue messages in ${Date.now() - startTime}ms.` })
  }
  return messages
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
    'apisecret': getEnv(c, 'API_SECRET'),
    'x-capgo-cf-id': cfId,
  }

  let url: string
  const cfPpUrl = getEnv(c, 'CLOUDFLARE_PP_FUNCTION_URL')
  const cfUrl = getEnv(c, 'CLOUDFLARE_FUNCTION_URL')
  const normalizedType = (function_type ?? '').trim()

  if (normalizedType === 'cloudflare_pp' && cfPpUrl) {
    url = `${cfPpUrl}/triggers/${function_name}`
  }
  else if (normalizedType === 'cloudflare' && cfUrl) {
    url = `${cfUrl}/triggers/${function_name}`
  }
  else if (normalizedType === '' && cfUrl) {
    // Backward compatibility: older queue messages may not have function_type set.
    // If a Cloudflare URL is configured, prefer it.
    url = `${cfUrl}/triggers/${function_name}`
  }
  else {
    url = `${getEnv(c, 'SUPABASE_URL')}/functions/v1/triggers/${function_name}`
  }

  // Create an AbortController for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)
  // 15 second timeout, as the queue consumer is running every 10 seconds and the visibility timeout is 60 seconds

  try {
    cloudlog({ requestId: c.get('requestId'), message: `[${function_name}] Making HTTP POST request to "${url}" with body:`, body })
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      // signal: controller.signal,
    })
    return response
  }
  catch (error) {
    throw simpleError('request_timeout', 'Request Timeout (Internal QUEUE handling error)', { function_name }, error)
  }
  finally {
    clearTimeout(timeoutId)
  }
}

// Helper function to delete multiple messages from the queue in a single batch
async function delete_queue_message_batch(c: Context, db: ReturnType<typeof getPgClient>, queueName: string, msgIds: number[]) {
  try {
    if (msgIds.length === 0)
      return
    // Use pg's array syntax
    await db.query(
      'SELECT pgmq.delete($1, $2::bigint[])',
      [queueName, msgIds],
    )
  }
  catch (error) {
    throw simpleError('error_deleting_queue_messages', 'Error deleting queue messages', { msgIds, queueName }, error)
  }
}

// Helper function to archive multiple messages from the queue in a single batch
async function archive_queue_messages(c: Context, db: ReturnType<typeof getPgClient>, queueName: string, msgIds: number[]) {
  try {
    if (msgIds.length === 0)
      return
    // Use pg's array syntax
    await db.query(
      'SELECT pgmq.archive($1, $2::bigint[])',
      [queueName, msgIds],
    )
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    const msgIdsTruncated = msgIds.length > 20 ? msgIds.slice(0, 20) : msgIds

    cloudlogErr({
      requestId: c.get('requestId'),
      message: `[${queueName}] Failed to archive ${msgIds.length} messages`,
      error,
      errorMessage,
      errorStack,
      queueName,
      msgIds: msgIdsTruncated,
      msgIdsLength: msgIds.length,
    })

    throw simpleError('error_archiving_queue_messages', `Error archiving queue messages: ${errorMessage}`, { msgIds: msgIdsTruncated, msgIdsLength: msgIds.length, queueName, errorMessage }, error)
  }
}

// Helper function to mass update queue messages with CF IDs
async function mass_edit_queue_messages_cf_ids(
  c: Context,
  db: ReturnType<typeof getPgClient>,
  updates: Array<{ msg_id: number, cf_id: string, queue: string }>,
) {
  try {
    // Build the array of ROW values as a string
    // Note: With pg library, we need to sanitize values to prevent SQL injection
    const rowValues = updates.map((u) => {
      // Escape single quotes in cf_id and queue
      const escapedCfId = u.cf_id.replace(/'/g, '\'\'')
      const escapedQueue = u.queue.replace(/'/g, '\'\'')
      return `ROW(${u.msg_id}::bigint, '${escapedCfId}'::varchar, '${escapedQueue}'::varchar)::message_update`
    }).join(',')

    await db.query(`
      SELECT mass_edit_queue_messages_cf_ids(
        ARRAY[${rowValues}]
      )
    `)
  }
  catch (error) {
    throw simpleError('error_updating_cf_ids', 'Error updating CF IDs', {}, error)
  }
}

// --- Hono app setup ---
export const app = new Hono<MiddlewareKeyVariables>()

// /health endpoint
app.get('/health', (c) => {
  return c.text('OK', 200)
})

app.use('/sync', middlewareAPISecret)

// /sync endpoint
app.post('/sync', async (c) => {
  const handlerStart = Date.now()
  cloudlog({ requestId: c.get('requestId'), message: `[Sync Request] Received trigger to process queue.` })

  // Require JSON body with queue_name and optional batch_size
  const body = await parseBody<{ queue_name: string, batch_size?: number }>(c)
  const queueName = body?.queue_name
  const batchSize = body?.batch_size

  if (!queueName || typeof queueName !== 'string') {
    throw simpleError('missing_or_invalid_queue_name', 'Missing or invalid queue_name in body', { body })
  }

  // Only validate when batchSize is explicitly provided
  if (batchSize !== undefined) {
    if (typeof batchSize !== 'number' || batchSize <= 0) {
      throw simpleError('invalid_batch_size', 'batch_size must be a positive number', { batchSize })
    }
  }

  // Compute finalBatchSize: use provided batchSize capped with DEFAULT_BATCH_SIZE, or fall back to DEFAULT_BATCH_SIZE
  const finalBatchSize = batchSize !== undefined ? Math.min(batchSize, DEFAULT_BATCH_SIZE) : DEFAULT_BATCH_SIZE

  await backgroundTask(c, (async () => {
    cloudlog({ requestId: c.get('requestId'), message: `[Background Queue Sync] Starting background execution for queue: ${queueName} with batch size: ${finalBatchSize}` })
    let db: ReturnType<typeof getPgClient> | null = null
    try {
      db = getPgClient(c)
      await processQueue(c, db, queueName, finalBatchSize)
      cloudlog({ requestId: c.get('requestId'), message: `[Background Queue Sync] Background execution finished successfully.` })
    }
    finally {
      if (db)
        await closeClient(c, db)
      cloudlog({ requestId: c.get('requestId'), message: `[Background Queue Sync] PostgreSQL connection closed.` })
    }
  })())
  cloudlog({ requestId: c.get('requestId'), message: `[Sync Request] Responding 202 Accepted. Time: ${Date.now() - handlerStart}ms` })
  return c.json(BRES, 202)
})

export const __queueConsumerTestUtils__ = {
  extractErrorDetails,
  extractMessageBody,
  getActionableQueueFailures,
  sanitizeDiscordResponseBody,
}
