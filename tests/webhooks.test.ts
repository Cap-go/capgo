import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BASE_URL, getSupabaseClient, headers, TEST_EMAIL, USER_ID } from './test-utils.ts'

// Test org and webhook IDs
const WEBHOOK_TEST_ORG_ID = randomUUID()
const globalId = randomUUID()
const webhookName = `Test Webhook ${globalId}`
const webhookUrl = 'https://example.com/webhook'
const customerId = `cus_test_${WEBHOOK_TEST_ORG_ID}`

let createdWebhookId: string | null = null

beforeAll(async () => {
  // Create stripe_info for this test org
  const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
    customer_id: customerId,
    status: 'succeeded',
    product_id: 'prod_LQIregjtNduh4q',
    subscription_id: `sub_${globalId}`,
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  // Create test organization
  const { error } = await getSupabaseClient().from('orgs').insert({
    id: WEBHOOK_TEST_ORG_ID,
    name: `Webhook Test Org ${globalId}`,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
    customer_id: customerId,
  })
  if (error)
    throw error
})

afterAll(async () => {
  // Clean up created webhooks
  // Note: Using type assertion as webhooks table types are not yet generated
  if (createdWebhookId) {
    await (getSupabaseClient() as any).from('webhooks').delete().eq('id', createdWebhookId)
  }
  // Clean up test organization and stripe_info
  await getSupabaseClient().from('orgs').delete().eq('id', WEBHOOK_TEST_ORG_ID)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
})

describe('[GET] /webhooks', () => {
  it('list webhooks for organization', async () => {
    const response = await fetch(`${BASE_URL}/webhooks?orgId=${WEBHOOK_TEST_ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
  })

  it('list webhooks with missing orgId', async () => {
    const response = await fetch(`${BASE_URL}/webhooks`, {
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_body')
  })

  it('list webhooks with invalid orgId', async () => {
    const invalidOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/webhooks?orgId=${invalidOrgId}`, {
      headers,
    })
    expect(response.status).toBe(400)
  })
})

describe('[POST] /webhooks', () => {
  it('create webhook', async () => {
    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        name: webhookName,
        url: webhookUrl,
        events: ['app_versions'],
      }),
    })

    expect(response.status).toBe(201)
    const data = await response.json() as { status: string, webhook: { id: string, name: string, url: string } }
    expect(data.status).toBe('Webhook created')
    expect(data.webhook).toBeDefined()
    expect(data.webhook.name).toBe(webhookName)
    expect(data.webhook.url).toBe(webhookUrl)

    createdWebhookId = data.webhook.id
  })

  it('create webhook with missing required fields', async () => {
    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        name: 'Missing URL Webhook',
        // Missing url and events
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_body')
  })

  it('create webhook with invalid URL', async () => {
    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        name: 'Invalid URL Webhook',
        url: 'not-a-valid-url',
        events: ['app_versions'],
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_body')
  })

  it('create webhook with HTTP URL (non-HTTPS)', async () => {
    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        name: 'HTTP URL Webhook',
        url: 'http://example.com/webhook',
        events: ['app_versions'],
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_url')
  })

  it('create webhook with invalid events', async () => {
    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        name: 'Invalid Events Webhook',
        url: webhookUrl,
        events: ['invalid_event_type'],
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_events')
  })

  it('create webhook with empty events array', async () => {
    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        name: 'Empty Events Webhook',
        url: webhookUrl,
        events: [],
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_body')
  })

  it('create webhook with invalid orgId', async () => {
    const invalidOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: invalidOrgId,
        name: 'Invalid Org Webhook',
        url: webhookUrl,
        events: ['app_versions'],
      }),
    })
    expect(response.status).toBe(400)
  })

  it('create webhook allows localhost URL', async () => {
    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        name: 'Localhost Webhook',
        url: 'http://localhost:3000/webhook',
        events: ['app_versions'],
      }),
    })
    expect(response.status).toBe(201)
    const data = await response.json() as { webhook: { id: string } }
    // Clean up - Using type assertion as webhooks table types are not yet generated
    await (getSupabaseClient() as any).from('webhooks').delete().eq('id', data.webhook.id)
  })
})

describe('[GET] /webhooks (single webhook)', () => {
  it('get single webhook by id', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook was not created in previous test')

    const response = await fetch(`${BASE_URL}/webhooks?orgId=${WEBHOOK_TEST_ORG_ID}&webhookId=${createdWebhookId}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { id: string, name: string, stats_24h: object }
    expect(data.id).toBe(createdWebhookId)
    expect(data.name).toBe(webhookName)
    expect(data.stats_24h).toBeDefined()
  })

  it('get webhook with invalid webhookId', async () => {
    const invalidWebhookId = randomUUID()
    const response = await fetch(`${BASE_URL}/webhooks?orgId=${WEBHOOK_TEST_ORG_ID}&webhookId=${invalidWebhookId}`, {
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('webhook_not_found')
  })
})

describe('[PUT] /webhooks', () => {
  it('update webhook name', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook was not created in previous test')

    const newName = `Updated Webhook ${globalId}`
    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        webhookId: createdWebhookId,
        name: newName,
      }),
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { status: string, webhook: { name: string } }
    expect(data.status).toBe('Webhook updated')
    expect(data.webhook.name).toBe(newName)
  })

  it('update webhook URL', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook was not created in previous test')

    const newUrl = 'https://updated.example.com/webhook'
    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        webhookId: createdWebhookId,
        url: newUrl,
      }),
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { webhook: { url: string } }
    expect(data.webhook.url).toBe(newUrl)
  })

  it('update webhook events', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook was not created in previous test')

    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        webhookId: createdWebhookId,
        events: ['app_versions', 'channels'],
      }),
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { webhook: { events: string[] } }
    expect(data.webhook.events).toContain('app_versions')
    expect(data.webhook.events).toContain('channels')
  })

  it('update webhook enabled status', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook was not created in previous test')

    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        webhookId: createdWebhookId,
        enabled: false,
      }),
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { webhook: { enabled: boolean } }
    expect(data.webhook.enabled).toBe(false)

    // Re-enable for subsequent tests
    await fetch(`${BASE_URL}/webhooks`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        webhookId: createdWebhookId,
        enabled: true,
      }),
    })
  })

  it('update webhook with no fields', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook was not created in previous test')

    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        webhookId: createdWebhookId,
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_updates')
  })

  it('update webhook with invalid webhookId', async () => {
    const invalidWebhookId = randomUUID()
    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        webhookId: invalidWebhookId,
        name: 'New Name',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('webhook_not_found')
  })

  it('update webhook with invalid events', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook was not created in previous test')

    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        webhookId: createdWebhookId,
        events: ['invalid_event'],
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_events')
  })

  it('update webhook with HTTP URL (non-HTTPS)', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook was not created in previous test')

    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        webhookId: createdWebhookId,
        url: 'http://example.com/webhook',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_url')
  })
})

describe('[POST] /webhooks/test', () => {
  it('test webhook', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook was not created in previous test')

    const response = await fetch(`${BASE_URL}/webhooks/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        webhookId: createdWebhookId,
      }),
    })
    // Webhook test may fail if the URL is not reachable, but API should return 200
    expect(response.status).toBe(200)
    const data = await response.json() as { success: boolean, delivery_id: string, message: string }
    expect(typeof data.success).toBe('boolean')
    expect(data.delivery_id).toBeDefined()
    expect(data.message).toBeDefined()
  })

  it('test webhook with invalid webhookId', async () => {
    const invalidWebhookId = randomUUID()
    const response = await fetch(`${BASE_URL}/webhooks/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        webhookId: invalidWebhookId,
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('webhook_not_found')
  })

  it('test webhook with missing body', async () => {
    const response = await fetch(`${BASE_URL}/webhooks/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_body')
  })
})

describe('[GET] /webhooks/deliveries', () => {
  it('get webhook deliveries', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook was not created in previous test')

    const response = await fetch(`${BASE_URL}/webhooks/deliveries?orgId=${WEBHOOK_TEST_ORG_ID}&webhookId=${createdWebhookId}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { deliveries: any[], pagination: { page: number, per_page: number, total: number, has_more: boolean } }
    expect(Array.isArray(data.deliveries)).toBe(true)
    expect(data.pagination).toBeDefined()
    expect(data.pagination.page).toBe(0)
    expect(data.pagination.per_page).toBe(50)
  })

  it('get webhook deliveries with status filter', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook was not created in previous test')

    const response = await fetch(`${BASE_URL}/webhooks/deliveries?orgId=${WEBHOOK_TEST_ORG_ID}&webhookId=${createdWebhookId}&status=success`, {
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { deliveries: any[] }
    expect(Array.isArray(data.deliveries)).toBe(true)
  })

  it('get webhook deliveries with pagination', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook was not created in previous test')

    const response = await fetch(`${BASE_URL}/webhooks/deliveries?orgId=${WEBHOOK_TEST_ORG_ID}&webhookId=${createdWebhookId}&page=0`, {
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { pagination: { page: number } }
    expect(data.pagination.page).toBe(0)
  })

  it('get webhook deliveries with invalid webhookId', async () => {
    const invalidWebhookId = randomUUID()
    const response = await fetch(`${BASE_URL}/webhooks/deliveries?orgId=${WEBHOOK_TEST_ORG_ID}&webhookId=${invalidWebhookId}`, {
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('webhook_not_found')
  })

  it('get webhook deliveries with missing body', async () => {
    const response = await fetch(`${BASE_URL}/webhooks/deliveries`, {
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_body')
  })
})

describe('[POST] /webhooks/deliveries/retry', () => {
  it('retry delivery with invalid deliveryId', async () => {
    const invalidDeliveryId = randomUUID()
    const response = await fetch(`${BASE_URL}/webhooks/deliveries/retry`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        deliveryId: invalidDeliveryId,
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('delivery_not_found')
  })

  it('retry delivery with missing body', async () => {
    const response = await fetch(`${BASE_URL}/webhooks/deliveries/retry`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_body')
  })
})

describe('[DELETE] /webhooks', () => {
  it('delete webhook with invalid webhookId', async () => {
    const invalidWebhookId = randomUUID()
    const response = await fetch(`${BASE_URL}/webhooks?orgId=${WEBHOOK_TEST_ORG_ID}&webhookId=${invalidWebhookId}`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('webhook_not_found')
  })

  it('delete webhook with missing body', async () => {
    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_body')
  })

  it('delete webhook', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook was not created in previous test')

    const response = await fetch(`${BASE_URL}/webhooks?orgId=${WEBHOOK_TEST_ORG_ID}&webhookId=${createdWebhookId}`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { status: string, webhookId: string }
    expect(data.status).toBe('Webhook deleted')
    expect(data.webhookId).toBe(createdWebhookId)

    // Verify deletion
    const getResponse = await fetch(`${BASE_URL}/webhooks?orgId=${WEBHOOK_TEST_ORG_ID}&webhookId=${createdWebhookId}`, {
      headers,
    })
    expect(getResponse.status).toBe(400)

    createdWebhookId = null // Reset for cleanup
  })

  it('delete already deleted webhook', async () => {
    // Create a new webhook to delete
    const createResponse = await fetch(`${BASE_URL}/webhooks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        name: 'Webhook to double delete',
        url: webhookUrl,
        events: ['app_versions'],
      }),
    })
    const createData = await createResponse.json() as { webhook: { id: string } }
    const webhookId = createData.webhook.id

    // First deletion
    await fetch(`${BASE_URL}/webhooks?orgId=${WEBHOOK_TEST_ORG_ID}&webhookId=${webhookId}`, {
      method: 'DELETE',
      headers,
    })

    // Second deletion attempt
    const response = await fetch(`${BASE_URL}/webhooks?orgId=${WEBHOOK_TEST_ORG_ID}&webhookId=${webhookId}`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('webhook_not_found')
  })
})
