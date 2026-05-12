import type { Context } from 'hono'
import type { AuthInfo, MiddlewareKeyVariables } from '../../utils/hono.ts'
import { type } from 'arktype'
import { safeParseSchema } from '../../utils/ark_validation.ts'
import { simpleError } from '../../utils/hono.ts'
import { getWebhookPublicUrlValidationError, WEBHOOK_EVENT_TYPES } from '../../utils/webhook.ts'
import { getWebhookSupabaseWithAuth } from './index.ts'

const bodySchema = type({
  'orgId': 'string',
  'name': 'string > 0',
  'url': 'string.url',
  'events': 'string[] > 0',
  'enabled?': 'boolean',
})

export async function post(c: Context<MiddlewareKeyVariables, any, any>, bodyRaw: any, auth: AuthInfo): Promise<Response> {
  const bodyParsed = safeParseSchema(bodySchema, bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  // Validate events are allowed
  const invalidEvents = body.events.filter(e => !WEBHOOK_EVENT_TYPES.includes(e as any))
  if (invalidEvents.length > 0) {
    throw simpleError('invalid_events', 'Invalid event types', {
      invalid: invalidEvents,
      allowed: WEBHOOK_EVENT_TYPES,
    })
  }

  const urlError = await getWebhookPublicUrlValidationError(c, body.url)
  if (urlError)
    throw simpleError('invalid_url', urlError, { url: body.url })

  // Note: Using type assertion as webhooks table types are not yet generated
  const supabase = await getWebhookSupabaseWithAuth(c, body.orgId, auth)
  const { data, error } = await (supabase as any)
    .from('webhooks')
    .insert({
      org_id: body.orgId,
      name: body.name,
      url: body.url,
      events: body.events,
      enabled: body.enabled ?? true,
      created_by: auth.userId,
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
