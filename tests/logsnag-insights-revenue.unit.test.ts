import { describe, expect, it } from 'vitest'
import { logsnagInsightsTestUtils } from '../supabase/functions/_backend/triggers/logsnag_insights.ts'

describe('logsnag revenue metric helpers', () => {
  it.concurrent('keeps revenue-active snapshots limited to succeeded subscriptions', () => {
    expect(logsnagInsightsTestUtils.REVENUE_ACTIVE_STRIPE_STATUSES).toEqual(['succeeded'])
  })

  it.concurrent('counts paid customers from paid_at rows and legacy fallback rows', () => {
    expect(logsnagInsightsTestUtils.countUniqueCustomers(
      [
        { customer_id: 'cus_paid_1' },
        { customer_id: 'cus_paid_2' },
      ],
      [
        { customer_id: 'cus_legacy_1' },
      ],
    )).toBe(3)
  })

  it.concurrent('deduplicates customer ids across the paid_at query and legacy fallback query', () => {
    expect(logsnagInsightsTestUtils.countUniqueCustomers(
      [
        { customer_id: 'cus_shared' },
      ],
      [
        { customer_id: 'cus_shared' },
      ],
    )).toBe(1)
  })

  it.concurrent('builds UTC calendar-day bounds', () => {
    const { dayStart, nextDayStart, dayDateId } = logsnagInsightsTestUtils.getCurrentDayWindow(new Date('2026-03-24T18:45:12.000Z'))

    expect(dayStart.toISOString()).toBe('2026-03-24T00:00:00.000Z')
    expect(nextDayStart.toISOString()).toBe('2026-03-25T00:00:00.000Z')
    expect(dayDateId).toBe('2026-03-24')
  })

  it.concurrent('builds the previous completed UTC day window for scheduled snapshots', () => {
    const { dayStart, nextDayStart, dayDateId } = logsnagInsightsTestUtils.getCompletedDayWindow(new Date('2026-03-25T01:01:00.000Z'))

    expect(dayStart.toISOString()).toBe('2026-03-24T00:00:00.000Z')
    expect(nextDayStart.toISOString()).toBe('2026-03-25T00:00:00.000Z')
    expect(dayDateId).toBe('2026-03-24')
  })

  it.concurrent('computes NRR from prior MRR, churn, contraction, and expansion', () => {
    expect(logsnagInsightsTestUtils.calculateNrr(100, {
      churnMrr: 15,
      contractionMrr: 5,
      expansionMrr: 10,
    })).toBe(90)
  })

  it.concurrent('defaults NRR to 100 when there is no starting MRR baseline', () => {
    expect(logsnagInsightsTestUtils.calculateNrr(0, {
      churnMrr: 12,
      contractionMrr: 4,
      expansionMrr: 0,
    })).toBe(100)
  })

  it.concurrent('sums full churn and downgrade revenue into the churn revenue metric', () => {
    expect(logsnagInsightsTestUtils.calculateChurnRevenue({
      churnMrr: 18.25,
      contractionMrr: 7.75,
      expansionMrr: 0,
    })).toBe(26)
  })

  it.concurrent('calculates current past-due org count and average days', () => {
    expect(logsnagInsightsTestUtils.calculatePastDueOrgStats([
      {
        customer_id: 'cus_due_1',
        past_due_at: '2026-03-20T00:00:00.000Z',
        updated_at: '2026-03-21T00:00:00.000Z',
      },
      {
        customer_id: 'cus_due_2',
        past_due_at: '2026-03-22T12:00:00.000Z',
        updated_at: '2026-03-22T12:00:00.000Z',
      },
      {
        customer_id: 'cus_due_2',
        past_due_at: '2026-03-22T12:00:00.000Z',
        updated_at: '2026-03-22T12:00:00.000Z',
      },
    ], new Date('2026-03-25T00:00:00.000Z'))).toEqual({
      past_due_orgs: 2,
      past_due_orgs_average_days: 3.8,
    })
  })

  it.concurrent('ignores future past-due rows and uses the earliest start per customer', () => {
    expect(logsnagInsightsTestUtils.calculatePastDueOrgStats([
      {
        customer_id: 'cus_due_1',
        past_due_at: '2026-03-24T00:00:00.000Z',
        updated_at: '2026-03-24T00:00:00.000Z',
      },
      {
        customer_id: 'cus_due_1',
        past_due_at: '2026-03-22T00:00:00.000Z',
        updated_at: '2026-03-22T00:00:00.000Z',
      },
      {
        customer_id: 'cus_due_future',
        past_due_at: '2026-03-25T12:00:00.000Z',
        updated_at: '2026-03-25T12:00:00.000Z',
      },
    ], new Date('2026-03-25T00:00:00.000Z'))).toEqual({
      past_due_orgs: 1,
      past_due_orgs_average_days: 3,
    })
  })

  it.concurrent('falls back to updated_at for past-due duration during rollout', () => {
    expect(logsnagInsightsTestUtils.calculatePastDueOrgStats([
      {
        customer_id: 'cus_due_rollout',
        past_due_at: null,
        updated_at: '2026-03-24T00:00:00.000Z',
      },
    ], new Date('2026-03-25T00:00:00.000Z'))).toEqual({
      past_due_orgs: 1,
      past_due_orgs_average_days: 1,
    })
  })
})
