import { describe, expect, it } from 'vitest'
import { updateDeliveryStatsTestUtils } from '../supabase/functions/_backend/private/update_delivery_stats.ts'

describe('update delivery stats helpers', () => {
  it.concurrent('normalizes supported period presets', () => {
    expect(updateDeliveryStatsTestUtils.normalizePeriodDays(undefined)).toBe(7)
    expect(updateDeliveryStatsTestUtils.normalizePeriodDays(1)).toBe(1)
    expect(updateDeliveryStatsTestUtils.normalizePeriodDays(3)).toBe(3)
    expect(updateDeliveryStatsTestUtils.normalizePeriodDays(7)).toBe(7)
    expect(updateDeliveryStatsTestUtils.normalizePeriodDays(30)).toBe(30)
    expect(updateDeliveryStatsTestUtils.normalizePeriodDays(2)).toBeNull()
    expect(updateDeliveryStatsTestUtils.normalizePeriodDays(7.5)).toBeNull()
  })

  it.concurrent('normalizes supported scopes', () => {
    expect(updateDeliveryStatsTestUtils.normalizeScope(undefined)).toBe('app')
    expect(updateDeliveryStatsTestUtils.normalizeScope('app')).toBe('app')
    expect(updateDeliveryStatsTestUtils.normalizeScope('org')).toBe('org')
    expect(updateDeliveryStatsTestUtils.normalizeScope('platform')).toBe('platform')
    expect(updateDeliveryStatsTestUtils.normalizeScope('unknown')).toBeNull()
  })

  it.concurrent('generates inclusive UTC day labels', () => {
    expect(updateDeliveryStatsTestUtils.generateDateLabels(
      new Date('2026-07-01T18:00:00Z'),
      new Date('2026-07-03T02:00:00Z'),
    )).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
  })

  it('builds overview and daily percentile series', () => {
    const response = updateDeliveryStatsTestUtils.buildUpdateDeliveryResponse({
      labels: ['2026-07-01', '2026-07-02'],
      days: 7,
      start: '2026-07-01T00:00:00.000Z',
      end: '2026-07-02T23:59:59.999Z',
      scope: 'app',
      dailyRows: [
        { day: '2026-07-01', samples: 12, p50_ms: 820.4, p75_ms: 1100, p95_ms: 2400.2, p99_ms: 4100 },
        { day: '2026-07-02', samples: 8, p50_ms: 900, p75_ms: 1300, p95_ms: 2800, p99_ms: 5000 },
      ],
      overviewRow: {
        samples: 20,
        devices: 9,
        p50_ms: 860.2,
        p75_ms: 1200,
        p95_ms: 2600.8,
        p99_ms: 4500,
      },
    })

    expect(response.scope).toBe('app')
    expect(response.overview).toMatchObject({
      samples: 20,
      devices: 9,
      p50_ms: 860,
      p75_ms: 1200,
      p95_ms: 2601,
      p99_ms: 4500,
    })
    expect(response.daily.samples).toEqual([12, 8])
    expect(response.daily.p50_ms).toEqual([820, 900])
    expect(response.daily.p95_ms).toEqual([2400, 2800])
    expect(response.daily.p99_ms).toEqual([4100, 5000])
  })
})
