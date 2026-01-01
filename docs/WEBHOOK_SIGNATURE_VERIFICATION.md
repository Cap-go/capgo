# Webhook Signature Verification

This document explains how to verify webhook signatures from Capgo.

## Overview

Capgo signs all webhook requests with an HMAC-SHA256 signature to ensure that the requests originate from Capgo and haven't been tampered with. This signature is sent in the `X-Capgo-Signature` header of each webhook request.

## Signature Scheme

### Headers Sent

Every webhook request includes the following headers:

- `X-Capgo-Signature`: The HMAC signature (format: `v1={timestamp}.{hmac_hex}`)
- `X-Capgo-Timestamp`: Unix timestamp when the webhook was sent
- `X-Capgo-Event`: The event type (e.g., `app_versions.INSERT`)
- `X-Capgo-Event-ID`: Unique identifier for this webhook delivery
- `Content-Type`: Always `application/json`
- `User-Agent`: Always `Capgo-Webhook/1.0`

### Signature Format

The signature follows this format:

```
v1={timestamp}.{hmac_hex}
```

Where:
- `timestamp`: Unix timestamp (seconds since epoch) as a string
- `hmac_hex`: Hexadecimal-encoded HMAC-SHA256 hash

### Signing Payload

The signature is computed over the following payload:

```
{timestamp}.{json_body}
```

Where:
- `timestamp`: Same Unix timestamp from the header
- `json_body`: The raw JSON request body as a string

## Verification Steps

To verify a webhook signature:

1. **Extract the signature and timestamp** from the headers:
   ```javascript
   const signature = request.headers['x-capgo-signature']
   const timestamp = request.headers['x-capgo-timestamp']
   const body = request.body // raw JSON string
   ```

2. **Parse the signature** to extract the timestamp and HMAC:
   ```javascript
   const match = signature.match(/^v1=(\d+)\.([a-f0-9]+)$/)
   if (!match) {
     throw new Error('Invalid signature format')
   }
   const [, signatureTimestamp, receivedHmac] = match
   ```

3. **Verify the timestamp matches**:
   ```javascript
   if (signatureTimestamp !== timestamp) {
     throw new Error('Timestamp mismatch')
   }
   ```

4. **Recreate the signing payload**:
   ```javascript
   const signaturePayload = `${timestamp}.${body}`
   ```

5. **Compute the expected HMAC**:
   ```javascript
   const encoder = new TextEncoder()
   const key = await crypto.subtle.importKey(
     'raw',
     encoder.encode(webhookSecret), // Your webhook secret from the dashboard
     { name: 'HMAC', hash: 'SHA-256' },
     false,
     ['sign']
   )
   
   const signature = await crypto.subtle.sign(
     'HMAC',
     key,
     encoder.encode(signaturePayload)
   )
   
   const expectedHmac = Array.from(new Uint8Array(signature))
     .map(b => b.toString(16).padStart(2, '0'))
     .join('')
   ```

6. **Compare the HMACs** (use constant-time comparison in production):
   ```javascript
   if (expectedHmac !== receivedHmac) {
     throw new Error('Invalid signature')
   }
   ```

## Complete Example (Node.js)

```javascript
async function verifyWebhookSignature(secret, signatureHeader, timestamp, payload) {
  // Parse signature header
  const match = signatureHeader.match(/^v1=(\d+)\.([a-f0-9]+)$/)
  if (!match) {
    return false
  }

  const [, signatureTimestamp, receivedHmac] = match

  // Verify timestamp matches
  if (signatureTimestamp !== timestamp) {
    return false
  }

  // Recreate signing payload
  const signaturePayload = `${timestamp}.${payload}`

  // Generate expected HMAC
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signaturePayload)
  )

  const expectedHmac = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Compare HMACs (constant-time comparison recommended in production)
  return expectedHmac === receivedHmac
}

// Usage in Express.js
app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-capgo-signature']
  const timestamp = req.headers['x-capgo-timestamp']
  const body = JSON.stringify(req.body)

  const isValid = await verifyWebhookSignature(
    process.env.WEBHOOK_SECRET,
    signature,
    timestamp,
    body
  )

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  // Process webhook
  console.log('Webhook verified:', req.body)
  res.json({ status: 'received' })
})
```

## Security Best Practices

1. **Always verify signatures**: Never process a webhook without verifying its signature first.

2. **Check timestamp freshness**: Reject webhooks with timestamps that are too old (e.g., > 5 minutes) to prevent replay attacks:
   ```javascript
   const age = Date.now() / 1000 - parseInt(timestamp)
   if (age > 300) { // 5 minutes
     throw new Error('Webhook too old')
   }
   ```

3. **Use constant-time comparison**: To prevent timing attacks, use a constant-time comparison function when comparing HMACs.

4. **Keep secrets secure**: Store your webhook secret securely (environment variables, secrets manager) and never commit it to version control.

5. **Use HTTPS**: Always use HTTPS URLs for your webhook endpoints to prevent man-in-the-middle attacks.

## Getting Your Webhook Secret

Your webhook secret is generated automatically when you create a webhook. It follows the format:

```
whsec_{32-character-hex-string}
```

You can find it in your webhook settings in the Capgo dashboard.

## Testing

To test your signature verification implementation:

1. Create a webhook in your Capgo dashboard
2. Use the "Test Webhook" button to send a test event
3. Verify that your endpoint correctly validates the signature

You can also refer to the test suite in `tests/webhook-signature.test.ts` for a complete example of signature verification.

## References

- Webhook implementation: `supabase/functions/_backend/utils/webhook.ts`
- Test suite: `tests/webhook-signature.test.ts`
- Similar implementations: [Stripe Webhook Signatures](https://stripe.com/docs/webhooks/signatures), [GitHub Webhook Signatures](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
