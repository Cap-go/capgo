import { describe, expect, it } from 'vitest'
import { stripeEventTestUtils } from '../supabase/functions/_backend/triggers/stripe_event.ts'

describe('stripe paid_at tracking', () => {
  it.concurrent('sets paid_at when a subscription is first created', () => {
    const eventOccurredAtIso = '2026-03-24T12:00:00.000Z'

    expect(
      stripeEventTestUtils.getPaidAtUpdate(
        { paid_at: null, status: null },
        'created',
        eventOccurredAtIso,
      ),
    ).toBe(eventOccurredAtIso)
  })

  it.concurrent('sets paid_at when an org becomes paying for the first time', () => {
    const eventOccurredAtIso = '2026-03-24T12:00:00.000Z'

    expect(
      stripeEventTestUtils.getPaidAtUpdate(
        { paid_at: null, status: null },
        'succeeded',
        eventOccurredAtIso,
      ),
    ).toBe(eventOccurredAtIso)
  })

  it.concurrent('does not overwrite an existing paid_at timestamp', () => {
    expect(
      stripeEventTestUtils.getPaidAtUpdate(
        { paid_at: '2026-03-20T09:00:00.000Z', status: 'succeeded' },
        'succeeded',
        '2026-03-24T12:00:00.000Z',
      ),
    ).toBeUndefined()
  })

  it.concurrent('does not backfill legacy succeeded rows during unrelated updates', () => {
    expect(
      stripeEventTestUtils.getPaidAtUpdate(
        { paid_at: null, status: 'succeeded' },
        'succeeded',
        '2026-03-24T12:00:00.000Z',
      ),
    ).toBeUndefined()
  })

  it.concurrent('ignores non-succeeded status changes', () => {
    expect(
      stripeEventTestUtils.getPaidAtUpdate(
        { paid_at: null, status: null },
        'updated',
        '2026-03-24T12:00:00.000Z',
      ),
    ).toBeUndefined()
  })
  it.concurrent('does not set paid_at when a trial checkout creates a trialing subscription', () => {
    expect(
      stripeEventTestUtils.getPaidAtUpdate(
        { paid_at: null, status: null },
        'created',
        '2026-03-24T12:00:00.000Z',
        { subscriptionStatus: 'trialing' },
      ),
    ).toBeUndefined()
  })

  it.concurrent('sets paid_at on the first charge when the trial ends', () => {
    const eventOccurredAtIso = '2026-04-07T12:00:00.000Z'

    expect(
      stripeEventTestUtils.getPaidAtUpdate(
        { paid_at: null, status: 'succeeded' },
        'updated',
        eventOccurredAtIso,
        { subscriptionStatus: 'active', previousSubscriptionStatus: 'trialing' },
      ),
    ).toBe(eventOccurredAtIso)
  })

  it.concurrent('sets paid_at when a subscription recovers from past due without a prior payment', () => {
    const eventOccurredAtIso = '2026-04-09T12:00:00.000Z'

    expect(
      stripeEventTestUtils.getPaidAtUpdate(
        { paid_at: null, status: 'succeeded' },
        'updated',
        eventOccurredAtIso,
        { subscriptionStatus: 'active', previousSubscriptionStatus: 'past_due' },
      ),
    ).toBe(eventOccurredAtIso)
  })

  it.concurrent('keeps the existing paid_at when a trial ends', () => {
    expect(
      stripeEventTestUtils.getPaidAtUpdate(
        { paid_at: '2026-03-20T09:00:00.000Z', status: 'succeeded' },
        'updated',
        '2026-04-07T12:00:00.000Z',
        { subscriptionStatus: 'active', previousSubscriptionStatus: 'trialing' },
      ),
    ).toBeUndefined()
  })
})
