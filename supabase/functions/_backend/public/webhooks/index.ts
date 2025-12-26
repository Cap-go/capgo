import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { getBodyOrQuery, honoFactory, simpleError } from '../../utils/hono.ts'
import { middlewareKey } from '../../utils/hono_middleware.ts'
import { apikeyHasOrgRight, hasOrgRightApikey } from '../../utils/supabase.ts'
import { deleteWebhook } from './delete.ts'
import { getDeliveries, retryDelivery } from './deliveries.ts'
import { get } from './get.ts'
import { post } from './post.ts'
import { put } from './put.ts'
import { test } from './test.ts'

export const app = honoFactory.createApp()

/**
 * Shared permission check for webhook endpoints
 * Validates admin access to organization
 */
export async function checkWebhookPermission(
  c: Context,
  orgId: string,
  apikey: Database['public']['Tables']['apikeys']['Row'],
): Promise<void> {
  if (!(await hasOrgRightApikey(c, orgId, apikey.user_id, 'admin', c.get('capgkey') as string))) {
    throw simpleError('no_permission', 'You need admin access to manage webhooks', { org_id: orgId })
  }
  if (!apikeyHasOrgRight(apikey, orgId)) {
    throw simpleError('invalid_org_id', 'You can\'t access this organization', { org_id: orgId })
  }
}

// List all webhooks for org
app.get('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return get(c, body, apikey)
})

// Create webhook
app.post('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return post(c, body, apikey)
})

// Update webhook
app.put('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return put(c, body, apikey)
})

// Delete webhook
app.delete('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return deleteWebhook(c, body, apikey)
})

// Test webhook
app.post('/test', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return test(c, body, apikey)
})

// Get webhook deliveries
app.get('/deliveries', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return getDeliveries(c, body, apikey)
})

// Retry a failed delivery
app.post('/deliveries/retry', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return retryDelivery(c, body, apikey)
})
