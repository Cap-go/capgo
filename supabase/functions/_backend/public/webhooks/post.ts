import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { simpleError } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
import { WEBHOOK_EVENT_TYPES } from '../../utils/webhook.ts'
import { checkWebhookPermission } from './index.ts'

const bodySchema = z.object({
  orgId: z.string(),
  name: z.string().check(z.minLength(1)),
  url: z.string().check(z.url()),
  events: z.array(z.string()).check(z.minLength(1)),
  enabled: z.optional(z.boolean()),
})

export async function post(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  await checkWebhookPermission(c, body.orgId, apikey)

  // Validate events are allowed
  const invalidEvents = body.events.filter(e => !WEBHOOK_EVENT_TYPES.includes(e as any))
  if (invalidEvents.length > 0) {
    throw simpleError('invalid_events', 'Invalid event types', {
      invalid: invalidEvents,
      allowed: WEBHOOK_EVENT_TYPES,
    })
  }

  // Validate URL is HTTPS in production
  const url = new URL(body.url)
  if (url.protocol !== 'https:' && !url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
    throw simpleError('invalid_url', 'Webhook URL must use HTTPS', { url: body.url })
  }

  // Create webhook
  // Note: Using type assertion as webhooks table types are not yet generated
  const { data, error } = await (supabaseAdmin(c) as any)
    .from('webhooks')
    .insert({
      org_id: body.orgId,
      name: body.name,
      url: body.url,
      events: body.events,
      enabled: body.enabled ?? true,
      created_by: apikey.user_id,
    })
    .select()
    .single()

  if (error) {
    throw simpleError('cannot_create_webhook', 'Cannot create webhook', { error })
  }

  return c.json({
    status: 'Webhook created',
    webhook: data,
  }, 201)
}
