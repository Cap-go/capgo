import type { Context } from 'hono'
import type { AuthInfo } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { getBodyOrQuery, honoFactory, simpleError } from '../../utils/hono.ts'
import { middlewareKey, middlewareV2 } from '../../utils/hono_middleware.ts'
import { apikeyHasOrgRight, hasOrgRight, hasOrgRightApikey } from '../../utils/supabase.ts'
import { deleteWebhook } from './delete.ts'
import { getDeliveries, retryDelivery } from './deliveries.ts'
import { get } from './get.ts'
import { post } from './post.ts'
import { put } from './put.ts'
import { test } from './test.ts'

export const app = honoFactory.createApp()

/**
 * Shared permission check for webhook endpoints (API key auth)
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

/**
 * Shared permission check for webhook endpoints (JWT or API key auth)
 * Validates admin access to organization using the unified auth info
 */
export async function checkWebhookPermissionV2(
  c: Context,
  orgId: string,
  auth: AuthInfo,
): Promise<void> {
  // Check org admin access
  if (!(await hasOrgRight(c, orgId, auth.userId, 'admin'))) {
    throw simpleError('no_permission', 'You need admin access to manage webhooks', { org_id: orgId })
  }

  // If using API key, also check the key has org access
  if (auth.authType === 'apikey' && auth.apikey) {
    if (!apikeyHasOrgRight(auth.apikey, orgId)) {
      throw simpleError('invalid_org_id', 'You can\'t access this organization', { org_id: orgId })
    }
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

// Test webhook (supports both JWT and API key auth)
app.post('/test', middlewareV2(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const auth = c.get('auth') as AuthInfo
  return test(c, body, auth)
})

// Get webhook deliveries
app.get('/deliveries', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return getDeliveries(c, body, apikey)
})

// Retry a failed delivery (supports both JWT and API key auth)
app.post('/deliveries/retry', middlewareV2(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const auth = c.get('auth') as AuthInfo
  return retryDelivery(c, body, auth)
})
