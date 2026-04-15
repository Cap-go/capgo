import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getEndpointUrl, getSupabaseClient, headers, TEST_EMAIL, USER_ID } from './test-utils.ts'

const globalId = randomUUID()
const policyOrgId = randomUUID()
const policyCustomerId = `cus_webhook_policy_${globalId}`
const WEBHOOKS_URL = getEndpointUrl('/webhooks')
const WEBHOOKS_TEST_URL = getEndpointUrl('/webhooks/test')
const WEBHOOKS_RETRY_URL = getEndpointUrl('/webhooks/deliveries/retry')

let legacyApiKeyId: number | null = null
let legacyApiKeyValue: string | null = null
let expiringSubkeyId: number | null = null
let expiringSubkeyValue: string | null = null
let createdWebhookId: string | null = null
let createdDeliveryId: string | null = null

beforeAll(async () => {
  const supabase = getSupabaseClient()

  const { error: stripeError } = await supabase.from('stripe_info').insert({
    customer_id: policyCustomerId,
    status: 'succeeded',
    product_id: 'prod_LQIregjtNduh4q',
    subscription_id: `sub_webhook_policy_${globalId}`,
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  const { error: orgError } = await supabase.from('orgs').insert({
    id: policyOrgId,
    name: `Webhook Policy Org ${globalId}`,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
    customer_id: policyCustomerId,
  })
  if (orgError)
    throw orgError

  const { error: memberError } = await supabase.from('org_users').insert({
    org_id: policyOrgId,
    user_id: USER_ID,
    user_right: 'super_admin',
  })
  if (memberError)
    throw memberError

  legacyApiKeyValue = `legacy-webhook-key-${globalId}`
  const { data: legacyKeyData, error: legacyKeyError } = await supabase.from('apikeys').insert({
    user_id: USER_ID,
    key: legacyApiKeyValue,
    key_hash: null,
    mode: 'all',
    name: `legacy-webhook-key-${globalId}`,
    limited_to_apps: [],
    limited_to_orgs: [policyOrgId],
    expires_at: null,
  }).select('id').single()
  if (legacyKeyError || !legacyKeyData) {
    throw new Error(`Failed to seed legacy webhook API key: ${legacyKeyError?.message ?? 'missing key data'}`)
  }
  legacyApiKeyId = legacyKeyData.id

  const webhookResponse = await fetch(WEBHOOKS_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orgId: policyOrgId,
      name: `policy-webhook-${globalId}`,
      url: 'https://example.com/webhook-policy',
      events: ['orgs'],
    }),
  })
  expect(webhookResponse.status).toBe(201)
  const webhookData = await webhookResponse.json() as { webhook: { id: string } }
  createdWebhookId = webhookData.webhook.id

  const testWebhookResponse = await fetch(WEBHOOKS_TEST_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orgId: policyOrgId,
      webhookId: createdWebhookId,
    }),
  })
  expect(testWebhookResponse.status).toBe(200)
  const testWebhookData = await testWebhookResponse.json() as { delivery_id: string }
  createdDeliveryId = testWebhookData.delivery_id

  const { error: policyError } = await supabase.from('orgs').update({
    require_apikey_expiration: true,
    max_apikey_expiration_days: 30,
  }).eq('id', policyOrgId)
  if (policyError)
    throw policyError

  expiringSubkeyValue = `expiring-webhook-subkey-${globalId}`
  const { data: expiringKeyData, error: expiringKeyError } = await supabase.from('apikeys').insert({
    user_id: USER_ID,
    key: expiringSubkeyValue,
    key_hash: null,
    mode: 'all',
    name: `expiring-webhook-subkey-${globalId}`,
    limited_to_apps: [],
    limited_to_orgs: [policyOrgId],
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }).select('id').single()
  if (expiringKeyError || !expiringKeyData) {
    throw new Error(`Failed to seed expiring webhook API key: ${expiringKeyError?.message ?? 'missing key data'}`)
  }
  expiringSubkeyId = expiringKeyData.id
}, 60000)

afterAll(async () => {
  const supabase = getSupabaseClient()

  if (createdWebhookId) {
    await (supabase as any).from('webhooks').delete().eq('id', createdWebhookId)
  }

  if (legacyApiKeyId) {
    await supabase.from('apikeys').delete().eq('id', legacyApiKeyId)
  }

  if (expiringSubkeyId) {
    await supabase.from('apikeys').delete().eq('id', expiringSubkeyId)
  }

  await supabase.from('org_users').delete().eq('org_id', policyOrgId)
  await supabase.from('orgs').delete().eq('id', policyOrgId)
  await supabase.from('stripe_info').delete().eq('customer_id', policyCustomerId)
}, 60000)

describe('webhook endpoints enforce org API key expiration policy', () => {
  it('rejects webhook listing for legacy non-expiring org key', async () => {
    if (!legacyApiKeyValue)
      throw new Error('Legacy API key was not created')

    const response = await fetch(`${WEBHOOKS_URL}?orgId=${policyOrgId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': legacyApiKeyValue,
      },
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('org_requires_expiring_key')
  })

  it('rejects webhook creation for legacy non-expiring org key', async () => {
    if (!legacyApiKeyValue)
      throw new Error('Legacy API key was not created')

    const response = await fetch(WEBHOOKS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': legacyApiKeyValue,
      },
      body: JSON.stringify({
        orgId: policyOrgId,
        name: `blocked-webhook-${globalId}`,
        url: 'https://example.com/blocked-webhook',
        events: ['orgs'],
      }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('org_requires_expiring_key')
  })

  it('rejects webhook deletion for legacy non-expiring org key', async () => {
    if (!legacyApiKeyValue || !createdWebhookId)
      throw new Error('Webhook deletion prerequisites were not created')

    const response = await fetch(WEBHOOKS_URL, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': legacyApiKeyValue,
      },
      body: JSON.stringify({
        orgId: policyOrgId,
        webhookId: createdWebhookId,
      }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('org_requires_expiring_key')
  })

  it('rejects webhook test for legacy non-expiring org key', async () => {
    if (!legacyApiKeyValue || !createdWebhookId)
      throw new Error('Webhook test prerequisites were not created')

    const response = await fetch(WEBHOOKS_TEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': legacyApiKeyValue,
      },
      body: JSON.stringify({
        orgId: policyOrgId,
        webhookId: createdWebhookId,
      }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('org_requires_expiring_key')
  })

  it('rejects delivery retry for legacy non-expiring org key', async () => {
    if (!legacyApiKeyValue || !createdDeliveryId)
      throw new Error('Webhook delivery prerequisites were not created')

    const response = await fetch(WEBHOOKS_RETRY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': legacyApiKeyValue,
      },
      body: JSON.stringify({
        orgId: policyOrgId,
        deliveryId: createdDeliveryId,
      }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('org_requires_expiring_key')
  })

  it('rejects webhook test when a legacy parent key attaches an expiring subkey', async () => {
    if (!legacyApiKeyValue || !expiringSubkeyId || !createdWebhookId)
      throw new Error('Webhook subkey policy prerequisites were not created')

    const response = await fetch(WEBHOOKS_TEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': legacyApiKeyValue,
        'x-limited-key-id': String(expiringSubkeyId),
      },
      body: JSON.stringify({
        orgId: policyOrgId,
        webhookId: createdWebhookId,
      }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('org_requires_expiring_key')
  })

  it('allows webhook listing for a compliant expiring org key', async () => {
    if (!expiringSubkeyValue)
      throw new Error('Expiring API key was not created')

    const response = await fetch(`${WEBHOOKS_URL}?orgId=${policyOrgId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': expiringSubkeyValue,
      },
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
  })
})
