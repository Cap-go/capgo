import { createHmac, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getSupabaseClient, headers, TEST_EMAIL, USER_ID } from './test-utils.ts'

// Test data
const WEBHOOK_TEST_ORG_ID = randomUUID()
const globalId = randomUUID()
const customerId = `cus_test_${WEBHOOK_TEST_ORG_ID}`
let createdWebhookId: string | null = null
let webhookSecret: string | null = null

/**
 * Generate webhook signature using the same algorithm as the backend
 * This mirrors the implementation in supabase/functions/_backend/utils/webhook.ts
 */
async function generateWebhookSignature(
  secret: string,
  timestamp: string,
  payload: string,
): Promise<string> {
  const signaturePayload = `${timestamp}.${payload}`

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signaturePayload),
  )

  const hexSignature = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return `v1=${timestamp}.${hexSignature}`
}

/**
 * Verify webhook signature using Node.js crypto (what a receiver would use)
 */
function verifyWebhookSignature(
  signature: string,
  secret: string,
  body: string,
): { valid: boolean, timestamp: string | null, error?: string } {
  // Parse signature format: v1={timestamp}.{hmac}
  const match = signature.match(/^v1=(\d+)\.([a-f0-9]+)$/i)
  if (!match) {
    return { valid: false, timestamp: null, error: 'Invalid signature format' }
  }

  const [, timestamp, receivedHmac] = match

  // Compute expected HMAC using Node.js crypto
  const signaturePayload = `${timestamp}.${body}`
  const expectedHmac = createHmac('sha256', secret)
    .update(signaturePayload)
    .digest('hex')

  // Constant-time comparison
  if (expectedHmac.length !== receivedHmac.length) {
    return { valid: false, timestamp, error: 'HMAC length mismatch' }
  }

  let result = 0
  for (let i = 0; i < expectedHmac.length; i++) {
    result |= expectedHmac.charCodeAt(i) ^ receivedHmac.charCodeAt(i)
  }

  if (result !== 0) {
    return { valid: false, timestamp, error: 'HMAC verification failed' }
  }

  return { valid: true, timestamp }
}

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
    name: `Webhook Signature Test Org ${globalId}`,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
    customer_id: customerId,
  })
  if (error)
    throw error
})

afterAll(async () => {
  // Clean up webhook deliveries first (foreign key constraint)
  if (createdWebhookId) {
    await (getSupabaseClient() as any).from('webhook_deliveries').delete().eq('webhook_id', createdWebhookId)
    await (getSupabaseClient() as any).from('webhooks').delete().eq('id', createdWebhookId)
  }
  // Clean up test organization and stripe_info
  await getSupabaseClient().from('orgs').delete().eq('id', WEBHOOK_TEST_ORG_ID)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
})

describe('webhook signature algorithm', () => {
  const testSecret = 'whsec_test_secret_key_12345'
  const testTimestamp = '1704067200'
  const testPayload = JSON.stringify({
    event: 'app_versions.INSERT',
    event_id: '123e4567-e89b-12d3-a456-426614174000',
    timestamp: '2024-01-01T00:00:00.000Z',
    org_id: 'org-123',
    data: {
      table: 'app_versions',
      operation: 'INSERT',
      record_id: 'version-123',
      old_record: null,
      new_record: { id: 'version-123', name: '1.0.0' },
      changed_fields: null,
    },
  })

  it('should generate signature in correct format v1={timestamp}.{hmac}', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    expect(signature).toMatch(/^v1=\d+\.[a-f0-9]{64}$/i)
  })

  it('should include timestamp in signature', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    expect(signature).toContain(`v1=${testTimestamp}.`)
  })

  it('should generate 64-char hex HMAC (SHA-256)', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const hmac = signature.split('.')[1]
    expect(hmac.length).toBe(64)
  })

  it('should produce consistent signatures for same inputs', async () => {
    const sig1 = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const sig2 = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    expect(sig1).toBe(sig2)
  })

  it('should produce different signatures for different secrets', async () => {
    const sig1 = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const sig2 = await generateWebhookSignature('different_secret', testTimestamp, testPayload)
    expect(sig1).not.toBe(sig2)
  })

  it('should produce different signatures for different timestamps', async () => {
    const sig1 = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const sig2 = await generateWebhookSignature(testSecret, '1704153600', testPayload)
    expect(sig1).not.toBe(sig2)
  })

  it('should produce different signatures for different payloads', async () => {
    const sig1 = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const sig2 = await generateWebhookSignature(testSecret, testTimestamp, '{"different":"payload"}')
    expect(sig1).not.toBe(sig2)
  })

  it('should match Node.js crypto HMAC generation', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const [, timestampAndHmac] = signature.split('=')
    const [, hmac] = timestampAndHmac.split('.')

    // Generate with Node.js crypto
    const signaturePayload = `${testTimestamp}.${testPayload}`
    const expectedHmac = createHmac('sha256', testSecret)
      .update(signaturePayload)
      .digest('hex')

    expect(hmac).toBe(expectedHmac)
  })
})

describe('webhook signature verification', () => {
  const testSecret = 'whsec_test_secret_key_12345'
  const testTimestamp = '1704067200'
  const testPayload = JSON.stringify({ event: 'test.ping' })

  it('should verify valid signature', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const result = verifyWebhookSignature(signature, testSecret, testPayload)

    expect(result.valid).toBe(true)
    expect(result.timestamp).toBe(testTimestamp)
    expect(result.error).toBeUndefined()
  })

  it('should reject signature with wrong secret', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const result = verifyWebhookSignature(signature, 'wrong_secret', testPayload)

    expect(result.valid).toBe(false)
    expect(result.error).toBe('HMAC verification failed')
  })

  it('should reject signature with tampered payload', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const tamperedPayload = JSON.stringify({ event: 'test.ping', tampered: true })
    const result = verifyWebhookSignature(signature, testSecret, tamperedPayload)

    expect(result.valid).toBe(false)
    expect(result.error).toBe('HMAC verification failed')
  })

  it('should reject malformed signatures', () => {
    const body = '{"test": true}'
    const secret = 'test_secret'

    // Missing version prefix
    expect(verifyWebhookSignature('1234567890.abc123', secret, body).valid).toBe(false)

    // Invalid format
    expect(verifyWebhookSignature('invalid', secret, body).valid).toBe(false)

    // Empty signature
    expect(verifyWebhookSignature('', secret, body).valid).toBe(false)
  })
})

describe('webhook creation and secret generation', () => {
  it('should create webhook with auto-generated secret', async () => {
    // Using a valid HTTPS URL since localhost is rejected in non-local environments
    const webhookUrl = 'https://example.com/webhook-test'

    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        name: `Signature Test Webhook ${globalId}`,
        url: webhookUrl,
        events: ['app_versions'],
      }),
    })

    expect(response.status).toBe(201)
    const data = await response.json() as { status: string, webhook: { id: string } }
    expect(data.status).toBe('Webhook created')

    createdWebhookId = data.webhook.id
  })

  it('should store a secret for the webhook', async () => {
    expect(createdWebhookId).not.toBeNull()

    const { data: webhook, error } = await (getSupabaseClient() as any)
      .from('webhooks')
      .select('secret')
      .eq('id', createdWebhookId)
      .single()

    expect(error).toBeNull()
    expect(webhook).not.toBeNull()
    expect(webhook.secret).toBeDefined()
    expect(typeof webhook.secret).toBe('string')
    expect(webhook.secret.length).toBeGreaterThan(0)

    webhookSecret = webhook.secret
  })

  it('should generate unique secrets for different webhooks', async () => {
    // Create another webhook
    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        name: `Another Signature Test Webhook ${globalId}`,
        url: 'https://example.com/webhook-test-2',
        events: ['app_versions'],
      }),
    })

    expect(response.status).toBe(201)
    const data = await response.json() as { webhook: { id: string } }
    const anotherWebhookId = data.webhook.id

    // Get the secret
    const { data: webhook } = await (getSupabaseClient() as any)
      .from('webhooks')
      .select('secret')
      .eq('id', anotherWebhookId)
      .single()

    expect(webhook.secret).not.toBe(webhookSecret)

    // Clean up
    await (getSupabaseClient() as any).from('webhooks').delete().eq('id', anotherWebhookId)
  })

  it('should be able to verify a signature with the stored secret', async () => {
    expect(webhookSecret).not.toBeNull()

    const timestamp = Math.floor(Date.now() / 1000).toString()
    const payload = JSON.stringify({
      event: 'test.ping',
      org_id: WEBHOOK_TEST_ORG_ID,
    })

    // Generate signature with the real secret
    const signature = await generateWebhookSignature(webhookSecret!, timestamp, payload)

    // Verify it can be validated
    const result = verifyWebhookSignature(signature, webhookSecret!, payload)

    expect(result.valid).toBe(true)
    expect(result.timestamp).toBe(timestamp)
  })
})

describe('webhook delivery record creation', () => {
  it('should create delivery record when triggering test webhook', async () => {
    expect(createdWebhookId).not.toBeNull()

    // Trigger the test webhook (it will fail to deliver since URL is example.com, but record should be created)
    const response = await fetch(`${BASE_URL}/webhooks/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        webhookId: createdWebhookId,
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { delivery_id: string, success: boolean }
    expect(data.delivery_id).toBeDefined()
    // The delivery will fail since example.com won't accept our webhook
    expect(data.success).toBe(false)
  })

  it('should store the payload in delivery record', async () => {
    expect(createdWebhookId).not.toBeNull()

    // Get the latest delivery for this webhook
    const { data: deliveries, error } = await (getSupabaseClient() as any)
      .from('webhook_deliveries')
      .select('*')
      .eq('webhook_id', createdWebhookId)
      .order('created_at', { ascending: false })
      .limit(1)

    expect(error).toBeNull()
    expect(deliveries).not.toBeNull()
    expect(deliveries.length).toBe(1)

    const delivery = deliveries[0]
    expect(delivery.request_payload).toBeDefined()
    expect(delivery.request_payload.event).toBe('test.ping')
    expect(delivery.request_payload.org_id).toBe(WEBHOOK_TEST_ORG_ID)
    expect(delivery.request_payload.event_id).toBeDefined()
    expect(delivery.request_payload.timestamp).toBeDefined()
    expect(delivery.request_payload.data).toBeDefined()
  })

  it('should record the event type correctly', async () => {
    const { data: deliveries } = await (getSupabaseClient() as any)
      .from('webhook_deliveries')
      .select('event_type')
      .eq('webhook_id', createdWebhookId)
      .order('created_at', { ascending: false })
      .limit(1)

    expect(deliveries[0].event_type).toBe('test.ping')
  })
})

describe('signature security properties', () => {
  it('should use HMAC-SHA256 producing 256-bit signatures', async () => {
    const signature = await generateWebhookSignature('secret', '12345', '{}')
    const hmac = signature.split('.')[1]

    // 256 bits = 32 bytes = 64 hex characters
    expect(hmac.length).toBe(64)
  })

  it('should include timestamp to prevent replay attacks', async () => {
    const secret = 'test_secret'
    const payload = '{}'

    const oldTimestamp = '1609459200' // 2021-01-01
    const newTimestamp = '1704067200' // 2024-01-01

    const oldSig = await generateWebhookSignature(secret, oldTimestamp, payload)
    const newSig = await generateWebhookSignature(secret, newTimestamp, payload)

    // Different timestamps = different signatures
    expect(oldSig).not.toBe(newSig)

    // Old signature cannot be used with new timestamp for verification
    // (the timestamp in signature won't match what receiver expects)
    const oldParsed = oldSig.match(/^v1=(\d+)\./)
    expect(oldParsed![1]).toBe(oldTimestamp)

    const newParsed = newSig.match(/^v1=(\d+)\./)
    expect(newParsed![1]).toBe(newTimestamp)
  })

  it('should produce unique signatures for different payloads', async () => {
    const secret = 'test_secret'
    const timestamp = '1704067200'
    const signatures = new Set<string>()

    for (let i = 0; i < 100; i++) {
      const payload = JSON.stringify({ event: 'test', nonce: i })
      const sig = await generateWebhookSignature(secret, timestamp, payload)
      signatures.add(sig)
    }

    // All 100 signatures should be unique
    expect(signatures.size).toBe(100)
  })
})
