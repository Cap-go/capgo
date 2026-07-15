import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REQUIRED_GLOBAL_STATS_SHARDS } from '../supabase/functions/_backend/utils/global_stats.ts'

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const limit = vi.fn(() => ({ maybeSingle }))
  const order = vi.fn(() => ({ limit }))
  const contains = vi.fn(() => ({ order }))
  const lte = vi.fn(() => ({ contains }))
  const select = vi.fn(() => ({ lte }))
  const from = vi.fn(() => ({ select }))

  return {
    cloudlog: vi.fn(),
    cloudlogErr: vi.fn(),
    contains,
    from,
    getPublicLiveUpdateMetricsCF: vi.fn(),
    limit,
    lte,
    maybeSingle,
    order,
    select,
    serializeError: vi.fn(error => error),
    supabaseAdmin: vi.fn(() => ({ from })),
  }
})

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: mocks.cloudlog,
  cloudlogErr: mocks.cloudlogErr,
  serializeError: mocks.serializeError,
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}))

vi.mock('../supabase/functions/_backend/utils/cloudflare.ts', () => ({
  getPublicLiveUpdateMetricsCF: mocks.getPublicLiveUpdateMetricsCF,
}))

const { app, getLatestCompletedGlobalStatsDateId } = await import('../supabase/functions/_backend/private/public_stats.ts')

describe('public stats endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-11T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the latest completed UTC day for stats lookup', () => {
    expect(getLatestCompletedGlobalStatsDateId(new Date('2026-05-11T00:06:17.122Z'))).toBe('2026-05-10')
  })

  it('reads the latest completed global stats snapshot', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        apps: 42,
        stars: 9,
        updates: 100,
        updates_external: 5,
      },
      error: null,
    })

    const res = await app.request('http://localhost/')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      apps: 42,
      stars: 9,
      updates: 105,
    })
    expect(mocks.from).toHaveBeenCalledWith('global_stats')
    expect(mocks.lte).toHaveBeenCalledWith('date_id', '2026-05-10')
    expect(mocks.contains).toHaveBeenCalledWith('completed_shards', [...REQUIRED_GLOBAL_STATS_SHARDS])
    expect(mocks.order).toHaveBeenCalledWith('date_id', { ascending: false })
    expect(mocks.limit).toHaveBeenCalledWith(1)
  })

  it('serves runtime live update metrics with browser CORS', async () => {
    mocks.getPublicLiveUpdateMetricsCF.mockResolvedValueOnce({
      daily: [{ date: '2026-05-10', requests: 120, failures: 3 }],
      failures: [{ reason: 'download_fail', count: 3 }],
      platforms: { ios: 30, android: 80, electron: 10 },
      updater_versions: [{ date: '2026-05-10', version: '8.1.0', devices: 120 }],
    })

    const res = await app.request('http://localhost/live_updates', {
      headers: { Origin: 'https://capgo.app' },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://capgo.app')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300, stale-while-revalidate=600')
    expect(await res.json()).toEqual({
      period_days: 30,
      updated_at: '2026-05-11T12:00:00.000Z',
      daily: [{ date: '2026-05-10', requests: 120, failures: 3 }],
      failures: [{ reason: 'download_fail', count: 3 }],
      platforms: { ios: 30, android: 80, electron: 10 },
      updater_versions: [{ date: '2026-05-10', version: '8.1.0', devices: 120 }],
    })
    expect(mocks.getPublicLiveUpdateMetricsCF).toHaveBeenCalledOnce()
  })

  it('does not cache an unavailable live metric query as zero data', async () => {
    const error = new Error('Analytics Engine query failed')
    mocks.getPublicLiveUpdateMetricsCF.mockRejectedValueOnce(error)

    const res = await app.request('http://localhost/live_updates', {
      headers: { Origin: 'https://capgo.app' },
    })

    expect(res.status).toBe(503)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://capgo.app')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'Live update metrics are temporarily unavailable' })
    expect(mocks.getPublicLiveUpdateMetricsCF).toHaveBeenCalledOnce()
    expect(mocks.cloudlogErr).toHaveBeenCalledWith({
      error,
      message: 'Public live update metrics are unavailable',
      requestId: undefined,
    })
  })

  it('keeps the fallback counters when no completed stats row exists', async () => {
    const error = { code: 'PGRST116', message: 'The result contains 0 rows' }
    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error,
    })

    const res = await app.request('http://localhost/')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      apps: 1688,
      stars: 595,
      updates: 1862788600,
    })
    expect(mocks.cloudlog).toHaveBeenCalledWith({
      error,
      latestCompletedDateId: '2026-05-10',
      message: 'Missing completed global_stats row',
      requestId: undefined,
    })
  })
})
