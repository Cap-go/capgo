import { describe, expect, it, vi } from 'vitest'
import { getCreateCustomerLogMetadata, getCreateStripeCustomerInfoLogMetadata } from '../supabase/functions/_backend/utils/stripe.ts'

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseAdmin: vi.fn(),
}))

describe('stripe customer log redaction', () => {
  it.concurrent('keeps customer creation cloudlog payloads free of durable identifiers', () => {
    const identifiers = {
      customerId: 'cus_secret_customer_123',
      email: 'billing-owner@example.com',
      name: 'Secret Billing Org',
      orgId: 'org_secret_456',
      planId: 123,
      productId: 'prod_secret_product_789',
      userId: 'user_secret_abc',
    }

    const payloads = [
      {
        requestId: 'request-id',
        message: 'createCustomer',
        ...getCreateCustomerLogMetadata(identifiers.email, identifiers.userId, identifiers.orgId, identifiers.name),
      },
      {
        requestId: 'request-id',
        message: 'createCustomer no stripe key',
        ...getCreateCustomerLogMetadata(identifiers.email, identifiers.userId, identifiers.orgId, identifiers.name),
      },
      {
        requestId: 'request-id',
        message: 'createInfo',
        ...getCreateStripeCustomerInfoLogMetadata(
          identifiers.orgId,
          {
            id: identifiers.planId,
            name: 'Solo',
            stripe_id: identifiers.productId,
          },
          identifiers.customerId,
        ),
      },
    ]

    expect(payloads[0]).toMatchObject({
      hasEmail: true,
      hasName: true,
      hasOrgId: true,
      hasUserId: true,
    })
    expect(payloads[1]).toMatchObject({
      hasEmail: true,
      hasName: true,
      hasOrgId: true,
      hasUserId: true,
    })
    expect(payloads[2]).toMatchObject({
      hasCustomerId: true,
      hasOrgId: true,
      hasPlanId: true,
      hasStripeProductId: true,
      planName: 'Solo',
    })

    const serializedPayloads = JSON.stringify(payloads)

    expect(serializedPayloads).not.toContain(identifiers.customerId)
    expect(serializedPayloads).not.toContain(identifiers.email)
    expect(serializedPayloads).not.toContain(identifiers.name)
    expect(serializedPayloads).not.toContain(identifiers.orgId)
    expect(serializedPayloads).not.toContain(String(identifiers.planId))
    expect(serializedPayloads).not.toContain(identifiers.productId)
    expect(serializedPayloads).not.toContain(identifiers.userId)
  })
})
