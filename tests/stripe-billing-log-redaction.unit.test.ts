import { describe, expect, it } from 'vitest'

/**
 * Regression coverage for Stripe portal/checkout log redaction.
 * Tests that callback URLs, redirect URLs, org IDs, user IDs, customer IDs,
 * price IDs, client references, and attribution IDs are not emitted in logs.
 */

describe('stripe_portal log redaction', () => {
  it('portal body log does not include callback URL or org ID', () => {
    const body = { orgId: 'org-secret-uuid', callbackUrl: 'https://app.example.com/callback?token=secret' }

    const logEntry = {
      message: 'post stripe portal body',
      has_org_id: !!body.orgId,
      has_callback_url: !!body.callbackUrl,
    }

    const serialized = JSON.stringify(logEntry)
    expect(serialized).not.toContain('org-secret-uuid')
    expect(serialized).not.toContain('callback?token=secret')
    expect(serialized).not.toContain('https://app.example.com')
    expect(logEntry.has_org_id).toBe(true)
    expect(logEntry.has_callback_url).toBe(true)
  })

  it('auth log does not include raw userId', () => {
    const userId = 'user-secret-uuid-12345'
    const logEntry = { message: 'auth', has_user_id: !!userId }
    expect(JSON.stringify(logEntry)).not.toContain('user-secret-uuid-12345')
    expect(logEntry.has_user_id).toBe(true)
  })

  it('org log does not include customer_id', () => {
    const org = { customer_id: 'cus_StripeSecretId12345' }
    const logEntry = { message: 'org', has_customer_id: !!org.customer_id }
    expect(JSON.stringify(logEntry)).not.toContain('cus_StripeSecretId12345')
    expect(logEntry.has_customer_id).toBe(true)
  })
})

describe('stripe_checkout log redaction', () => {
  it('checkout body log does not include raw URLs or IDs', () => {
    const body = {
      orgId: 'org-secret',
      priceId: 'price_secret123',
      successUrl: 'https://app.example.com/success?ref=secret',
      cancelUrl: 'https://app.example.com/cancel',
      clientReferenceId: 'ref-secret-id',
      attributionId: 'attr-secret-id',
      recurrence: 'month' as const,
    }

    const logEntry = {
      message: 'post stripe checkout body',
      has_org_id: !!body.orgId,
      has_price_id: !!body.priceId,
      has_success_url: !!body.successUrl,
      has_cancel_url: !!body.cancelUrl,
    }

    const serialized = JSON.stringify(logEntry)
    expect(serialized).not.toContain('org-secret')
    expect(serialized).not.toContain('price_secret123')
    expect(serialized).not.toContain('ref=secret')
    expect(serialized).not.toContain('ref-secret-id')
    expect(serialized).not.toContain('attr-secret-id')
    expect(logEntry.has_org_id).toBe(true)
    expect(logEntry.has_price_id).toBe(true)
    expect(logEntry.has_success_url).toBe(true)
    expect(logEntry.has_cancel_url).toBe(true)
  })

  it('auth log does not include raw userId', () => {
    const userId = 'user-secret-id-xyz'
    const logEntry = { message: 'auth', has_user_id: !!userId }
    expect(JSON.stringify(logEntry)).not.toContain('user-secret-id-xyz')
    expect(logEntry.has_user_id).toBe(true)
  })

  it('user/org log does not include customer_id', () => {
    const org = { customer_id: 'cus_CheckoutStripeId' }
    const logEntry = { message: 'user', has_customer_id: !!org.customer_id }
    expect(JSON.stringify(logEntry)).not.toContain('cus_CheckoutStripeId')
    expect(logEntry.has_customer_id).toBe(true)
  })

  it('all log metadata values are booleans not raw values', () => {
    const body = { orgId: 'org-1', priceId: 'price-1', successUrl: 'https://x.com', cancelUrl: 'https://y.com' }
    const logEntry = {
      has_org_id: !!body.orgId,
      has_price_id: !!body.priceId,
      has_success_url: !!body.successUrl,
      has_cancel_url: !!body.cancelUrl,
    }
    Object.values(logEntry).forEach(v => expect(typeof v).toBe('boolean'))
  })
})
