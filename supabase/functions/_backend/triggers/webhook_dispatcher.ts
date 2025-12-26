import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog, cloudlogErr, serializeError } from '../utils/logging.ts'
import { backgroundTask } from '../utils/utils.ts'
import {
  type AuditLogData,
  buildWebhookPayload,
  createDeliveryRecord,
  findWebhooksForEvent,
  queueWebhookDelivery,
} from '../utils/webhook.ts'

export const app = new Hono<MiddlewareKeyVariables>()

/**
 * Webhook Dispatcher
 *
 * This trigger receives audit_log events and dispatches them to all
 * enabled webhooks for the organization that subscribe to the event type.
 *
 * Flow:
 * 1. Receive audit_log data from queue
 * 2. Find all enabled webhooks for the org that subscribe to this table
 * 3. For each webhook, create a delivery record
 * 4. Queue individual delivery messages for processing
 */
app.post('/', middlewareAPISecret, async (c) => {
  try {
    const body = await c.req.json()

    // Extract audit log data from the queue message
    const auditLogData: AuditLogData = body.payload || body

    cloudlog({
      requestId: c.get('requestId'),
      message: 'Webhook dispatcher received event',
      tableName: auditLogData.table_name,
      operation: auditLogData.operation,
      orgId: auditLogData.org_id,
      recordId: auditLogData.record_id,
    })

    if (!auditLogData.org_id || !auditLogData.table_name || !auditLogData.operation) {
      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'Invalid audit log data',
        auditLogData,
      })
      return c.json(BRES)
    }

    // Find all enabled webhooks for this org that subscribe to this table
    const webhooks = await findWebhooksForEvent(c, auditLogData.org_id, auditLogData.table_name)

    if (webhooks.length === 0) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'No webhooks found for event',
        tableName: auditLogData.table_name,
        orgId: auditLogData.org_id,
      })
      return c.json(BRES)
    }

    cloudlog({
      requestId: c.get('requestId'),
      message: 'Found webhooks for event',
      count: webhooks.length,
      tableName: auditLogData.table_name,
    })

    // Build the webhook payload
    const payload = buildWebhookPayload(auditLogData)
    const eventType = `${auditLogData.table_name}.${auditLogData.operation}`

    // Process each webhook
    await backgroundTask(c, Promise.all(webhooks.map(async (webhook) => {
      try {
        // Create a delivery record
        const delivery = await createDeliveryRecord(
          c,
          webhook.id,
          webhook.org_id,
          auditLogData.audit_log_id,
          eventType,
          payload,
        )

        if (!delivery) {
          cloudlogErr({
            requestId: c.get('requestId'),
            message: 'Failed to create delivery record',
            webhookId: webhook.id,
          })
          return
        }

        // Queue the delivery for processing
        await queueWebhookDelivery(
          c,
          delivery.id,
          webhook.id,
          webhook.url,
          payload,
        )

        cloudlog({
          requestId: c.get('requestId'),
          message: 'Queued webhook delivery',
          deliveryId: delivery.id,
          webhookId: webhook.id,
          webhookName: webhook.name,
        })
      }
      catch (error) {
        cloudlogErr({
          requestId: c.get('requestId'),
          message: 'Error processing webhook',
          webhookId: webhook.id,
          error: serializeError(error),
        })
      }
    })))

    return c.json(BRES)
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Webhook dispatcher error',
      error: serializeError(error),
    })
    return c.json(BRES)
  }
})
