import type { Context } from 'hono'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { closeClient, getPgClient } from './pg.ts'
import { supabaseAdmin } from './supabase.ts'

// Webhook payload structure sent to user endpoints
export interface WebhookPayload {
  event: string // e.g., 'app_versions.INSERT'
  event_id: string // Unique event identifier
  timestamp: string // ISO timestamp
  org_id: string // Organization ID
  data: {
    table: string
    operation: string
    record_id: string
    old_record: any | null
    new_record: any | null
    changed_fields: string[] | null
  }
}

// Audit log data from the database trigger
export interface AuditLogData {
  audit_log_id: number
  table_name: string
  operation: string
  org_id: string
  record_id: string
  old_record: any | null
  new_record: any | null
  changed_fields: string[] | null
  user_id: string | null
  created_at: string
}

// Webhook database row
export interface Webhook {
  id: string
  org_id: string
  name: string
  url: string
  enabled: boolean
  events: string[]
  created_at: string
  updated_at: string
  created_by: string | null
}

// Webhook delivery database row
export interface WebhookDelivery {
  id: string
  webhook_id: string
  org_id: string
  audit_log_id: number | null
  event_type: string
  status: 'pending' | 'success' | 'failed'
  request_payload: WebhookPayload
  response_status: number | null
  response_body: string | null
  response_headers: Record<string, string> | null
  attempt_count: number
  max_attempts: number
  next_retry_at: string | null
  created_at: string
  completed_at: string | null
  duration_ms: number | null
}

// Supported event types that users can subscribe to
export const WEBHOOK_EVENT_TYPES = [
  'app_versions', // Bundle changes (INSERT, UPDATE, DELETE)
  'channels', // Channel updates
  'org_users', // Member changes
  'orgs', // Organization changes
] as const

export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number]

/**
 * Build a webhook payload from audit log data
 */
export function buildWebhookPayload(auditLogData: AuditLogData): WebhookPayload {
  return {
    event: `${auditLogData.table_name}.${auditLogData.operation}`,
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    org_id: auditLogData.org_id,
    data: {
      table: auditLogData.table_name,
      operation: auditLogData.operation,
      record_id: auditLogData.record_id,
      old_record: auditLogData.old_record,
      new_record: auditLogData.new_record,
      changed_fields: auditLogData.changed_fields,
    },
  }
}

/**
 * Find all enabled webhooks for an organization that subscribe to a specific event
 */
export async function findWebhooksForEvent(
  c: Context,
  orgId: string,
  tableName: string,
): Promise<Webhook[]> {
  const { data: webhooks, error } = await supabaseAdmin(c)
    .from('webhooks')
    .select('*')
    .eq('org_id', orgId)
    .eq('enabled', true)
    .contains('events', [tableName])

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error finding webhooks', error: serializeError(error) })
    return []
  }

  return webhooks || []
}

/**
 * Create a webhook delivery record
 */
export async function createDeliveryRecord(
  c: Context,
  webhookId: string,
  orgId: string,
  auditLogId: number | null,
  eventType: string,
  payload: WebhookPayload,
): Promise<WebhookDelivery | null> {
  const { data: delivery, error } = await supabaseAdmin(c)
    .from('webhook_deliveries')
    .insert({
      webhook_id: webhookId,
      org_id: orgId,
      audit_log_id: auditLogId,
      event_type: eventType,
      request_payload: payload,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error creating delivery record', error: serializeError(error) })
    return null
  }

  return delivery as WebhookDelivery
}

/**
 * Deliver a webhook to the user's endpoint
 */
export async function deliverWebhook(
  c: Context,
  deliveryId: string,
  url: string,
  payload: WebhookPayload,
): Promise<{ success: boolean, status?: number, body?: string, duration?: number }> {
  const startTime = Date.now()
  const payloadString = JSON.stringify(payload)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Capgo-Webhook/1.0',
    'X-Capgo-Event': payload.event,
    'X-Capgo-Event-ID': payload.event_id,
    'X-Capgo-Timestamp': payload.timestamp,
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const duration = Date.now() - startTime
    const responseBody = await response.text()

    cloudlog({
      requestId: c.get('requestId'),
      message: 'Webhook delivery attempt',
      deliveryId,
      url,
      status: response.status,
      success: response.ok,
      duration,
    })

    return {
      success: response.ok,
      status: response.status,
      body: responseBody.slice(0, 10000), // Limit stored body size
      duration,
    }
  }
  catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Webhook delivery failed',
      deliveryId,
      url,
      error: errorMessage,
      duration,
    })

    return {
      success: false,
      body: `Error: ${errorMessage}`,
      duration,
    }
  }
}

/**
 * Update delivery record with result
 */
export async function updateDeliveryResult(
  c: Context,
  deliveryId: string,
  success: boolean,
  responseStatus: number | null,
  responseBody: string | null,
  duration: number,
): Promise<void> {
  const { error } = await supabaseAdmin(c)
    .from('webhook_deliveries')
    .update({
      status: success ? 'success' : 'failed',
      response_status: responseStatus,
      response_body: responseBody,
      completed_at: new Date().toISOString(),
      duration_ms: duration,
    })
    .eq('id', deliveryId)

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error updating delivery result', error: serializeError(error) })
  }
}

/**
 * Increment attempt count for a delivery
 */
export async function incrementAttemptCount(
  c: Context,
  deliveryId: string,
): Promise<number> {
  const { data, error } = await supabaseAdmin(c)
    .from('webhook_deliveries')
    .select('attempt_count')
    .eq('id', deliveryId)
    .single()

  if (error || !data) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error getting attempt count', error: serializeError(error) })
    return 0
  }

  const newCount = data.attempt_count + 1

  await supabaseAdmin(c)
    .from('webhook_deliveries')
    .update({ attempt_count: newCount })
    .eq('id', deliveryId)

  return newCount
}

/**
 * Schedule a retry for a failed delivery
 */
export async function scheduleRetry(
  c: Context,
  deliveryId: string,
  attemptCount: number,
): Promise<void> {
  // Exponential backoff: 2min, 4min, 8min
  const retryDelaySeconds = 2 ** attemptCount * 60

  const nextRetryAt = new Date(Date.now() + retryDelaySeconds * 1000).toISOString()

  const { error } = await supabaseAdmin(c)
    .from('webhook_deliveries')
    .update({
      next_retry_at: nextRetryAt,
      status: 'pending',
    })
    .eq('id', deliveryId)

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error scheduling retry', error: serializeError(error) })
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Scheduled webhook retry',
    deliveryId,
    attemptCount,
    nextRetryAt,
    retryDelaySeconds,
  })
}

/**
 * Mark a delivery as permanently failed
 */
export async function markDeliveryFailed(
  c: Context,
  deliveryId: string,
): Promise<void> {
  const { error } = await supabaseAdmin(c)
    .from('webhook_deliveries')
    .update({
      status: 'failed',
      next_retry_at: null,
    })
    .eq('id', deliveryId)

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error marking delivery failed', error: serializeError(error) })
  }
}

/**
 * Get a webhook by ID
 */
export async function getWebhookById(
  c: Context,
  webhookId: string,
): Promise<Webhook | null> {
  const { data, error } = await supabaseAdmin(c)
    .from('webhooks')
    .select('*')
    .eq('id', webhookId)
    .single()

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error getting webhook', error: serializeError(error) })
    return null
  }

  return data as Webhook
}

/**
 * Get a delivery by ID
 */
export async function getDeliveryById(
  c: Context,
  deliveryId: string,
): Promise<WebhookDelivery | null> {
  const { data, error } = await supabaseAdmin(c)
    .from('webhook_deliveries')
    .select('*')
    .eq('id', deliveryId)
    .single()

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error getting delivery', error: serializeError(error) })
    return null
  }

  return data as WebhookDelivery
}

/**
 * Create a test webhook payload
 */
export function createTestPayload(orgId: string): WebhookPayload {
  return {
    event: 'test.ping',
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    org_id: orgId,
    data: {
      table: 'test',
      operation: 'TEST',
      record_id: 'test-record-id',
      old_record: null,
      new_record: {
        message: 'This is a test webhook from Capgo',
        timestamp: new Date().toISOString(),
      },
      changed_fields: null,
    },
  }
}

/**
 * Queue a webhook delivery message for processing using direct SQL via pg client
 */
export async function queueWebhookDelivery(
  c: Context,
  deliveryId: string,
  webhookId: string,
  url: string,
  payload: WebhookPayload,
): Promise<void> {
  const message = {
    function_name: 'webhook_delivery',
    function_type: 'cloudflare',
    payload: {
      delivery_id: deliveryId,
      webhook_id: webhookId,
      url,
      payload,
    },
  }

  const db = getPgClient(c)
  try {
    await db.query(
      'SELECT pgmq.send($1, $2::jsonb)',
      ['webhook_delivery', JSON.stringify(message)],
    )
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Queued webhook delivery',
      deliveryId,
      webhookId,
    })
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error queuing webhook delivery', error: serializeError(error) })
  }
  finally {
    closeClient(c, db)
  }
}

/**
 * Queue a webhook delivery with delay (for retries) using direct SQL via pg client
 */
export async function queueWebhookDeliveryWithDelay(
  c: Context,
  deliveryId: string,
  webhookId: string,
  url: string,
  payload: WebhookPayload,
  delaySeconds: number,
): Promise<void> {
  const message = {
    function_name: 'webhook_delivery',
    function_type: 'cloudflare',
    payload: {
      delivery_id: deliveryId,
      webhook_id: webhookId,
      url,
      payload,
    },
  }

  const db = getPgClient(c)
  try {
    // pgmq.send with delay parameter
    await db.query(
      'SELECT pgmq.send($1, $2::jsonb, $3)',
      ['webhook_delivery', JSON.stringify(message), delaySeconds],
    )
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Queued webhook delivery with delay',
      deliveryId,
      webhookId,
      delaySeconds,
    })
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error queuing webhook delivery with delay, falling back to immediate', error: serializeError(error) })
    // Fallback to regular queue without delay
    try {
      await db.query(
        'SELECT pgmq.send($1, $2::jsonb)',
        ['webhook_delivery', JSON.stringify(message)],
      )
    }
    catch (fallbackError) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Error in fallback queue', error: serializeError(fallbackError) })
    }
  }
  finally {
    closeClient(c, db)
  }
}
