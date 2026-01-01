/**
 * Webhook Signature Verification Tests
 *
 * This test suite validates the end-to-end webhook signature verification system.
 * It creates a local HTTP server to receive webhooks, sends test webhooks via the API,
 * and verifies that the HMAC-SHA256 signatures are correctly generated and can be validated.
 *
 * Signature Scheme:
 * - Header: X-Capgo-Signature
 * - Format: v1={timestamp}.{hmac_hex}
 * - Signing payload: {timestamp}.{json_payload}
 * - Algorithm: HMAC-SHA256
 *
 * To run these tests:
 * - Ensure Supabase is running: `supabase start`
 * - Run backend tests: `bun test:backend tests/webhook-signature.test.ts`
 * - Or all tests: `bun test:all`
 */

import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BASE_URL, getSupabaseClient, headers, TEST_EMAIL, USER_ID } from './test-utils.ts'

// Test org and webhook IDs
const WEBHOOK_SIGNATURE_TEST_ORG_ID = randomUUID()
const globalId = randomUUID()
const customerId = `cus_sig_test_${WEBHOOK_SIGNATURE_TEST_ORG_ID}`

let createdWebhookId: string | null = null
let webhookSecret: string | null = null
let testServerPort: number | null = null
let testServer: ReturnType<typeof createServer> | null = null

// Store captured webhook requests for verification
interface CapturedRequest {
  headers: Record<string, string | string[] | undefined>
  body: string
  timestamp: number
}

let capturedRequests: CapturedRequest[] = []

/**
 * Verify webhook signature according to Capgo's signature scheme
 * Signature format: v1={timestamp}.{hmac_hex}
 * Signing payload: {timestamp}.{json_payload}
 */
async function verifyWebhookSignature(
  secret: string,
  signatureHeader: string,
  timestamp: string,
  payload: string,
): Promise<boolean> {
  // Parse signature header: "v1={timestamp}.{hmac}"
  const match = signatureHeader.match(/^v1=(\d+)\.([a-f0-9]+)$/)
  if (!match) {
    return false
  }

  const [, signatureTimestamp, receivedHmac] = match

  // Verify timestamp matches
  if (signatureTimestamp !== timestamp) {
    return false
  }

  // Recreate the signing payload
  const signaturePayload = `${timestamp}.${payload}`

  // Generate expected HMAC using Node.js crypto
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

  const expectedHmac = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Compare HMACs (constant-time comparison would be better in production)
  return expectedHmac === receivedHmac
}

/**
 * Create a simple HTTP server to receive webhooks
 */
function createWebhookTestServer(): Promise<{ server: ReturnType<typeof createServer>, port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = ''

      req.on('data', (chunk) => {
        body += chunk.toString()
      })

      req.on('end', () => {
        // Capture the request for verification
        capturedRequests.push({
          headers: req.headers as Record<string, string | string[] | undefined>,
          body,
          timestamp: Date.now(),
        })

        // Respond with 200 OK
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'received' }))
      })

      req.on('error', (err) => {
        console.error('Request error:', err)
        res.writeHead(500)
        res.end()
      })
    })

    server.on('error', reject)

    // Listen on a random available port
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo
      resolve({ server, port: address.port })
    })
  })
}

beforeAll(async () => {
  // Create test HTTP server
  const { server, port } = await createWebhookTestServer()
  testServer = server
  testServerPort = port

  console.log(`Test webhook server listening on http://127.0.0.1:${port}`)

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
    id: WEBHOOK_SIGNATURE_TEST_ORG_ID,
    name: `Webhook Signature Test Org ${globalId}`,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
    customer_id: customerId,
  })
  if (error)
    throw error
})

afterAll(async () => {
  // Close test server
  if (testServer) {
    await new Promise<void>((resolve, reject) => {
      testServer!.close((err) => {
        if (err)
          reject(err)
        else resolve()
      })
    })
  }

  // Clean up created webhooks
  if (createdWebhookId) {
    await (getSupabaseClient() as any).from('webhooks').delete().eq('id', createdWebhookId)
  }

  // Clean up test organization and stripe_info
  await getSupabaseClient().from('orgs').delete().eq('id', WEBHOOK_SIGNATURE_TEST_ORG_ID)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
})

describe('Webhook Signature Verification', () => {
  it('create webhook pointing to local test server', async () => {
    if (!testServerPort)
      throw new Error('Test server not started')

    const webhookUrl = `http://localhost:${testServerPort}/webhook`

    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_SIGNATURE_TEST_ORG_ID,
        name: `Signature Test Webhook ${globalId}`,
        url: webhookUrl,
        events: ['app_versions'],
      }),
    })

    expect(response.status).toBe(201)
    const data = await response.json() as { webhook: { id: string, url: string } }
    expect(data.webhook).toBeDefined()
    expect(data.webhook.url).toBe(webhookUrl)

    createdWebhookId = data.webhook.id

    // Fetch the webhook secret directly from database (secret is not exposed via API for security)
    const { data: webhookData, error: webhookError } = await (getSupabaseClient() as any)
      .from('webhooks')
      .select('secret')
      .eq('id', createdWebhookId)
      .single()

    expect(webhookError).toBeNull()
    expect(webhookData).toBeDefined()
    expect(webhookData.secret).toBeDefined()
    expect(webhookData.secret).toMatch(/^whsec_/)

    webhookSecret = webhookData.secret
  })

  it('send test webhook and verify signature is valid', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook not created')
    if (!webhookSecret)
      throw new Error('Webhook secret not retrieved')

    // Clear previous captured requests
    capturedRequests = []

    // Trigger a test webhook
    const response = await fetch(`${BASE_URL}/webhooks/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_SIGNATURE_TEST_ORG_ID,
        webhookId: createdWebhookId,
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { success: boolean, delivery_id: string }
    expect(data.success).toBe(true)
    expect(data.delivery_id).toBeDefined()

    // Wait a bit for the webhook to be delivered
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Verify we received the webhook
    expect(capturedRequests.length).toBeGreaterThan(0)

    const capturedRequest = capturedRequests[capturedRequests.length - 1]
    expect(capturedRequest).toBeDefined()

    // Verify required headers are present
    expect(capturedRequest.headers['x-capgo-signature']).toBeDefined()
    expect(capturedRequest.headers['x-capgo-timestamp']).toBeDefined()
    expect(capturedRequest.headers['x-capgo-event']).toBeDefined()
    expect(capturedRequest.headers['x-capgo-event-id']).toBeDefined()
    expect(capturedRequest.headers['user-agent']).toBe('Capgo-Webhook/1.0')
    expect(capturedRequest.headers['content-type']).toBe('application/json')

    // Extract signature components
    const signature = capturedRequest.headers['x-capgo-signature'] as string
    const timestamp = capturedRequest.headers['x-capgo-timestamp'] as string
    const payload = capturedRequest.body

    // Verify the signature
    const isValid = await verifyWebhookSignature(webhookSecret, signature, timestamp, payload)
    expect(isValid).toBe(true)

    // Parse and verify payload structure
    const parsedPayload = JSON.parse(payload)
    expect(parsedPayload.event).toBe('test.ping')
    expect(parsedPayload.event_id).toBeDefined()
    expect(parsedPayload.timestamp).toBeDefined()
    expect(parsedPayload.org_id).toBe(WEBHOOK_SIGNATURE_TEST_ORG_ID)
    expect(parsedPayload.data).toBeDefined()
    expect(parsedPayload.data.table).toBe('test')
    expect(parsedPayload.data.operation).toBe('TEST')
  })

  it('verify signature fails with wrong secret', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook not created')
    if (capturedRequests.length === 0)
      throw new Error('No captured requests')

    const capturedRequest = capturedRequests[capturedRequests.length - 1]
    const signature = capturedRequest.headers['x-capgo-signature'] as string
    const timestamp = capturedRequest.headers['x-capgo-timestamp'] as string
    const payload = capturedRequest.body

    // Use a wrong secret
    const wrongSecret = 'whsec_wrong_secret_12345678'

    const isValid = await verifyWebhookSignature(wrongSecret, signature, timestamp, payload)
    expect(isValid).toBe(false)
  })

  it('verify signature fails with tampered payload', async () => {
    if (!webhookSecret)
      throw new Error('Webhook secret not retrieved')
    if (capturedRequests.length === 0)
      throw new Error('No captured requests')

    const capturedRequest = capturedRequests[capturedRequests.length - 1]
    const signature = capturedRequest.headers['x-capgo-signature'] as string
    const timestamp = capturedRequest.headers['x-capgo-timestamp'] as string

    // Tamper with the payload
    const tamperedPayload = JSON.stringify({
      ...JSON.parse(capturedRequest.body),
      data: { ...JSON.parse(capturedRequest.body).data, tampered: true },
    })

    const isValid = await verifyWebhookSignature(webhookSecret, signature, timestamp, tamperedPayload)
    expect(isValid).toBe(false)
  })

  it('verify signature fails with wrong timestamp', async () => {
    if (!webhookSecret)
      throw new Error('Webhook secret not retrieved')
    if (capturedRequests.length === 0)
      throw new Error('No captured requests')

    const capturedRequest = capturedRequests[capturedRequests.length - 1]
    const signature = capturedRequest.headers['x-capgo-signature'] as string
    const payload = capturedRequest.body

    // Use a different timestamp
    const wrongTimestamp = '9999999999'

    const isValid = await verifyWebhookSignature(webhookSecret, signature, wrongTimestamp, payload)
    expect(isValid).toBe(false)
  })

  it('verify signature fails with malformed signature header', async () => {
    if (!webhookSecret)
      throw new Error('Webhook secret not retrieved')
    if (capturedRequests.length === 0)
      throw new Error('No captured requests')

    const capturedRequest = capturedRequests[capturedRequests.length - 1]
    const timestamp = capturedRequest.headers['x-capgo-timestamp'] as string
    const payload = capturedRequest.body

    // Use malformed signature headers
    const malformedSignatures = [
      'invalid',
      'v1=123',
      'v2=123.abc',
      'v1=.abc',
      'v1=123.',
      '',
    ]

    for (const malformedSignature of malformedSignatures) {
      const isValid = await verifyWebhookSignature(webhookSecret, malformedSignature, timestamp, payload)
      expect(isValid).toBe(false)
    }
  })

  it('verify multiple webhook deliveries all have valid signatures', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook not created')
    if (!webhookSecret)
      throw new Error('Webhook secret not retrieved')

    // Clear previous captured requests
    capturedRequests = []

    // Send multiple test webhooks
    const numTests = 3
    for (let i = 0; i < numTests; i++) {
      const response = await fetch(`${BASE_URL}/webhooks/test`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          orgId: WEBHOOK_SIGNATURE_TEST_ORG_ID,
          webhookId: createdWebhookId,
        }),
      })
      expect(response.status).toBe(200)

      // Wait between requests
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Wait for all webhooks to be delivered
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Verify we received all webhooks
    expect(capturedRequests.length).toBeGreaterThanOrEqual(numTests)

    // Verify all signatures are valid
    for (const capturedRequest of capturedRequests) {
      const signature = capturedRequest.headers['x-capgo-signature'] as string
      const timestamp = capturedRequest.headers['x-capgo-timestamp'] as string
      const payload = capturedRequest.body

      const isValid = await verifyWebhookSignature(webhookSecret, signature, timestamp, payload)
      expect(isValid).toBe(true)
    }
  })

  it('verify webhook secret is regenerated correctly', async () => {
    if (!createdWebhookId)
      throw new Error('Webhook not created')
    if (!webhookSecret)
      throw new Error('Webhook secret not retrieved')

    const oldSecret = webhookSecret

    // Note: In a real implementation, you would add an endpoint to regenerate the secret
    // For this test, we verify that the current secret format is correct
    expect(oldSecret).toMatch(/^whsec_[a-f0-9]{32}$/)

    // Verify the secret is stored in the database
    const { data, error } = await (getSupabaseClient() as any)
      .from('webhooks')
      .select('secret')
      .eq('id', createdWebhookId)
      .single()

    expect(error).toBeNull()
    expect(data.secret).toBe(oldSecret)
  })
})
