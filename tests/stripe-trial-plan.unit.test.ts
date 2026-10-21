import type Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'
import {
  cancelDuplicateTrialPlanSchedules,
  isTrialPlanFirstInvoiceUnpaid,
  releaseTrialPlanSchedule,
  cancelTrialPlanScheduleForSubscription,
  findPendingTrialPlanSchedule,
  getTrialPlanStartDate,
  settleTrialPlanFirstInvoice,
} from '../supabase/functions/_backend/utils/stripe_trial_plan.ts'

const context = { get: () => 'request-id' } as any

function fakeStripe(schedules: Array<Partial<Stripe.SubscriptionSchedule>>) {
  const cancel = vi.fn(async (id: string) => ({ id }))
  const list = vi.fn(async (_params: Stripe.SubscriptionScheduleListParams) => ({ data: schedules }))
  const stripe = {
    subscriptionSchedules: { list, cancel },
  } as unknown as Stripe
  return { stripe, cancel, list }
}

function fakeInvoiceStripe(invoice: Partial<Stripe.Invoice>, payResult: 'paid' | 'declined', subscriptionStatus: Stripe.Subscription.Status = 'active') {
  const state = { ...invoice }
  const finalizeInvoice = vi.fn(async () => Object.assign(state, { status: 'open' }))
  const pay = vi.fn(async () => {
    if (payResult === 'declined')
      throw new Error('card_declined')
    return Object.assign(state, { status: 'paid' })
  })
  const release = vi.fn(async (id: string) => ({ id, status: 'released' }))
  const stripe = {
    invoices: { retrieve: vi.fn(async () => ({ ...state })), finalizeInvoice, pay },
    subscriptions: { retrieve: vi.fn(async (id: string) => ({ id, schedule: 'sub_sched_trial', status: subscriptionStatus, latest_invoice: 'in_1', metadata: { capgo_trial_plan: 'true' } })) },
    subscriptionSchedules: {
      release,
      retrieve: vi.fn(async (id: string) => ({ id, status: 'active', metadata: { capgo_trial_plan: 'true' } })),
    },
  } as unknown as Stripe
  return { stripe, finalizeInvoice, pay, release }
}

const trialSubscription = { id: 'sub_1', latest_invoice: 'in_1', metadata: { capgo_trial_plan: 'true' } } as unknown as Stripe.Subscription

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
  it('only matches Capgo trial schedules that have not started, oldest first', async () => {
    const { stripe, list } = fakeStripe([
      { id: 'sub_sched_other', status: 'not_started', created: 1, metadata: {} },
      { id: 'sub_sched_done', status: 'released', created: 2, metadata: { capgo_trial_plan: 'true' } },
      { id: 'sub_sched_newer', status: 'not_started', created: 4, metadata: { capgo_trial_plan: 'true' } },
      { id: 'sub_sched_trial', status: 'not_started', created: 3, metadata: { capgo_trial_plan: 'true' } },
    ])
    expect((await findPendingTrialPlanSchedule(stripe, 'cus_1'))?.id).toBe('sub_sched_trial')
    expect(list).toHaveBeenCalledWith({ customer: 'cus_1', limit: 100 })
  })

  it('cancels duplicate pending schedules and keeps the oldest', async () => {
    const { stripe, cancel, list } = fakeStripe([
      { id: 'sub_sched_b', status: 'not_started', created: 2, metadata: { capgo_trial_plan: 'true' } },
      { id: 'sub_sched_a', status: 'not_started', created: 1, metadata: { capgo_trial_plan: 'true' } },
    ])
    await cancelDuplicateTrialPlanSchedules(context, stripe, 'cus_1')
    expect(list).toHaveBeenCalledWith({ customer: 'cus_1', limit: 100 })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledWith('sub_sched_b')
  })

  it('cancels every pending trial plan when checkout creates another subscription', async () => {
    const { stripe, cancel, list } = fakeStripe([
      { id: 'sub_sched_trial', status: 'not_started', created: 1, metadata: { capgo_trial_plan: 'true' } },
      { id: 'sub_sched_dup', status: 'not_started', created: 2, metadata: { capgo_trial_plan: 'true' } },
    ])
    await cancelTrialPlanScheduleForSubscription(context, stripe, { id: 'sub_1', customer: 'cus_1', schedule: null, status: 'active' } as unknown as Stripe.Subscription)
    expect(list).toHaveBeenCalledWith({ customer: 'cus_1', limit: 100 })
    expect(cancel).toHaveBeenCalledWith('sub_sched_trial')
    expect(cancel).toHaveBeenCalledWith('sub_sched_dup')
  })

  it('keeps the schedule while the checkout subscription is still incomplete', async () => {
    const { stripe, cancel, list } = fakeStripe([{ id: 'sub_sched_trial', status: 'not_started', metadata: { capgo_trial_plan: 'true' } }])
    await cancelTrialPlanScheduleForSubscription(context, stripe, { id: 'sub_1', customer: 'cus_1', schedule: null, status: 'incomplete' } as unknown as Stripe.Subscription)
    expect(list).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('keeps the schedule when the subscription is the one it started', async () => {
    const { stripe, cancel } = fakeStripe([{ id: 'sub_sched_trial', status: 'not_started', metadata: { capgo_trial_plan: 'true' } }])
    await cancelTrialPlanScheduleForSubscription(context, stripe, { id: 'sub_1', customer: 'cus_1', schedule: 'sub_sched_trial', status: 'active' } as unknown as Stripe.Subscription)
    expect(cancel).not.toHaveBeenCalled()
  })
})

describe('trial plan first invoice', () => {
  it('charges the draft first invoice and converts once it is paid', async () => {
    const { stripe, finalizeInvoice, pay } = fakeInvoiceStripe({ id: 'in_1', status: 'draft', billing_reason: 'subscription_create' }, 'paid')
    expect(await settleTrialPlanFirstInvoice(context, stripe, trialSubscription)).toBe('first_paid')
    expect(finalizeInvoice).toHaveBeenCalledWith('in_1')
    expect(pay).toHaveBeenCalledWith('in_1', { off_session: true })
  })

  it('does not convert while the first invoice is unpaid', async () => {
    const { stripe, release } = fakeInvoiceStripe({ id: 'in_1', status: 'draft', billing_reason: 'subscription_create' }, 'declined')
    expect(await settleTrialPlanFirstInvoice(context, stripe, trialSubscription)).toBe('unpaid')
    expect(release).not.toHaveBeenCalled()
  })

  it('releases the schedule once paid so the subscription can be canceled normally', async () => {
    const { stripe, release } = fakeInvoiceStripe({ id: 'in_1', status: 'draft', billing_reason: 'subscription_create' }, 'paid')
    const scheduled = { ...trialSubscription, schedule: 'sub_sched_trial' } as unknown as Stripe.Subscription
    expect(await settleTrialPlanFirstInvoice(context, stripe, scheduled)).toBe('first_paid')
    expect(release).toHaveBeenCalledWith('sub_sched_trial')
  })

  it('never charges the first invoice once the live subscription is canceled', async () => {
    const { stripe, finalizeInvoice, pay } = fakeInvoiceStripe({ id: 'in_1', status: 'open', billing_reason: 'subscription_create' }, 'paid', 'canceled')
    expect(await settleTrialPlanFirstInvoice(context, stripe, trialSubscription)).toBe('unpaid')
    expect(finalizeInvoice).not.toHaveBeenCalled()
    expect(pay).not.toHaveBeenCalled()
  })

  it('leaves renewals to the normal subscription flow', async () => {
    const { stripe, pay } = fakeInvoiceStripe({ id: 'in_1', status: 'open', billing_reason: 'subscription_cycle' }, 'declined')
    expect(await settleTrialPlanFirstInvoice(context, stripe, trialSubscription)).toBe('renewal')
    expect(pay).not.toHaveBeenCalled()
  })
})

describe('trial plan schedule release', () => {
  function stripeWithSchedule(metadata: Record<string, string>) {
    const release = vi.fn(async (id: string) => ({ id }))
    const stripe = {
      subscriptions: { retrieve: vi.fn(async (id: string) => ({ id, schedule: 'sub_sched_1' })) },
      subscriptionSchedules: { retrieve: vi.fn(async (id: string) => ({ id, status: 'active', metadata })), release },
    } as unknown as Stripe
    return { stripe, release }
  }

  it('releases the trial plan schedule before cancel or resume', async () => {
    const { stripe, release } = stripeWithSchedule({ capgo_trial_plan: 'true' })
    await releaseTrialPlanSchedule(context, stripe, 'sub_1')
    expect(release).toHaveBeenCalledWith('sub_sched_1')
  })

  it('leaves other schedules and their future phases alone', async () => {
    const { stripe, release } = stripeWithSchedule({})
    await releaseTrialPlanSchedule(context, stripe, 'sub_1')
    expect(release).not.toHaveBeenCalled()
  })

  it('treats a schedule released concurrently as done', async () => {
    let released = false
    const release = vi.fn(async () => {
      released = true
      throw new Error('schedule already released')
    })
    const stripe = {
      subscriptions: { retrieve: vi.fn(async (id: string) => ({ id, schedule: 'sub_sched_1' })) },
      subscriptionSchedules: {
        retrieve: vi.fn(async (id: string) => ({ id, status: released ? 'released' : 'active', metadata: { capgo_trial_plan: 'true' } })),
        release,
      },
    } as unknown as Stripe
    await expect(releaseTrialPlanSchedule(context, stripe, 'sub_1')).resolves.toBeUndefined()
    expect(release).toHaveBeenCalledWith('sub_sched_1')
  })

  it('still fails when the schedule is active after a failed release', async () => {
    const stripe = {
      subscriptions: { retrieve: vi.fn(async (id: string) => ({ id, schedule: 'sub_sched_1' })) },
      subscriptionSchedules: {
        retrieve: vi.fn(async (id: string) => ({ id, status: 'active', metadata: { capgo_trial_plan: 'true' } })),
        release: vi.fn(async () => {
          throw new Error('stripe down')
        }),
      },
    } as unknown as Stripe
    await expect(releaseTrialPlanSchedule(context, stripe, 'sub_1')).rejects.toThrow('stripe down')
  })
})

describe('never-paid trial plan', () => {
  function stripeWithInvoice(invoice: Partial<Stripe.Invoice>) {
    return { invoices: { retrieve: vi.fn(async () => invoice) } } as unknown as Stripe
  }

  it('flags a trial plan whose first invoice was never paid', async () => {
    expect(await isTrialPlanFirstInvoiceUnpaid(stripeWithInvoice({ billing_reason: 'subscription_create', status: 'uncollectible' }), trialSubscription)).toBe(true)
  })

  it('does not flag a paid first invoice, a renewal, or another subscription', async () => {
    expect(await isTrialPlanFirstInvoiceUnpaid(stripeWithInvoice({ billing_reason: 'subscription_create', status: 'paid' }), trialSubscription)).toBe(false)
    expect(await isTrialPlanFirstInvoiceUnpaid(stripeWithInvoice({ billing_reason: 'subscription_cycle', status: 'open' }), trialSubscription)).toBe(false)
    const other = { id: 'sub_2', latest_invoice: 'in_2', metadata: {} } as unknown as Stripe.Subscription
    expect(await isTrialPlanFirstInvoiceUnpaid(stripeWithInvoice({ billing_reason: 'subscription_create', status: 'open' }), other)).toBe(false)
  })
})

describe('pending schedule pagination', () => {
  it('reads every page before reporting pending schedules', async () => {
    const list = vi.fn(async (params: Stripe.SubscriptionScheduleListParams) => params.starting_after
      ? { data: [{ id: 'sub_sched_late', status: 'not_started', created: 1, metadata: { capgo_trial_plan: 'true' } }], has_more: false }
      : { data: [{ id: 'sub_sched_other', status: 'released', created: 2, metadata: {} }], has_more: true })
    const cancel = vi.fn(async (id: string) => ({ id }))
    const stripe = { subscriptionSchedules: { list, cancel } } as unknown as Stripe
    expect((await findPendingTrialPlanSchedule(stripe, 'cus_1'))?.id).toBe('sub_sched_late')
    expect(list).toHaveBeenNthCalledWith(2, { customer: 'cus_1', limit: 100, starting_after: 'sub_sched_other' })
  })
})
