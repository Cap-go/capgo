import { describe, expect, it } from 'vitest'
import { logsnagInsightsTestUtils } from '../supabase/functions/_backend/triggers/logsnag_insights.ts'

describe('logsnag revenue metric helpers', () => {
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
})
