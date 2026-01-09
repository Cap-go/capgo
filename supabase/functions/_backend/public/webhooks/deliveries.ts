import type { Context } from 'hono'
import type { AuthInfo, MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import type {
  WebhookPayload,
} from '../../utils/webhook.ts'
import { z } from 'zod/mini'
import { simpleError } from '../../utils/hono.ts'
import { supabaseApikey, supabaseWithAuth } from '../../utils/supabase.ts'
import {
  getDeliveryById,
  getWebhookById,
  queueWebhookDelivery,
} from '../../utils/webhook.ts'
import { checkWebhookPermission, checkWebhookPermissionV2 } from './index.ts'

const getDeliveriesSchema = z.object({
  orgId: z.string(),
  webhookId: z.string(),
  page: z.optional(z.coerce.number()),
  status: z.optional(z.string()), // 'pending', 'success', 'failed'
})

const retryDeliverySchema = z.object({
  orgId: z.string(),
  deliveryId: z.string(),
})

const DELIVERIES_PER_PAGE = 50

export async function getDeliveries(c: Context<MiddlewareKeyVariables, any, any>, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = getDeliveriesSchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  await checkWebhookPermission(c, body.orgId, apikey)

  // Use authenticated client - RLS will enforce access
  const supabase = supabaseApikey(c, c.get('capgkey'))

  // Verify webhook belongs to org
  // Note: Using type assertion as webhooks table types are not yet generated
  const { data: webhook, error: webhookError } = await supabase
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

  let query = supabase
    .from('webhook_deliveries')
    .select('*')
    .eq('webhook_id', body.webhookId)

  // Apply status filter before ordering and pagination
  if (body.status) {
    query = query.eq('status', body.status)
  }

  query = query.order('created_at', { ascending: false }).range(from, to)

  const { data, error } = await query

  if (error) {
    throw simpleError('cannot_get_deliveries', 'Cannot get deliveries', { error })
  }

  // Get total count for pagination (include status filter)
  let countQuery = supabase
    .from('webhook_deliveries')
    .select('*', { count: 'exact', head: true })
    .eq('webhook_id', body.webhookId)

  if (body.status) {
    countQuery = countQuery.eq('status', body.status)
  }

  const { count } = await countQuery

  const totalCount = count ?? 0
  const nextPageStart = (page + 1) * DELIVERIES_PER_PAGE

  return c.json({
    deliveries: data,
    pagination: {
      page,
      per_page: DELIVERIES_PER_PAGE,
      total: totalCount,
      has_more: nextPageStart < totalCount,
    },
  })
}

export async function retryDelivery(c: Context<MiddlewareKeyVariables, any, any>, bodyRaw: any, auth: AuthInfo): Promise<Response> {
  const bodyParsed = retryDeliverySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  await checkWebhookPermissionV2(c, body.orgId, auth)

  // Use authenticated client for data queries - RLS will enforce access
  const supabase = supabaseWithAuth(c, auth)

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
  await supabase
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
    delivery.request_payload as any as WebhookPayload,
  )

  return c.json({
    status: 'Delivery queued for retry',
    deliveryId: body.deliveryId,
  })
}
