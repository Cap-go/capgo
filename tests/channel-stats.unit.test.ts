import { describe, expect, it } from 'vitest'
import { channelStatsTestUtils } from '../supabase/functions/_backend/private/channel_stats.ts'

describe('channel stats helpers', () => {
  it('generateDateLabels builds an inclusive range', () => {
    const labels = channelStatsTestUtils.generateDateLabels(
      new Date('2024-12-01T10:00:00Z'),
      new Date('2024-12-03T22:00:00Z'),
    )

    expect(labels).toEqual([
      '2024-12-01',
      '2024-12-02',
      '2024-12-03',
    ])
  })

  it('fillMissingDailyCounts carries forward historical zero days', () => {
    const versions = ['1.0.0', '1.1.0']
    const labels = ['2024-12-01', '2024-12-02', '2024-12-03']
    const source = {
      '2024-12-01': { '1.0.0': 4, '1.1.0': 6 },
      '2024-12-02': { '1.0.0': 0, '1.1.0': 0 },
      '2024-12-03': { '1.0.0': 5, '1.1.0': 5 },
    }

    const result = channelStatsTestUtils.fillMissingDailyCounts(source, labels, versions, '2024-12-10')
    expect(result['2024-12-02']).toEqual({ '1.0.0': 4, '1.1.0': 6 })
  })

  it('getLatestCounts returns the last label snapshot', () => {
    const labels = ['2024-12-01', '2024-12-02', '2024-12-03']
    const countsByDate = {
      '2024-12-01': { '1.0.0': 2, '1.1.0': 1 },
      '2024-12-02': { '1.0.0': 3, '1.1.0': 2 },
      '2024-12-03': { '1.0.0': 5, '1.1.0': 4 },
    }

    const result = channelStatsTestUtils.getLatestCounts(labels, countsByDate)
    expect(result).toEqual({ '1.0.0': 5, '1.1.0': 4 })
  })

  it('getLatestCounts falls back to latest non-zero snapshot when trailing day is empty', () => {
    const labels = ['2024-12-01', '2024-12-02', '2024-12-03']
    const countsByDate = {
      '2024-12-01': { '1.0.0': 2, '1.1.0': 1 },
      '2024-12-02': { '1.0.0': 5, '1.1.0': 4 },
      '2024-12-03': { '1.0.0': 0, '1.1.0': 0 },
    }

    const result = channelStatsTestUtils.getLatestCounts(labels, countsByDate)
    expect(result).toEqual({ '1.0.0': 5, '1.1.0': 4 })
  })

  it('convertCountsToPercentagesByName keeps rounded totals at exactly 100', () => {
    const counts = {
      '2024-12-01': { '1.0.0': 1, '1.1.0': 1, '1.2.0': 1 },
    }
    const dates = ['2024-12-01']
    const versions = ['1.0.0', '1.1.0', '1.2.0']

    const percentages = channelStatsTestUtils.convertCountsToPercentagesByName(counts as any, dates, versions)
    const total = versions.reduce((sum, version) => sum + percentages['2024-12-01'][version], 0)

    expect(total).toBeCloseTo(100, 5)
  })

  it('selectRecentChannelVersions returns at most 10 latest deployed versions', () => {
    const deploymentHistory = Array.from({ length: 12 }, (_, index) => ({
      version_name: `1.${index}.0`,
      deployed_at: new Date(`2024-12-${String(index + 1).padStart(2, '0')}T00:00:00Z`).toISOString(),
    }))

    const versions = channelStatsTestUtils.selectRecentChannelVersions(deploymentHistory, '1.11.0', {}, 10)

    expect(versions).toHaveLength(10)
    expect(versions[0]).toBe('1.11.0')
    expect(versions[9]).toBe('1.2.0')
  })
})
