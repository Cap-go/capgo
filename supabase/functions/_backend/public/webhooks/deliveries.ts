import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { simpleError } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
import {
  getDeliveryById,
  getWebhookById,
  queueWebhookDelivery,
} from '../../utils/webhook.ts'
import { checkWebhookPermission } from './index.ts'

const getDeliveriesSchema = z.object({
  orgId: z.string(),
  webhookId: z.string(),
  page: z.optional(z.number()),
  status: z.optional(z.string()), // 'pending', 'success', 'failed'
})

const retryDeliverySchema = z.object({
  orgId: z.string(),
  deliveryId: z.string(),
})

const DELIVERIES_PER_PAGE = 50

export async function getDeliveries(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = getDeliveriesSchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  await checkWebhookPermission(c, body.orgId, apikey)

  // Verify webhook belongs to org
  // Note: Using type assertion as webhooks table types are not yet generated
  const { data: webhook, error: webhookError } = await (supabaseAdmin(c) as any)
    .from('webhooks')
    .select('id, org_id')
    .eq('id', body.webhookId)
    .single()

  if (webhookError || !webhook) {
    throw simpleError('webhook_not_found', 'Webhook not found', { webhookId: body.webhookId })
  }

  if (webhook.org_id !== body.orgId) {
    throw simpleError('no_permission', 'Webhook does not belong to this organization', { webhookId: body.webhookId })
  }

  // Build query
  const page = body.page ?? 0
  const from = page * DELIVERIES_PER_PAGE
  const to = (page + 1) * DELIVERIES_PER_PAGE - 1

  let query = (supabaseAdmin(c) as any)
    .from('webhook_deliveries')
    .select('*')
    .eq('webhook_id', body.webhookId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (body.status) {
    query = query.eq('status', body.status)
  }

  const { data, error } = await query

  if (error) {
    throw simpleError('cannot_get_deliveries', 'Cannot get deliveries', { error })
  }

  // Get total count for pagination
  const { count } = await (supabaseAdmin(c) as any)
    .from('webhook_deliveries')
    .select('*', { count: 'exact', head: true })
    .eq('webhook_id', body.webhookId)

  return c.json({
    deliveries: data,
    pagination: {
      page,
      per_page: DELIVERIES_PER_PAGE,
      total: count ?? 0,
      has_more: (data?.length ?? 0) === DELIVERIES_PER_PAGE,
    },
  })
}

export async function retryDelivery(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = retryDeliverySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  await checkWebhookPermission(c, body.orgId, apikey)

  // Get delivery
  const delivery = await getDeliveryById(c, body.deliveryId)
  if (!delivery) {
    throw simpleError('delivery_not_found', 'Delivery not found', { deliveryId: body.deliveryId })
  }

  if (delivery.org_id !== body.orgId) {
    throw simpleError('no_permission', 'Delivery does not belong to this organization', { deliveryId: body.deliveryId })
  }

  // Can only retry failed deliveries
  if (delivery.status === 'success') {
    throw simpleError('already_successful', 'Delivery was already successful', { deliveryId: body.deliveryId })
  }

  // Get webhook for URL
  const webhook = await getWebhookById(c, delivery.webhook_id)
  if (!webhook) {
    throw simpleError('webhook_not_found', 'Associated webhook not found')
  }

  if (!webhook.enabled) {
    throw simpleError('webhook_disabled', 'Webhook is disabled')
  }

  // Reset delivery status and queue for retry
  await (supabaseAdmin(c) as any)
    .from('webhook_deliveries')
    .update({
      status: 'pending',
      attempt_count: 0,
      response_status: null,
      response_body: null,
      completed_at: null,
      duration_ms: null,
      next_retry_at: null,
    })
    .eq('id', body.deliveryId)

  // Queue for immediate delivery
  await queueWebhookDelivery(
    c,
    delivery.id,
    webhook.id,
    webhook.url,
    delivery.request_payload,
  )

  return c.json({
    status: 'Delivery queued for retry',
    deliveryId: body.deliveryId,
  })
}
