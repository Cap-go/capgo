import { describe, expect, it, vi } from 'vitest'

vi.mock('~/services/supabase', () => ({
  useSupabase: vi.fn(),
}))

describe('dashboard refresh helpers', () => {
  it.concurrent('detects stale and in-progress refresh states from timestamp strings without timezone suffixes', async () => {
    const {
      isChartDataStale,
      isChartRefreshInProgress,
      parseDashboardRefreshTimestamp,
      shouldAutoRequestChartRefresh,
    } = await import('../src/services/dashboardRefresh.ts')

    const now = Date.parse('2026-04-22T12:10:00.000Z')

    expect(parseDashboardRefreshTimestamp('2026-04-22T12:00:00')).toBe(Date.parse('2026-04-22T12:00:00.000Z'))
    expect(isChartDataStale('2026-04-22T12:04:59', now)).toBe(true)
    expect(isChartDataStale('2026-04-22T12:05:01', now)).toBe(false)
    expect(isChartRefreshInProgress('2026-04-22T12:09:00', '2026-04-22T12:08:00', now)).toBe(true)
    expect(isChartRefreshInProgress('2026-04-22T12:08:00', '2026-04-22T12:09:00', now)).toBe(false)
    expect(isChartRefreshInProgress('2026-04-22T12:00:00', null, Date.parse('2026-04-22T12:05:11.000Z'))).toBe(false)
    expect(shouldAutoRequestChartRefresh('2026-04-22T12:04:59', null, now)).toBe(true)
    expect(shouldAutoRequestChartRefresh('2026-04-22T12:04:59', '2026-04-22T12:09:00', now)).toBe(false)
    expect(shouldAutoRequestChartRefresh('2026-04-22T11:59:59', '2026-04-22T12:00:00', Date.parse('2026-04-22T12:05:11.000Z'))).toBe(true)
  })

  it.concurrent('waits for the org cache timestamp to reach the refresh request timestamp', async () => {
    const { isOrgCacheReadyForRefresh } = await import('../src/services/dashboardRefresh.ts')

    expect(isOrgCacheReadyForRefresh('2026-04-22T12:10:00', '2026-04-22T12:09:30')).toBe(true)
    expect(isOrgCacheReadyForRefresh('2026-04-22T12:09:00', '2026-04-22T12:09:30')).toBe(false)
    expect(isOrgCacheReadyForRefresh(null, '2026-04-22T12:09:30')).toBe(false)
    expect(isOrgCacheReadyForRefresh('2026-04-22T12:09:00', null)).toBe(true)
  })
})
