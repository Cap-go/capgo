import { describe, expect, it, vi } from 'vitest'
import { statisticsTestUtils } from '../supabase/functions/_backend/public/statistics/index.ts'

const fakeContext = {
  get: vi.fn(() => undefined),
} as any

describe('statistics retry helpers', () => {
  it('retries transient statistics query failures and returns the recovered result', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'error code: 502' }, status: 502 })
      .mockResolvedValueOnce({ data: [{ app_id: 'com.demo.app' }], error: null, status: 200 })

    const result = await statisticsTestUtils.executeStatsQueryWithRetry(fakeContext, 'test_metrics', query)

    expect(result).toEqual({ data: [{ app_id: 'com.demo.app' }], error: null, status: 200 })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('does not retry non-retryable statistics query failures', async () => {
    const query = vi.fn().mockResolvedValue({ data: null, error: { message: 'bad request' }, status: 400 })

    const result = await statisticsTestUtils.executeStatsQueryWithRetry(fakeContext, 'test_metrics', query)

    expect(result).toEqual({ data: null, error: { message: 'bad request' }, status: 400 })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('marks missing apps as not found when the lookup returns no rows', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    } as any

    const result = await statisticsTestUtils.resolveAppOwnerOrg(fakeContext, 'com.demo.missing', supabase)

    expect(result).toEqual({ ownerOrg: null, error: null, notFound: true })
  })

  it('detects missing-app errors in aggregated statistics results', () => {
    const result = statisticsTestUtils.getMissingAppStatsError([
      { error: 'cannot_get_user_statistics', status: 500 },
      { error: 'app_not_found', status: 404 },
    ])

    expect(result).toEqual({ error: 'app_not_found', status: 404 })
  })

  it('ignores unrelated 404 errors when looking for missing apps', () => {
    const result = statisticsTestUtils.getMissingAppStatsError([
      { error: 'rpc_not_found', status: 404 },
    ])

    expect(result).toBeUndefined()
  })
})
