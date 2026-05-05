import type { Context } from 'hono'
import type { AuthInfo, MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { getBodyOrQuery, honoFactory, quickError, simpleError } from '../../utils/hono.ts'
import { middlewareKey, middlewareV2 } from '../../utils/hono_middleware.ts'
import { apikeyHasOrgRight, apikeyHasOrgRightWithPolicy, hasOrgRight, hasOrgRightApikey, supabaseApikey } from '../../utils/supabase.ts'
import { deleteWebhook } from './delete.ts'
import { getDeliveries, retryDelivery } from './deliveries.ts'
import { get } from './get.ts'
import { post } from './post.ts'
import { put } from './put.ts'
import { test } from './test.ts'

export const app = honoFactory.createApp()

function assertOrgWebhookScope(
  orgId: string,
  apikey: Database['public']['Tables']['apikeys']['Row'],
): void {
  if (apikey.limited_to_apps?.length) {
    throw simpleError('no_permission', 'App-scoped API keys cannot manage organization webhooks', { org_id: orgId })
  }

  if (!apikeyHasOrgRight(apikey, orgId)) {
    throw simpleError('invalid_org_id', 'You can\'t access this organization', { org_id: orgId })
  }
}

async function assertWebhookOrgPolicy(
  c: Context<MiddlewareKeyVariables, any, any>,
  orgId: string,
  apikey: Database['public']['Tables']['apikeys']['Row'],
): Promise<void> {
  const supabase = supabaseApikey(c, c.get('capgkey') as string)
  const orgCheck = await apikeyHasOrgRightWithPolicy(c, apikey, orgId, supabase)
  if (orgCheck.valid) {
    return
  }

  if (orgCheck.error === 'org_requires_expiring_key') {
    throw quickError(401, 'org_requires_expiring_key', 'This organization requires API keys with an expiration date. Please use a different key or update this key with an expiration date.')
  }

  throw simpleError('invalid_org_id', 'You can\'t access this organization', { org_id: orgId })
}

function uniqueApiKeys(
  apikeys: (Database['public']['Tables']['apikeys']['Row'] | null | undefined)[],
) {
  const filteredApiKeys = apikeys.filter((apikey): apikey is Database['public']['Tables']['apikeys']['Row'] => !!apikey)
  return filteredApiKeys.filter((apikey, index) => filteredApiKeys.findIndex(existing => existing.id === apikey.id) === index)
}

function getWebhookApiKeyChain(c: Context<MiddlewareKeyVariables, any, any>, apikey: Database['public']['Tables']['apikeys']['Row']) {
  const parentApikey = c.get('parentApikey') as Database['public']['Tables']['apikeys']['Row'] | undefined
  return uniqueApiKeys([parentApikey, apikey])
}

function getWebhookAuthApiKeyChain(c: Context<MiddlewareKeyVariables, any, any>, auth: AuthInfo) {
  if (auth.authType !== 'apikey' || !auth.apikey)
    return []

  return getWebhookApiKeyChain(c, auth.apikey)
}

async function assertWebhookApiKeyChain(
  c: Context<MiddlewareKeyVariables, any, any>,
  orgId: string,
  apiKeyChain: Database['public']['Tables']['apikeys']['Row'][],
) {
  for (const apikey of apiKeyChain) {
    assertOrgWebhookScope(orgId, apikey)
  }

  for (const apikey of apiKeyChain) {
    await assertWebhookOrgPolicy(c, orgId, apikey)
  }
}

/**
 * Shared permission check for webhook endpoints (API key auth)
 * Validates admin access to organization
 */
export async function checkWebhookPermission(
  c: Context<MiddlewareKeyVariables, any, any>,
  orgId: string,
  apikey: Database['public']['Tables']['apikeys']['Row'],
): Promise<void> {
  await assertWebhookApiKeyChain(c, orgId, getWebhookApiKeyChain(c, apikey))

  if (!(await hasOrgRightApikey(c, orgId, apikey.user_id, 'admin', c.get('capgkey') as string))) {
    throw simpleError('no_permission', 'You need admin access to manage webhooks', { org_id: orgId })
  }
}

/**
 * Shared permission check for webhook endpoints (JWT or API key auth)
 * Validates admin access to organization using the unified auth info
 */
export async function checkWebhookPermissionV2(
  c: Context<MiddlewareKeyVariables, any, any>,
  orgId: string,
  auth: AuthInfo,
): Promise<void> {
  await assertWebhookApiKeyChain(c, orgId, getWebhookAuthApiKeyChain(c, auth))

  const hasWebhookAdminRight = auth.authType === 'apikey'
    ? await hasOrgRightApikey(c, orgId, auth.userId, 'admin', c.get('capgkey') as string)
    : await hasOrgRight(c, orgId, auth.userId, 'admin')

  if (!hasWebhookAdminRight) {
    throw simpleError('no_permission', 'You need admin access to manage webhooks', { org_id: orgId })
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
