import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { bundleUsageTestUtils } from '../supabase/functions/_backend/public/statistics/index.ts'

describe('bundle usage helpers', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-10-30T00:00:00Z'))
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  it('generateDateLabels builds an inclusive range capped at today', () => {
    const labels = bundleUsageTestUtils.generateDateLabels(
      new Date('2025-10-24T12:00:00Z'),
      new Date('2025-11-02T23:59:59Z'),
    )

    expect(labels).toEqual([
      '2025-10-24',
      '2025-10-25',
      '2025-10-26',
      '2025-10-27',
      '2025-10-28',
      '2025-10-29',
      '2025-10-30',
      '2025-10-31',
      '2025-11-01',
      '2025-11-02',
    ])
  })

  it('fillMissingDailyData carries forward the previous day when a full day has no data', () => {
    const sourceDatasets = [
      { label: 'v1', data: [10, 0, 0] },
      { label: 'v2', data: [20, 0, 0] },
    ]
    const labels = ['2025-10-24', '2025-10-25', '2025-10-26']

    const result = bundleUsageTestUtils.fillMissingDailyData(sourceDatasets, labels)

    expect(result).toEqual([
      { label: 'v1', data: [10, 10, 10] },
      { label: 'v2', data: [20, 20, 20] },
    ])

    // ensure original references are untouched
    expect(sourceDatasets).toEqual([
      { label: 'v1', data: [10, 0, 0] },
      { label: 'v2', data: [20, 0, 0] },
    ])
  })

  it('fillMissingDailyData skips filling for today', () => {
    vi.setSystemTime(new Date('2025-10-26T00:00:00Z'))

    const sourceDatasets = [
      { label: 'v1', data: [10, 0] },
      { label: 'v2', data: [20, 0] },
    ]
    const labels = ['2025-10-25', '2025-10-26']

    const result = bundleUsageTestUtils.fillMissingDailyData(sourceDatasets, labels)

    expect(result).toEqual([
      { label: 'v1', data: [10, 0] },
      { label: 'v2', data: [20, 0] },
    ])

    // restore fake clock for subsequent tests in this suite
    vi.setSystemTime(new Date('2025-10-30T00:00:00Z'))
  })
})
