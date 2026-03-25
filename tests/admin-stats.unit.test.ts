import { describe, expect, it } from 'vitest'
import { MAX_ADMIN_STATS_LIMIT, MAX_ADMIN_STATS_OFFSET, adminStatsBodySchema } from '../supabase/functions/_backend/private/admin_stats.ts'
import { normalizeAnalyticsLimit } from '../supabase/functions/_backend/utils/cloudflare.ts'

describe('admin stats validation', () => {
  const baseBody = {
    metric_category: 'org_metrics',
    start_date: '2025-01-01',
    end_date: '2025-01-31',
  }

  it.each([
    ['sql injection string limit', { limit: '1 UNION SELECT 1' }],
    ['decimal limit', { limit: 1.5 }],
    ['negative offset', { offset: -1 }],
    ['oversized limit', { limit: MAX_ADMIN_STATS_LIMIT + 1 }],
    ['oversized offset', { offset: MAX_ADMIN_STATS_OFFSET + 1 }],
  ])('rejects %s', (_label, body) => {
    const parsed = adminStatsBodySchema.safeParse({
      ...baseBody,
      ...body,
    })

    expect(parsed.success).toBe(false)
  })

  it('accepts bounded integer pagination', () => {
    const parsed = adminStatsBodySchema.safeParse({
      ...baseBody,
      limit: 250,
      offset: 10,
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success)
      return

    expect(parsed.data.limit).toBe(250)
    expect(parsed.data.offset).toBe(10)
  })
})

describe('normalizeAnalyticsLimit', () => {
  it.each([
    ['string injection', '1 UNION SELECT 1', 100],
    ['negative number', -10, 100],
    ['zero', 0, 100],
    ['decimal', 12.8, 12],
    ['oversized', 99_999_999, 50_000],
  ])('normalizes %s', (_label, input, expected) => {
    expect(normalizeAnalyticsLimit(input, 100)).toBe(expected)
  })
})
