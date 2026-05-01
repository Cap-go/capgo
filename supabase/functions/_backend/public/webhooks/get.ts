import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { type } from 'arktype'
import { safeParseSchema } from '../../utils/ark_validation.ts'
import { simpleError } from '../../utils/hono.ts'
import { supabaseApikey } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'
import { checkWebhookPermission } from './index.ts'

const bodySchema = type({
  'orgId': 'string',
  'webhookId?': 'string',
  'page?': 'number',
})

const webhookSchema = type({
  id: 'string',
  org_id: 'string',
  name: 'string',
  url: 'string',
  enabled: 'boolean',
  events: 'string[]',
  created_at: 'string',
  updated_at: 'string',
  created_by: 'string | null',
})

const webhooksSchema = webhookSchema.array()

export async function get(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = safeParseSchema(bodySchema, bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  await checkWebhookPermission(c, body.orgId, apikey)

  // Use authenticated client - RLS will enforce access
  const supabase = supabaseApikey(c, c.get('capgkey') as string)

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

    const dataParsed = safeParseSchema(webhookSchema, data)
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

  const dataParsed = safeParseSchema(webhooksSchema, data)
  if (!dataParsed.success) {
    throw simpleError('cannot_parse_webhooks', 'Cannot parse webhooks', { error: dataParsed.error })
  }

  return c.json(dataParsed.data)
}
