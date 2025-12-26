import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { simpleError } from '../../utils/hono.ts'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseAdmin } from '../../utils/supabase.ts'
import { WEBHOOK_EVENT_TYPES } from '../../utils/webhook.ts'

const bodySchema = z.object({
  orgId: z.string(),
  webhookId: z.string(),
  name: z.optional(z.string().check(z.minLength(1))),
  url: z.optional(z.string().check(z.url())),
  events: z.optional(z.array(z.string()).check(z.minLength(1))),
  enabled: z.optional(z.boolean()),
})

export async function put(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  // Check org access - admin or above required
  if (!(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'admin', c.get('capgkey') as string))) {
    throw simpleError('no_permission', 'You need admin access to manage webhooks', { org_id: body.orgId })
  }

  if (!apikeyHasOrgRight(apikey, body.orgId)) {
    throw simpleError('invalid_org_id', 'You can\'t access this organization', { org_id: body.orgId })
  }

  // Verify webhook belongs to org
  // Note: Using type assertion as webhooks table types are not yet generated
  const { data: existingWebhook, error: fetchError } = await (supabaseAdmin(c) as any)
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
    const url = new URL(body.url)
    if (url.protocol !== 'https:' && !url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
      throw simpleError('invalid_url', 'Webhook URL must use HTTPS', { url: body.url })
    }
  }

  // Build update object
  const updateData: Record<string, any> = {}
  if (body.name !== undefined)
    updateData.name = body.name
  if (body.url !== undefined)
    updateData.url = body.url
  if (body.events !== undefined)
    updateData.events = body.events
  if (body.enabled !== undefined)
    updateData.enabled = body.enabled

  if (Object.keys(updateData).length === 0) {
    throw simpleError('no_updates', 'No fields to update')
  }

  // Update webhook
  const { data, error } = await (supabaseAdmin(c) as any)
    .from('webhooks')
    .update(updateData)
    .eq('id', body.webhookId)
    .select()
    .single()

  if (error) {
    throw simpleError('cannot_update_webhook', 'Cannot update webhook', { error })
  }

  return c.json({
    status: 'Webhook updated',
    webhook: data,
  })
}
