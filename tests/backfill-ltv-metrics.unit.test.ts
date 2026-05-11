import type { LtvSourceRow } from '../scripts/backfill_ltv_metrics.ts'
import { describe, expect, it } from 'vitest'
import { buildLtvBackfillRows, calculateLtvMetrics, estimateCustomerLtv } from '../scripts/backfill_ltv_metrics.ts'

function ltvRow(overrides: Partial<LtvSourceRow>): LtvSourceRow {
  return {
    canceled_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    customer_id: 'cus_default',
    is_good_plan: true,
    paid_at: '2026-01-01T00:00:00.000Z',
    price_id: 'price_solo_monthly',
    status: 'succeeded',
    subscription_anchor_end: '2026-02-01T00:00:00.000Z',
    subscription_anchor_start: '2026-01-01T00:00:00.000Z',
    plans: {
      name: 'Solo',
      price_m: 12,
      price_m_id: 'price_solo_monthly',
      price_y: 120,
      price_y_id: 'price_solo_yearly',
    },
    ...overrides,
  }
}

describe('estimated LTV metric backfill helpers', () => {
  it.concurrent('estimates monthly LTV by started billing periods', () => {
    const value = estimateCustomerLtv(ltvRow({}), new Date('2026-02-15T00:00:00.000Z'))

    expect(value).toBe(24)
  })

  it.concurrent('counts a yearly subscription as one full yearly payment at start', () => {
    const value = estimateCustomerLtv(ltvRow({
      price_id: 'price_solo_yearly',
      paid_at: '2026-01-10T00:00:00.000Z',
    }), new Date('2026-01-11T00:00:00.000Z'))

    expect(value).toBe(120)
  })

  it.concurrent('stops LTV at the stored canceled_at date', () => {
    const value = estimateCustomerLtv(ltvRow({
      paid_at: '2026-01-01T00:00:00.000Z',
      status: 'canceled',
      canceled_at: '2026-01-20T00:00:00.000Z',
    }), new Date('2026-04-01T00:00:00.000Z'))

    expect(value).toBe(12)
  })

  it.concurrent('ignores good-plan rows without a paid timestamp', () => {
    const value = estimateCustomerLtv(ltvRow({
      paid_at: null,
    }), new Date('2026-02-15T00:00:00.000Z'))

    expect(value).toBeNull()
  })

  it.concurrent('builds average, shortest, and longest LTV metrics', () => {
    const metrics = calculateLtvMetrics([
      ltvRow({
        customer_id: 'cus_monthly',
        paid_at: '2026-01-01T00:00:00.000Z',
      }),
      ltvRow({
        customer_id: 'cus_yearly',
        paid_at: '2026-01-10T00:00:00.000Z',
        price_id: 'price_solo_yearly',
      }),
    ], '2026-02-15')

    expect(metrics).toEqual({
      average_ltv: 72,
      shortest_ltv: 24,
      longest_ltv: 120,
    })
  })

  it.concurrent('marks rows changed when stored metrics differ', () => {
    const rows = buildLtvBackfillRows([
      {
        average_ltv: 0,
        date_id: '2026-02-15',
        longest_ltv: 0,
        shortest_ltv: 0,
      },
    ], [
      ltvRow({}),
    ])

    expect(rows[0]).toMatchObject({
      changed: true,
      average_ltv: 24,
      shortest_ltv: 24,
      longest_ltv: 24,
    })
  })
})
