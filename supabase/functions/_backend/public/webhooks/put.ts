import type { Context } from 'hono'
import type { AuthInfo, MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import type { WebhookDeliveryVersion } from '../../utils/webhook.ts'
import { type } from 'arktype'
import { safeParseSchema } from '../../utils/ark_validation.ts'
import { simpleError } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
import { getWebhookPublicUrlValidationError, parseWebhookDeliveryVersion, WEBHOOK_EVENT_TYPES } from '../../utils/webhook.ts'
import { checkWebhookPermissionV2 } from './index.ts'
import { webhookPublicSelect } from './response.ts'

const bodySchema = type({
  'orgId': 'string',
  'webhookId': 'string',
  'name?': 'string > 0',
  'url?': 'string.url',
  'events?': 'string[] > 0',
  'enabled?': 'boolean',
  'deliveryVersion?': 'string',
  'delivery_version?': 'string',
})

export async function put(c: Context<MiddlewareKeyVariables, any, any>, bodyRaw: any, auth: AuthInfo): Promise<Response> {
  const bodyParsed = safeParseSchema(bodySchema, bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  await checkWebhookPermissionV2(c, body.orgId, auth)
  const requestedDeliveryVersion = body.deliveryVersion ?? body.delivery_version
  let deliveryVersion: WebhookDeliveryVersion | undefined

  if (requestedDeliveryVersion !== undefined) {
    const parsedDeliveryVersion = parseWebhookDeliveryVersion(requestedDeliveryVersion)
    if (!parsedDeliveryVersion) {
      throw simpleError('invalid_delivery_version', 'Invalid webhook delivery version', {
        allowed: ['legacy', 'standard'],
      })
    }
    deliveryVersion = parsedDeliveryVersion
  }

  // Direct RLS access to webhook tables is intentionally denied; use service-role only after explicit permission checks.
  const supabase = supabaseAdmin(c)

  // Verify webhook belongs to org
  const { data: existingWebhook, error: fetchError } = await supabase
    .from('webhooks')
    .select('id, org_id')
    .eq('id', body.webhookId)
    .single()

  if (fetchError || !existingWebhook) {
    throw simpleError('webhook_not_found', 'Webhook not found', { webhookId: body.webhookId })
  }

  if (existingWebhook.org_id !== body.orgId) {
    throw simpleError('no_permission', 'Webhook does not belong to this organization', { webhookId: body.webhookId })
  }

  // Validate events if provided
  if (body.events) {
    const invalidEvents = body.events.filter(e => !WEBHOOK_EVENT_TYPES.includes(e as any))
    if (invalidEvents.length > 0) {
      throw simpleError('invalid_events', 'Invalid event types', {
        invalid: invalidEvents,
        allowed: WEBHOOK_EVENT_TYPES,
      })
    }
  }

  // Validate URL if provided
  if (body.url) {
    const urlError = await getWebhookPublicUrlValidationError(c, body.url)
    if (urlError)
      throw simpleError('invalid_url', urlError, { url: body.url })
  }

  // Build update object
  const updateData: Database['public']['Tables']['webhooks']['Update'] = {}
  if (body.name !== undefined)
    updateData.name = body.name
  if (body.url !== undefined)
    updateData.url = body.url
  if (body.events !== undefined)
    updateData.events = body.events
  if (body.enabled !== undefined)
    updateData.enabled = body.enabled
  if (deliveryVersion !== undefined)
    updateData.delivery_version = deliveryVersion

  if (Object.keys(updateData).length === 0) {
    throw simpleError('no_updates', 'No fields to update')
  }

  // Update webhook
  const { data, error } = await supabase
    .from('webhooks')
    .update(updateData)
    .eq('id', body.webhookId)
    .select(webhookPublicSelect)
    .single()

  if (error) {
    throw simpleError('cannot_update_webhook', 'Cannot update webhook', { error })
  }

  return c.json({
    status: 'Webhook updated',
    webhook: data,
  })
}
