import type Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { isActionableStripeCustomerId } from '../scripts/admin_stripe_backfill_utils.ts'
import { buildOrgConversionRateBackfillRows, calculateOrgConversionRate } from '../scripts/backfill_org_conversion_rate_trend.ts'
import { getCustomerProfileCountry, normalizeStripeCountryCode, shouldUpdateCustomerCountry } from '../scripts/backfill_stripe_customer_countries.ts'

describe('admin Stripe backfill scripts', () => {
  it.concurrent('calculates org conversion rates from paying and org snapshots', () => {
    expect(calculateOrgConversionRate(25, 200)).toBe(12.5)
    expect(calculateOrgConversionRate('1', '3')).toBe(33.3)
    expect(calculateOrgConversionRate(10, 0)).toBe(0)
  })

  it.concurrent('marks only changed org conversion rows', () => {
    const rows = buildOrgConversionRateBackfillRows([
      {
        date_id: '2026-04-01',
        paying: 25,
        org_conversion_rate: 0,
        plan_enterprise: 0,
        plan_enterprise_conversion_rate: 0,
        plan_maker: 10,
        plan_maker_conversion_rate: 0,
        plan_solo: 15,
        plan_solo_conversion_rate: 0,
        plan_team: 0,
        plan_team_conversion_rate: 0,
      },
      {
        date_id: '2026-04-02',
        paying: 50,
        org_conversion_rate: 25,
        plan_enterprise: 0,
        plan_enterprise_conversion_rate: 0,
        plan_maker: 20,
        plan_maker_conversion_rate: 10,
        plan_solo: 30,
        plan_solo_conversion_rate: 15,
        plan_team: 0,
        plan_team_conversion_rate: 0,
      },
    ] as any, [
      ...Array.from({ length: 200 }, () => ({ created_at: '2026-04-01T12:00:00.000Z' })),
      { created_at: '2026-04-03T00:00:00.000Z' },
    ])

    expect(rows).toEqual([
      {
        date_id: '2026-04-01',
        orgs: 200,
        paying: 25,
        current_plan_rates: {
          enterprise: 0,
          maker: 0,
          solo: 0,
          team: 0,
        },
        current_rate: 0,
        next_plan_rates: {
          enterprise: 0,
          maker: 5,
          solo: 7.5,
          team: 0,
        },
        next_rate: 12.5,
        changed: true,
      },
      {
        date_id: '2026-04-02',
        orgs: 200,
        paying: 50,
        current_plan_rates: {
          enterprise: 0,
          maker: 10,
          solo: 15,
          team: 0,
        },
        current_rate: 25,
        next_plan_rates: {
          enterprise: 0,
          maker: 10,
          solo: 15,
          team: 0,
        },
        next_rate: 25,
        changed: false,
      },
    ])
  })

  it.concurrent('marks rows changed when only plan conversion rate differs', () => {
    const rows = buildOrgConversionRateBackfillRows([
      {
        date_id: '2026-04-10',
        paying: 40,
        org_conversion_rate: 20,
        plan_enterprise: 0,
        plan_enterprise_conversion_rate: 0,
        plan_maker: 10,
        plan_maker_conversion_rate: 4.5,
        plan_solo: 30,
        plan_solo_conversion_rate: 15,
        plan_team: 0,
        plan_team_conversion_rate: 0,
      },
    ] as any, Array.from({ length: 200 }, () => ({ created_at: '2026-04-01T12:00:00.000Z' })))

    expect(rows).toEqual([
      {
        date_id: '2026-04-10',
        orgs: 200,
        paying: 40,
        current_plan_rates: {
          enterprise: 0,
          maker: 4.5,
          solo: 15,
          team: 0,
        },
        current_rate: 20,
        next_plan_rates: {
          enterprise: 0,
          maker: 5,
          solo: 15,
          team: 0,
        },
        next_rate: 20,
        changed: true,
      },
    ])
  })

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
