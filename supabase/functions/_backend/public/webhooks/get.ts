import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { simpleError } from '../../utils/hono.ts'
import { supabaseApikey } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'
import { checkWebhookPermission } from './index.ts'

const bodySchema = z.object({
  orgId: z.string(),
  webhookId: z.optional(z.string()),
  page: z.optional(z.number()),
})

const webhookSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  name: z.string(),
  url: z.string(),
  enabled: z.boolean(),
  events: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.nullable(z.string()),
})

export async function get(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  await checkWebhookPermission(c, body.orgId, apikey)

  // Use authenticated client for data queries - RLS will enforce access
  const supabase = supabaseApikey(c, apikey.key)

  // Get single webhook
  // Note: Using type assertion as webhooks table types are not yet generated
  if (body.webhookId) {
    const { data, error } = await (supabase as any)
      .from('webhooks')
      .select('*')
      .eq('id', body.webhookId)
      .eq('org_id', body.orgId)
      .single()

    if (error) {
      throw simpleError('webhook_not_found', 'Webhook not found', { error })
    }

    const dataParsed = webhookSchema.safeParse(data)
    if (!dataParsed.success) {
      throw simpleError('cannot_parse_webhook', 'Cannot parse webhook', { error: dataParsed.error })
    }

    // Get recent delivery stats for this webhook
    const { data: stats } = await (supabase as any)
      .from('webhook_deliveries')
      .select('status', { count: 'exact' })
      .eq('webhook_id', body.webhookId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    const successCount = stats?.filter((s: any) => s.status === 'success').length || 0
    const failedCount = stats?.filter((s: any) => s.status === 'failed').length || 0
    const pendingCount = stats?.filter((s: any) => s.status === 'pending').length || 0

    return c.json({
      ...dataParsed.data,
      stats_24h: {
        success: successCount,
        failed: failedCount,
        pending: pendingCount,
      },
    })
  }

  // List all webhooks for org
  const fetchOffset = body.page ?? 0
  const from = fetchOffset * fetchLimit
  const to = (fetchOffset + 1) * fetchLimit - 1

  const { data, error } = await (supabase as any)
    .from('webhooks')
    .select('*')
    .eq('org_id', body.orgId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    throw simpleError('cannot_get_webhooks', 'Cannot get webhooks', { error })
  }

  const dataParsed = z.array(webhookSchema).safeParse(data)
  if (!dataParsed.success) {
    throw simpleError('cannot_parse_webhooks', 'Cannot parse webhooks', { error: dataParsed.error })
  }

  return c.json(dataParsed.data)
}
