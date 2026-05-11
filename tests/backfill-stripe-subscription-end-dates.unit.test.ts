import type Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { getStripeSubscriptionEndSnapshot } from '../scripts/backfill_stripe_subscription_end_dates.ts'

function subscription(overrides: Partial<Stripe.Subscription>): Stripe.Subscription {
  return {
    id: 'sub_test',
    object: 'subscription',
    cancel_at: null,
    cancel_at_period_end: false,
    customer: 'cus_test',
    ended_at: null,
    items: {
      data: [
        {
          current_period_end: 1_777_766_400,
          current_period_start: 1_775_174_400,
          plan: {
            usage_type: 'licensed',
          },
        } as Stripe.SubscriptionItem,
      ],
    },
    ...overrides,
  } as Stripe.Subscription
}

describe('stripe subscription end-date backfill helpers', () => {
  it.concurrent('uses Stripe ended_at as the final subscription end date', () => {
    const snapshot = getStripeSubscriptionEndSnapshot(subscription({
      ended_at: 1_777_507_200,
    }))

    expect(snapshot.canceled_at).toBe('2026-04-30T00:00:00.000Z')
  })

  it.concurrent('uses current period end for cancel-at-period-end subscriptions', () => {
    const snapshot = getStripeSubscriptionEndSnapshot(subscription({
      cancel_at_period_end: true,
    }))

    expect(snapshot.canceled_at).toBe('2026-05-03T00:00:00.000Z')
    expect(snapshot.subscription_anchor_start).toBe('2026-04-03T00:00:00.000Z')
    expect(snapshot.subscription_anchor_end).toBe('2026-05-03T00:00:00.000Z')
  })

  it.concurrent('clears subscription end date for active subscriptions without a scheduled cancellation', () => {
    const snapshot = getStripeSubscriptionEndSnapshot(subscription({}))

    expect(snapshot.canceled_at).toBeNull()
  })
})
