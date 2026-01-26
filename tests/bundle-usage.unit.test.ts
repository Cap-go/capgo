import { describe, expect, it } from 'vitest'
import { bundleUsageTestUtils } from '../supabase/functions/_backend/public/statistics/index.ts'

describe('bundle usage helpers', () => {
  it('generateDateLabels builds an inclusive range', () => {
    // Use dates in the past that won't be affected by "today" capping
    const labels = bundleUsageTestUtils.generateDateLabels(
      new Date('2024-10-24T12:00:00Z'),
      new Date('2024-11-02T23:59:59Z'),
    )

    expect(labels).toEqual([
      '2024-10-24',
      '2024-10-25',
      '2024-10-26',
      '2024-10-27',
      '2024-10-28',
      '2024-10-29',
      '2024-10-30',
      '2024-10-31',
      '2024-11-01',
      '2024-11-02',
    ])
  })

  it('fillMissingDailyData carries forward the previous day when a full day has no data', () => {
    const sourceDatasets = [
      { label: 'v1', data: [10, 0, 0] },
      { label: 'v2', data: [20, 0, 0] },
    ]
    // Use dates in the past to avoid "today" special handling
    const labels = ['2024-10-24', '2024-10-25', '2024-10-26']

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

  it('fillMissingDailyData preserves zeros for recent dates that may still be accumulating', () => {
    // Use today's date to test the "skip filling for today" behavior
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const sourceDatasets = [
      { label: 'v1', data: [10, 0] },
      { label: 'v2', data: [20, 0] },
    ]
    const labels = [yesterday, today]

    const result = bundleUsageTestUtils.fillMissingDailyData(sourceDatasets, labels)

    // Today's zero should be preserved (not filled forward)
    expect(result[0].data[1]).toBe(0)
    expect(result[1].data[1]).toBe(0)
  })
})
