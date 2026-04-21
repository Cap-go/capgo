import { describe, expect, it } from 'vitest'
import { normalizeDashboardDateRange } from '~/services/supabase'

function createFallbackWindow(now: Date) {
  const end = new Date(now)
  end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() + 1)

  const start = new Date(end)
  start.setDate(start.getDate() - 30)

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

describe('dashboard date range normalization', () => {
  it.concurrent('keeps valid explicit dates unchanged', () => {
    const normalized = normalizeDashboardDateRange(
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
      new Date('2026-04-21T12:00:00.000Z'),
    )

    expect(normalized).toEqual({
      start: '2026-04-01T00:00:00.000Z',
      end: '2026-05-01T00:00:00.000Z',
    })
  })

  it.concurrent('falls back to the last 30-day window when dates are omitted', () => {
    const now = new Date('2026-04-21T15:45:00.000Z')

    expect(normalizeDashboardDateRange(undefined, undefined, now)).toEqual(createFallbackWindow(now))
  })

  it.concurrent('falls back to the default window when either bound is invalid', () => {
    const now = new Date('2026-04-21T15:45:00.000Z')
    expect(normalizeDashboardDateRange('not-a-date', '2026-04-30T00:00:00.000Z', now)).toEqual(createFallbackWindow(now))
    expect(normalizeDashboardDateRange('2026-04-01T00:00:00.000Z', 'still-not-a-date', now)).toEqual(createFallbackWindow(now))
  })

  it.concurrent('falls back to the default window when the resolved range is inverted', () => {
    const now = new Date('2026-04-21T15:45:00.000Z')

    expect(normalizeDashboardDateRange('2026-05-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', now)).toEqual(createFallbackWindow(now))
  })
})
