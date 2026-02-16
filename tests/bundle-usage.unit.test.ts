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

  it('buildDailyReportedCountsByName aggregates daily get counts by version', () => {
    const usage = [
      { date: '2024-10-24', app_id: 'app', version_name: '1.0.0', get: 3, install: 0, uninstall: 0 },
      { date: '2024-10-24', app_id: 'app', version_name: '1.1.0', get: 2, install: 0, uninstall: 0 },
      { date: '2024-10-25', app_id: 'app', version_name: '1.0.0', get: 1, install: 0, uninstall: 0 },
      { date: '2024-10-25', app_id: 'app', version_name: '1.1.0', get: 4, install: 0, uninstall: 0 },
    ]
    const dates = ['2024-10-24', '2024-10-25']
    const versions = ['1.0.0', '1.1.0']

    const counts = bundleUsageTestUtils.buildDailyReportedCountsByName(usage as any, dates, versions)
    expect(counts).toEqual({
      '2024-10-24': { '1.0.0': 3, '1.1.0': 2 },
      '2024-10-25': { '1.0.0': 1, '1.1.0': 4 },
    })
  })

  it('convertCountsToPercentagesByName converts daily counts into 0-100 share', () => {
    const counts = {
      '2024-10-24': { '1.0.0': 3, '1.1.0': 2 },
      '2024-10-25': { '1.0.0': 1, '1.1.0': 4 },
    }
    const dates = ['2024-10-24', '2024-10-25']
    const versions = ['1.0.0', '1.1.0']

    const percentages = bundleUsageTestUtils.convertCountsToPercentagesByName(counts as any, dates, versions)
    expect(percentages['2024-10-24']['1.0.0']).toBe(60)
    expect(percentages['2024-10-24']['1.1.0']).toBe(40)
    expect(percentages['2024-10-25']['1.0.0']).toBe(20)
    expect(percentages['2024-10-25']['1.1.0']).toBe(80)
  })

  it('getLatestDayVersionShare returns top version share from latest day with data', () => {
    const versions = ['1.0.0', '1.1.0']
    const dates = ['2024-10-24', '2024-10-25']
    const counts = {
      '2024-10-24': { '1.0.0': 3, '1.1.0': 2 },
      '2024-10-25': { '1.0.0': 0, '1.1.0': 5 },
    }

    const latest = bundleUsageTestUtils.getLatestDayVersionShare(versions, dates, counts as any)
    expect(latest.name).toBe('1.1.0')
    expect(latest.percentage).toBe(100)
  })
})
