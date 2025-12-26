import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { simpleError } from '../../utils/hono.ts'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

const bodySchema = z.object({
  orgId: z.string(),
  webhookId: z.string(),
})

export async function deleteWebhook(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
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

  // Delete webhook (cascade will delete deliveries)
  const { error } = await (supabaseAdmin(c) as any)
    .from('webhooks')
    .delete()
    .eq('id', body.webhookId)

  if (error) {
    throw simpleError('cannot_delete_webhook', 'Cannot delete webhook', { error })
  }

  return c.json({
    status: 'Webhook deleted',
    webhookId: body.webhookId,
  })
}
