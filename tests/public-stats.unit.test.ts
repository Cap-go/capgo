import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    contains,
    from,
    limit,
    lte,
    maybeSingle,
    order,
    select,
    supabaseAdmin: vi.fn(() => ({ from })),
  }
})

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: mocks.cloudlog,
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
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
    expect(mocks.contains).toHaveBeenCalledWith('completed_shards', [
      'core',
      'usage',
      'revenue',
      'plugins',
      'builds',
      'retention',
      'paid_products',
      'ltv',
    ])
    expect(mocks.order).toHaveBeenCalledWith('date_id', { ascending: false })
    expect(mocks.limit).toHaveBeenCalledWith(1)
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
