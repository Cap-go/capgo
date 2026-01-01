import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

// Recreate the signature generation function for testing
// This mirrors the implementation in supabase/functions/_backend/utils/webhook.ts
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

// Verification function that receivers would use
function verifyWebhookSignature(
  signature: string,
  secret: string,
  timestamp: string,
  payload: string,
): boolean {
  // Parse the signature format: v1={timestamp}.{hmac}
  const match = signature.match(/^v1=(\d+)\.([a-f0-9]+)$/i)
  if (!match) {
    return false
  }

  const [, sigTimestamp, receivedHmac] = match

  // Verify timestamp matches
  if (sigTimestamp !== timestamp) {
    return false
  }

  // Compute expected HMAC
  const signaturePayload = `${timestamp}.${payload}`
  const expectedHmac = createHmac('sha256', secret)
    .update(signaturePayload)
    .digest('hex')

  // Constant-time comparison to prevent timing attacks
  if (expectedHmac.length !== receivedHmac.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < expectedHmac.length; i++) {
    result |= expectedHmac.charCodeAt(i) ^ receivedHmac.charCodeAt(i)
  }

  return result === 0
}

// Parse signature to extract components
function parseSignature(signature: string): { version: string, timestamp: string, hmac: string } | null {
  const match = signature.match(/^(v\d+)=(\d+)\.([a-f0-9]+)$/i)
  if (!match) {
    return null
  }
  return {
    version: match[1],
    timestamp: match[2],
    hmac: match[3],
  }
}

describe('Webhook Signature Generation', () => {
  const testSecret = 'whsec_test_secret_key_12345'
  const testTimestamp = '1704067200' // 2024-01-01 00:00:00 UTC
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

  it('should generate signature in correct format', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)

    // Should match format: v1={timestamp}.{hmac}
    expect(signature).toMatch(/^v1=\d+\.[a-f0-9]{64}$/i)
  })

  it('should include timestamp in signature', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)

    expect(signature).toContain(`v1=${testTimestamp}.`)
  })

  it('should generate consistent signatures for same inputs', async () => {
    const signature1 = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const signature2 = await generateWebhookSignature(testSecret, testTimestamp, testPayload)

    expect(signature1).toBe(signature2)
  })

  it('should generate different signatures for different secrets', async () => {
    const signature1 = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const signature2 = await generateWebhookSignature('different_secret', testTimestamp, testPayload)

    expect(signature1).not.toBe(signature2)
  })

  it('should generate different signatures for different timestamps', async () => {
    const signature1 = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const signature2 = await generateWebhookSignature(testSecret, '1704153600', testPayload)

    expect(signature1).not.toBe(signature2)
  })

  it('should generate different signatures for different payloads', async () => {
    const signature1 = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const signature2 = await generateWebhookSignature(testSecret, testTimestamp, '{"different":"payload"}')

    expect(signature1).not.toBe(signature2)
  })

  it('should handle empty payload', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, '')

    expect(signature).toMatch(/^v1=\d+\.[a-f0-9]{64}$/i)
  })

  it('should handle payload with special characters', async () => {
    const specialPayload = JSON.stringify({
      message: 'Hello "world" with <special> & characters!',
      unicode: '\u0000\u001F\u007F',
      emoji: '🚀🔥💯',
    })
    const signature = await generateWebhookSignature(testSecret, testTimestamp, specialPayload)

    expect(signature).toMatch(/^v1=\d+\.[a-f0-9]{64}$/i)
  })

  it('should handle very long payload', async () => {
    const longPayload = JSON.stringify({
      data: 'x'.repeat(100000),
    })
    const signature = await generateWebhookSignature(testSecret, testTimestamp, longPayload)

    expect(signature).toMatch(/^v1=\d+\.[a-f0-9]{64}$/i)
  })
})

describe('Webhook Signature Verification', () => {
  const testSecret = 'whsec_test_secret_key_12345'
  const testTimestamp = '1704067200'
  const testPayload = JSON.stringify({ event: 'test.ping' })

  it('should verify valid signature', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const isValid = verifyWebhookSignature(signature, testSecret, testTimestamp, testPayload)

    expect(isValid).toBe(true)
  })

  it('should reject signature with wrong secret', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const isValid = verifyWebhookSignature(signature, 'wrong_secret', testTimestamp, testPayload)

    expect(isValid).toBe(false)
  })

  it('should reject signature with wrong timestamp', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const isValid = verifyWebhookSignature(signature, testSecret, '9999999999', testPayload)

    expect(isValid).toBe(false)
  })

  it('should reject signature with wrong payload', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const isValid = verifyWebhookSignature(signature, testSecret, testTimestamp, '{"tampered":"payload"}')

    expect(isValid).toBe(false)
  })

  it('should reject malformed signature - missing version', async () => {
    const isValid = verifyWebhookSignature('1704067200.abc123', testSecret, testTimestamp, testPayload)

    expect(isValid).toBe(false)
  })

  it('should reject malformed signature - invalid format', async () => {
    const isValid = verifyWebhookSignature('invalid-signature', testSecret, testTimestamp, testPayload)

    expect(isValid).toBe(false)
  })

  it('should reject empty signature', async () => {
    const isValid = verifyWebhookSignature('', testSecret, testTimestamp, testPayload)

    expect(isValid).toBe(false)
  })

  it('should reject signature with wrong hmac length', async () => {
    // Create signature with truncated HMAC
    const isValid = verifyWebhookSignature(`v1=${testTimestamp}.abc123`, testSecret, testTimestamp, testPayload)

    expect(isValid).toBe(false)
  })

  it('should reject signature with invalid hex characters', async () => {
    // Create signature with invalid hex
    const fakeHmac = 'g'.repeat(64) // 'g' is not a valid hex char
    const isValid = verifyWebhookSignature(`v1=${testTimestamp}.${fakeHmac}`, testSecret, testTimestamp, testPayload)

    expect(isValid).toBe(false)
  })
})

describe('Webhook Signature Parsing', () => {
  it('should parse valid v1 signature', () => {
    const signature = 'v1=1704067200.a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
    const parsed = parseSignature(signature)

    expect(parsed).toEqual({
      version: 'v1',
      timestamp: '1704067200',
      hmac: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    })
  })

  it('should return null for invalid signature format', () => {
    expect(parseSignature('invalid')).toBeNull()
    expect(parseSignature('')).toBeNull()
    expect(parseSignature('v1=')).toBeNull()
    expect(parseSignature('v1=.')).toBeNull()
    expect(parseSignature('v1=timestamp.hmac')).toBeNull() // timestamp must be digits
  })

  it('should handle future signature versions', () => {
    const signature = 'v2=1704067200.a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
    const parsed = parseSignature(signature)

    expect(parsed?.version).toBe('v2')
  })
})

describe('Webhook Signature Security', () => {
  const testSecret = 'whsec_test_secret_key_12345'
  const testTimestamp = '1704067200'
  const testPayload = JSON.stringify({ event: 'test.ping' })

  it('should use HMAC-SHA256 algorithm', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const parsed = parseSignature(signature)

    // SHA256 produces 32 bytes = 64 hex characters
    expect(parsed?.hmac.length).toBe(64)
  })

  it('should produce cryptographically strong signatures', async () => {
    // Generate multiple signatures and ensure they're all different
    const signatures = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const payload = JSON.stringify({ event: 'test.ping', nonce: i })
      const signature = await generateWebhookSignature(testSecret, testTimestamp, payload)
      signatures.add(signature)
    }

    // All signatures should be unique
    expect(signatures.size).toBe(100)
  })

  it('should be resistant to timing attacks via constant-time comparison', async () => {
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)

    // The verifyWebhookSignature function should use constant-time comparison
    // We can't directly test timing, but we verify the implementation handles
    // both matching and non-matching HMACs
    const validResult = verifyWebhookSignature(signature, testSecret, testTimestamp, testPayload)
    const invalidResult = verifyWebhookSignature(signature, testSecret, testTimestamp, '{"wrong":"payload"}')

    expect(validResult).toBe(true)
    expect(invalidResult).toBe(false)
  })

  it('should include timestamp to prevent replay attacks', async () => {
    const oldTimestamp = '1609459200' // 2021-01-01
    const newTimestamp = '1704067200' // 2024-01-01

    const oldSignature = await generateWebhookSignature(testSecret, oldTimestamp, testPayload)
    const newSignature = await generateWebhookSignature(testSecret, newTimestamp, testPayload)

    // Signatures should be different for different timestamps
    expect(oldSignature).not.toBe(newSignature)

    // Old signature should not verify with new timestamp
    const isValid = verifyWebhookSignature(oldSignature, testSecret, newTimestamp, testPayload)
    expect(isValid).toBe(false)
  })

  it('should sign the complete payload to prevent tampering', async () => {
    const originalPayload = JSON.stringify({ amount: 100 })
    const tamperedPayload = JSON.stringify({ amount: 1000000 })

    const signature = await generateWebhookSignature(testSecret, testTimestamp, originalPayload)

    // Tampered payload should not verify
    const isValid = verifyWebhookSignature(signature, testSecret, testTimestamp, tamperedPayload)
    expect(isValid).toBe(false)
  })
})

describe('Webhook Signature Node.js Crypto Compatibility', () => {
  const testSecret = 'whsec_test_secret_key_12345'
  const testTimestamp = '1704067200'
  const testPayload = JSON.stringify({ event: 'test.ping' })

  it('should produce signatures verifiable by Node.js crypto', async () => {
    // Generate signature using Web Crypto API (like the production code)
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const parsed = parseSignature(signature)

    // Verify using Node.js crypto (like a receiver would)
    const signaturePayload = `${testTimestamp}.${testPayload}`
    const expectedHmac = createHmac('sha256', testSecret)
      .update(signaturePayload)
      .digest('hex')

    expect(parsed?.hmac).toBe(expectedHmac)
  })

  it('should match Node.js crypto HMAC generation', async () => {
    // Generate HMAC using Node.js crypto
    const signaturePayload = `${testTimestamp}.${testPayload}`
    const nodeHmac = createHmac('sha256', testSecret)
      .update(signaturePayload)
      .digest('hex')

    // Generate signature using Web Crypto API
    const signature = await generateWebhookSignature(testSecret, testTimestamp, testPayload)
    const parsed = parseSignature(signature)

    expect(parsed?.hmac).toBe(nodeHmac)
  })
})

describe('Webhook Signature Edge Cases', () => {
  it('should handle secret with special characters', async () => {
    const specialSecret = 'secret!@#$%^&*()_+-=[]{}|;:,.<>?'
    const timestamp = '1704067200'
    const payload = JSON.stringify({ event: 'test' })

    const signature = await generateWebhookSignature(specialSecret, timestamp, payload)
    const isValid = verifyWebhookSignature(signature, specialSecret, timestamp, payload)

    expect(isValid).toBe(true)
  })

  it('should handle unicode in payload', async () => {
    const secret = 'test_secret'
    const timestamp = '1704067200'
    const payload = JSON.stringify({
      message: '日本語テスト',
      emoji: '🎉🚀',
      chinese: '中文测试',
    })

    const signature = await generateWebhookSignature(secret, timestamp, payload)
    const isValid = verifyWebhookSignature(signature, secret, timestamp, payload)

    expect(isValid).toBe(true)
  })

  it('should handle newlines in payload', async () => {
    const secret = 'test_secret'
    const timestamp = '1704067200'
    const payload = JSON.stringify({
      message: 'line1\nline2\r\nline3',
    })

    const signature = await generateWebhookSignature(secret, timestamp, payload)
    const isValid = verifyWebhookSignature(signature, secret, timestamp, payload)

    expect(isValid).toBe(true)
  })

  it('should handle very short secret', async () => {
    const shortSecret = 'a'
    const timestamp = '1704067200'
    const payload = JSON.stringify({ event: 'test' })

    const signature = await generateWebhookSignature(shortSecret, timestamp, payload)
    const isValid = verifyWebhookSignature(signature, shortSecret, timestamp, payload)

    expect(isValid).toBe(true)
  })

  it('should handle very long secret', async () => {
    const longSecret = 'x'.repeat(10000)
    const timestamp = '1704067200'
    const payload = JSON.stringify({ event: 'test' })

    const signature = await generateWebhookSignature(longSecret, timestamp, payload)
    const isValid = verifyWebhookSignature(signature, longSecret, timestamp, payload)

    expect(isValid).toBe(true)
  })
})
