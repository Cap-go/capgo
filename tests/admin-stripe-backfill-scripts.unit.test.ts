import type Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { isActionableStripeCustomerId } from '../scripts/admin_stripe_backfill_utils.ts'
import { getCustomerProfileCountry, normalizeStripeCountryCode, shouldUpdateCustomerCountry } from '../scripts/backfill_stripe_customer_countries.ts'

describe('stripe backfill scripts', () => {
  it.concurrent('normalizes Stripe country codes', () => {
    expect(normalizeStripeCountryCode(' us ')).toBe('US')
    expect(normalizeStripeCountryCode('USA')).toBeNull()
    expect(normalizeStripeCountryCode('')).toBeNull()
  })

  it.concurrent('reads customer profile country from Stripe customers', () => {
    expect(getCustomerProfileCountry({
      deleted: false,
      address: { country: 'fr' },
    } as unknown as Stripe.Customer)).toBe('FR')

    expect(getCustomerProfileCountry({
      deleted: true,
      id: 'cus_deleted',
      object: 'customer',
    } as Stripe.DeletedCustomer)).toBeNull()
  })

  it.concurrent('decides when customer country rows need updates', () => {
    expect(shouldUpdateCustomerCountry(null, 'US', false)).toBe(true)
    expect(shouldUpdateCustomerCountry('US', 'FR', false)).toBe(false)
    expect(shouldUpdateCustomerCountry('US', 'FR', true)).toBe(true)
    expect(shouldUpdateCustomerCountry(' us ', 'US', true)).toBe(false)
  })

  it.concurrent('skips pending Stripe customer placeholders', () => {
    expect(isActionableStripeCustomerId('cus_123')).toBe(true)
    expect(isActionableStripeCustomerId('pending_org_id')).toBe(false)
    expect(isActionableStripeCustomerId('')).toBe(false)
  })
})
