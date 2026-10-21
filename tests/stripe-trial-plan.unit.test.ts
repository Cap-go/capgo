import type Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'
import {
  cancelTrialPlanScheduleForSubscription,
  findPendingTrialPlanSchedule,
  getTrialPlanStartDate,
} from '../supabase/functions/_backend/utils/stripe_trial_plan.ts'

const context = { get: () => 'request-id' } as any

function fakeStripe(schedules: Array<Partial<Stripe.SubscriptionSchedule>>) {
  const cancel = vi.fn(async (id: string) => ({ id }))
  const stripe = {
    subscriptionSchedules: {
      list: vi.fn(async () => ({ data: schedules })),
      cancel,
    },
  } as unknown as Stripe
  return { stripe, cancel }
}

describe('trial plan start date', () => {
  const now = Date.parse('2026-10-21T12:00:00.000Z')

  it('starts at 00:00 UTC on the trial end date, when trial access stops', () => {
    expect(getTrialPlanStartDate('2026-11-04T09:30:00.000Z', now)?.toISOString()).toBe('2026-11-04T00:00:00.000Z')
  })

  it('returns null once the trial has ended or for invalid dates', () => {
    expect(getTrialPlanStartDate('2026-10-21T23:00:00.000Z', now)).toBeNull()
    expect(getTrialPlanStartDate('2026-10-01T00:00:00.000Z', now)).toBeNull()
    expect(getTrialPlanStartDate('not a date', now)).toBeNull()
    expect(getTrialPlanStartDate(null, now)).toBeNull()
  })
})

describe('trial plan schedules', () => {
  it('only matches Capgo trial schedules that have not started', async () => {
    const { stripe } = fakeStripe([
      { id: 'sub_sched_other', status: 'not_started', metadata: {} },
      { id: 'sub_sched_done', status: 'released', metadata: { capgo_trial_plan: 'true' } },
      { id: 'sub_sched_trial', status: 'not_started', metadata: { capgo_trial_plan: 'true' } },
    ])
    expect((await findPendingTrialPlanSchedule(stripe, 'cus_1'))?.id).toBe('sub_sched_trial')
  })

  it('cancels the pending trial plan when checkout creates another subscription', async () => {
    const { stripe, cancel } = fakeStripe([{ id: 'sub_sched_trial', status: 'not_started', metadata: { capgo_trial_plan: 'true' } }])
    await cancelTrialPlanScheduleForSubscription(context, stripe, { id: 'sub_1', customer: 'cus_1', schedule: null } as unknown as Stripe.Subscription)
    expect(cancel).toHaveBeenCalledWith('sub_sched_trial')
  })

  it('keeps the schedule when the subscription is the one it started', async () => {
    const { stripe, cancel } = fakeStripe([{ id: 'sub_sched_trial', status: 'not_started', metadata: { capgo_trial_plan: 'true' } }])
    await cancelTrialPlanScheduleForSubscription(context, stripe, { id: 'sub_1', customer: 'cus_1', schedule: 'sub_sched_trial' } as unknown as Stripe.Subscription)
    expect(cancel).not.toHaveBeenCalled()
  })
})
