import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { WebhookPayload } from '../utils/webhook.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog, cloudlogErr, serializeError } from '../utils/logging.ts'
import { sendNotifOrg } from '../utils/notifications.ts'
import { backgroundTask } from '../utils/utils.ts'
import {
  deliverWebhook,
  getDeliveryById,
  getWebhookById,
  incrementAttemptCount,
  markDeliveryFailed,
  queueWebhookDeliveryWithDelay,
  updateDeliveryResult,

} from '../utils/webhook.ts'

export const app = new Hono<MiddlewareKeyVariables>()

interface DeliveryMessage {
  delivery_id: string
  webhook_id: string
  url: string
  payload: WebhookPayload
}

/**
 * Webhook Delivery Handler
 *
 * This trigger processes individual webhook deliveries.
 *
 * Flow:
 * 1. Receive delivery data from queue
 * 2. Deliver the webhook to the user's endpoint
 * 3. On success: mark as success
 * 4. On failure: retry with exponential backoff (up to 3 attempts)
 * 5. After max retries: mark as failed and send notification via Bento
 */
app.post('/', middlewareAPISecret, async (c) => {
  try {
    const body = await c.req.json()

    // Extract delivery data from the queue message
    const deliveryData: DeliveryMessage = body.payload || body

    cloudlog({
      requestId: c.get('requestId'),
      message: 'Webhook delivery handler received',
      deliveryId: deliveryData.delivery_id,
      webhookId: deliveryData.webhook_id,
      url: deliveryData.url,
    })

    if (!deliveryData.delivery_id || !deliveryData.webhook_id || !deliveryData.url || !deliveryData.payload) {
      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'Invalid delivery data',
        deliveryData,
      })
      return c.json(BRES)
    }

    // Get the current delivery record
    const delivery = await getDeliveryById(c, deliveryData.delivery_id)
    if (!delivery) {
      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'Delivery record not found',
        deliveryId: deliveryData.delivery_id,
      })
      return c.json(BRES)
    }

    // Skip if already completed successfully
    if (delivery.status === 'success') {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'Delivery already successful, skipping',
        deliveryId: deliveryData.delivery_id,
      })
      return c.json(BRES)
    }

    // Increment attempt count
    const attemptCount = await incrementAttemptCount(c, deliveryData.delivery_id)

    // Attempt delivery
    const result = await deliverWebhook(
      c,
      deliveryData.delivery_id,
      deliveryData.url,
      deliveryData.payload,
    )

    // Update delivery record with result
    await updateDeliveryResult(
      c,
      deliveryData.delivery_id,
      result.success,
      result.status || null,
      result.body || null,
      result.duration || 0,
    )

    if (result.success) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'Webhook delivered successfully',
        deliveryId: deliveryData.delivery_id,
        status: result.status,
        duration: result.duration,
      })
      return c.json(BRES)
    }

    // Handle failure
    const maxAttempts = delivery.max_attempts || 3

    if (attemptCount < maxAttempts) {
      // Schedule retry with exponential backoff
      const retryDelaySeconds = 2 ** attemptCount * 60 // 2min, 4min, 8min

      cloudlog({
        requestId: c.get('requestId'),
        message: 'Scheduling webhook retry',
        deliveryId: deliveryData.delivery_id,
        attemptCount,
        maxAttempts,
        retryDelaySeconds,
      })

      // Queue for retry
      await backgroundTask(c, queueWebhookDeliveryWithDelay(
        c,
        deliveryData.delivery_id,
        deliveryData.webhook_id,
        deliveryData.url,
        deliveryData.payload,
        retryDelaySeconds,
      ))
    }
    else {
      // Max retries reached, mark as permanently failed
      await markDeliveryFailed(c, deliveryData.delivery_id)

      cloudlog({
        requestId: c.get('requestId'),
        message: 'Webhook delivery permanently failed',
        deliveryId: deliveryData.delivery_id,
        attemptCount,
        maxAttempts,
      })

      // Get webhook details for notification
      const webhook = await getWebhookById(c, deliveryData.webhook_id)

      if (webhook) {
        // Send failure notification via Bento
        await backgroundTask(c, sendNotifOrg(
          c,
          'webhook:delivery_failed',
          {
            webhook_name: webhook.name,
            webhook_url: webhook.url,
            event_type: deliveryData.payload.event,
            attempts: attemptCount,
            last_error: result.body?.slice(0, 500) || 'Unknown error',
            delivery_id: deliveryData.delivery_id,
          },
          webhook.org_id,
          `webhook_failure_${webhook.id}_${deliveryData.payload.event_id}`,
          '0 0 * * *', // Rate limit to once per day per webhook+event
        ))

        cloudlog({
          requestId: c.get('requestId'),
          message: 'Sent webhook failure notification',
          webhookId: webhook.id,
          webhookName: webhook.name,
          orgId: webhook.org_id,
        })
      }
    }

    return c.json(BRES)
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Webhook delivery handler error',
      error: serializeError(error),
    })
    return c.json(BRES)
  }
})
