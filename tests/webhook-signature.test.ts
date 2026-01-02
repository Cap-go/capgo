import type { Server } from 'node:http'
import { createHmac, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getSupabaseClient, headers, TEST_EMAIL, USER_ID } from './test-utils.ts'

// Webhook receiver state
interface ReceivedWebhook {
  headers: Record<string, string | string[] | undefined>
  body: string
  timestamp: number
}

let webhookServer: Server | null = null
let receivedWebhooks: ReceivedWebhook[] = []
let serverPort: number = 0

// Test data
const WEBHOOK_TEST_ORG_ID = randomUUID()
const globalId = randomUUID()
const customerId = `cus_test_${WEBHOOK_TEST_ORG_ID}`
let createdWebhookId: string | null = null
let webhookSecret: string | null = null

/**
 * Verify webhook signature using the same algorithm as documented
 * This is what a real webhook receiver would implement
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

  // Compute expected HMAC using the documented algorithm
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

/**
 * Start a local HTTP server to receive webhooks
 */
function startWebhookServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    receivedWebhooks = []

    webhookServer = createServer((req, res) => {
      let body = ''

      req.on('data', (chunk) => {
        body += chunk.toString()
      })

      req.on('end', () => {
        // Store received webhook
        receivedWebhooks.push({
          headers: req.headers,
          body,
          timestamp: Date.now(),
        })

        // Always return 200 to indicate successful receipt
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ received: true }))
      })

      req.on('error', (err) => {
        console.error('Webhook server request error:', err)
        res.writeHead(500)
        res.end()
      })
    })

    webhookServer.on('error', reject)

    // Listen on random available port
    webhookServer.listen(0, '127.0.0.1', () => {
      const address = webhookServer!.address()
      if (typeof address === 'object' && address !== null) {
        serverPort = address.port
        resolve(serverPort)
      }
      else {
        reject(new Error('Failed to get server port'))
      }
    })
  })
}

function stopWebhookServer(): Promise<void> {
  return new Promise((resolve) => {
    if (webhookServer) {
      webhookServer.close(() => {
        webhookServer = null
        resolve()
      })
    }
    else {
      resolve()
    }
  })
}

beforeAll(async () => {
  // Start webhook receiver server
  await startWebhookServer()

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
  // Stop webhook server
  await stopWebhookServer()

  // Clean up created webhooks
  if (createdWebhookId) {
    await (getSupabaseClient() as any).from('webhooks').delete().eq('id', createdWebhookId)
  }
  // Clean up test organization and stripe_info
  await getSupabaseClient().from('orgs').delete().eq('id', WEBHOOK_TEST_ORG_ID)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
})

describe('end-to-end webhook signature verification', () => {
  it('should create webhook pointing to local server', async () => {
    const webhookUrl = `http://127.0.0.1:${serverPort}/webhook`

    const response = await fetch(`${BASE_URL}/webhooks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        name: `E2E Signature Test Webhook ${globalId}`,
        url: webhookUrl,
        events: ['app_versions'],
      }),
    })

    expect(response.status).toBe(201)
    const data = await response.json() as { status: string, webhook: { id: string, name: string, url: string } }
    expect(data.status).toBe('Webhook created')
    expect(data.webhook.url).toBe(webhookUrl)

    createdWebhookId = data.webhook.id
  })

  it('should fetch webhook secret from database', async () => {
    expect(createdWebhookId).not.toBeNull()

    // Fetch the webhook secret directly from database
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

  it('should trigger test webhook and receive it with valid signature', async () => {
    expect(createdWebhookId).not.toBeNull()
    expect(webhookSecret).not.toBeNull()

    // Clear previous webhooks
    receivedWebhooks = []

    // Trigger the test webhook
    const response = await fetch(`${BASE_URL}/webhooks/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        webhookId: createdWebhookId,
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { success: boolean, delivery_id: string }
    expect(data.success).toBe(true)
    expect(data.delivery_id).toBeDefined()

    // Verify we received the webhook
    expect(receivedWebhooks.length).toBe(1)

    const received = receivedWebhooks[0]

    // Verify required headers are present
    expect(received.headers['x-capgo-signature']).toBeDefined()
    expect(received.headers['x-capgo-timestamp']).toBeDefined()
    expect(received.headers['x-capgo-event']).toBe('test.ping')
    expect(received.headers['x-capgo-event-id']).toBeDefined()
    expect(received.headers['content-type']).toBe('application/json')
    expect(received.headers['user-agent']).toBe('Capgo-Webhook/1.0')

    // Verify the signature
    const signature = received.headers['x-capgo-signature'] as string
    const verification = verifyWebhookSignature(signature, webhookSecret!, received.body)

    expect(verification.valid).toBe(true)
    expect(verification.timestamp).toBe(received.headers['x-capgo-timestamp'])
    expect(verification.error).toBeUndefined()
  })

  it('should fail verification with wrong secret', async () => {
    expect(receivedWebhooks.length).toBe(1)

    const received = receivedWebhooks[0]
    const signature = received.headers['x-capgo-signature'] as string

    // Try to verify with wrong secret
    const verification = verifyWebhookSignature(signature, 'wrong_secret_12345', received.body)

    expect(verification.valid).toBe(false)
    expect(verification.error).toBe('HMAC verification failed')
  })

  it('should fail verification with tampered body', async () => {
    expect(receivedWebhooks.length).toBe(1)

    const received = receivedWebhooks[0]
    const signature = received.headers['x-capgo-signature'] as string

    // Try to verify with tampered body
    const tamperedBody = JSON.stringify({ ...JSON.parse(received.body), tampered: true })
    const verification = verifyWebhookSignature(signature, webhookSecret!, tamperedBody)

    expect(verification.valid).toBe(false)
    expect(verification.error).toBe('HMAC verification failed')
  })

  it('should have valid payload structure', async () => {
    expect(receivedWebhooks.length).toBe(1)

    const received = receivedWebhooks[0]
    const payload = JSON.parse(received.body)

    // Verify payload structure matches WebhookPayload interface
    expect(payload.event).toBe('test.ping')
    expect(payload.event_id).toBeDefined()
    expect(typeof payload.event_id).toBe('string')
    expect(payload.timestamp).toBeDefined()
    expect(payload.org_id).toBe(WEBHOOK_TEST_ORG_ID)
    expect(payload.data).toBeDefined()
    expect(payload.data.table).toBe('test')
    expect(payload.data.operation).toBe('TEST')
    expect(payload.data.record_id).toBe('test-record-id')
  })

  it('should verify timestamp is recent (within 5 minutes)', async () => {
    expect(receivedWebhooks.length).toBe(1)

    const received = receivedWebhooks[0]
    const signature = received.headers['x-capgo-signature'] as string
    const verification = verifyWebhookSignature(signature, webhookSecret!, received.body)

    expect(verification.valid).toBe(true)
    expect(verification.timestamp).toBeDefined()

    // Timestamp should be within 5 minutes of now
    const signatureTimestamp = Number.parseInt(verification.timestamp!, 10)
    const nowSeconds = Math.floor(Date.now() / 1000)
    const fiveMinutesSeconds = 5 * 60

    expect(Math.abs(nowSeconds - signatureTimestamp)).toBeLessThan(fiveMinutesSeconds)
  })

  it('should trigger another webhook and verify unique event_id', async () => {
    expect(createdWebhookId).not.toBeNull()

    const previousWebhookCount = receivedWebhooks.length
    const previousEventId = JSON.parse(receivedWebhooks[0].body).event_id

    // Trigger another test webhook
    const response = await fetch(`${BASE_URL}/webhooks/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: WEBHOOK_TEST_ORG_ID,
        webhookId: createdWebhookId,
      }),
    })

    expect(response.status).toBe(200)

    // Should have received another webhook
    expect(receivedWebhooks.length).toBe(previousWebhookCount + 1)

    const newWebhook = receivedWebhooks[receivedWebhooks.length - 1]
    const newPayload = JSON.parse(newWebhook.body)

    // Event ID should be unique
    expect(newPayload.event_id).not.toBe(previousEventId)

    // Signature should still be valid
    const signature = newWebhook.headers['x-capgo-signature'] as string
    const verification = verifyWebhookSignature(signature, webhookSecret!, newWebhook.body)
    expect(verification.valid).toBe(true)
  })
})

describe('webhook signature format validation', () => {
  it('should reject malformed signatures', () => {
    const body = '{"test": true}'
    const secret = 'test_secret'

    // Missing version prefix
    expect(verifyWebhookSignature('1234567890.abc123', secret, body).valid).toBe(false)

    // Invalid format
    expect(verifyWebhookSignature('invalid', secret, body).valid).toBe(false)

    // Empty signature
    expect(verifyWebhookSignature('', secret, body).valid).toBe(false)

    // Missing HMAC
    expect(verifyWebhookSignature('v1=1234567890.', secret, body).valid).toBe(false)

    // Missing timestamp
    expect(verifyWebhookSignature('v1=.abc123', secret, body).valid).toBe(false)
  })

  it('should parse signature components correctly', () => {
    const body = '{"test": true}'
    const secret = 'test_secret'
    const timestamp = '1704067200'

    // Create a valid signature manually
    const signaturePayload = `${timestamp}.${body}`
    const hmac = createHmac('sha256', secret).update(signaturePayload).digest('hex')
    const signature = `v1=${timestamp}.${hmac}`

    const result = verifyWebhookSignature(signature, secret, body)

    expect(result.valid).toBe(true)
    expect(result.timestamp).toBe(timestamp)
  })
})
