import { describe, expect, it } from 'vitest'
import { buildUpgradeRate12mBackfillRows, calculateUpgradeRate12m } from '../scripts/backfill_upgrade_rate_12m.ts'

describe('calculateUpgradeRate12m', () => {
  it('returns 0 when there are no orgs', () => {
    expect(calculateUpgradeRate12m(5, 0)).toBe(0)
  })

  it('rounds to one decimal place', () => {
    expect(calculateUpgradeRate12m(1, 3)).toBe(33.3)
  })
})

describe('buildUpgradeRate12mBackfillRows', () => {
  it('sums Stripe-sourced upgraded_orgs over the trailing 12 calendar months', () => {
    const rows = [
      { date_id: '2025-07-21', upgrade_rate_12m: 0, upgraded_orgs: 0 },
      { date_id: '2025-07-22', upgrade_rate_12m: 0, upgraded_orgs: 2 },
      { date_id: '2026-07-21', upgrade_rate_12m: 0, upgraded_orgs: 1 },
      { date_id: '2026-07-22', upgrade_rate_12m: 0, upgraded_orgs: 4 },
    ]
    const orgRows = [
      { id: 'a', created_at: '2024-01-01T00:00:00.000Z' },
      { id: 'b', created_at: '2024-01-01T00:00:00.000Z' },
      { id: 'c', created_at: '2024-01-01T00:00:00.000Z' },
      { id: 'd', created_at: '2024-01-01T00:00:00.000Z' },
      { id: 'e', created_at: '2024-01-01T00:00:00.000Z' },
      { id: 'f', created_at: '2024-01-01T00:00:00.000Z' },
      { id: 'g', created_at: '2024-01-01T00:00:00.000Z' },
      { id: 'h', created_at: '2024-01-01T00:00:00.000Z' },
      { id: 'i', created_at: '2024-01-01T00:00:00.000Z' },
      { id: 'j', created_at: '2024-01-01T00:00:00.000Z' },
    ]

    const result = buildUpgradeRate12mBackfillRows(rows, orgRows, rows)
    const byDate = Object.fromEntries(result.map(row => [row.date_id, row]))

    // Window for 2026-07-21 is [2025-07-22, 2026-07-21] => 2 + 1 = 3
    expect(byDate['2026-07-21']?.upgraded_orgs_12m).toBe(3)
    expect(byDate['2026-07-21']?.next_rate).toBe(30)

    // Window for 2026-07-22 is [2025-07-23, 2026-07-22] => excludes 2025-07-22's 2, includes 1+4 = 5
    expect(byDate['2026-07-22']?.upgraded_orgs_12m).toBe(5)
    expect(byDate['2026-07-22']?.next_rate).toBe(50)
  })

  it('clamps leap-day trailing windows', () => {
    const rows = [
      { date_id: '2023-02-28', upgrade_rate_12m: 0, upgraded_orgs: 1 },
      { date_id: '2023-03-01', upgrade_rate_12m: 0, upgraded_orgs: 1 },
      { date_id: '2024-02-28', upgrade_rate_12m: 0, upgraded_orgs: 0 },
      { date_id: '2024-02-29', upgrade_rate_12m: 0, upgraded_orgs: 0 },
    ]
    const orgRows = [
      { id: 'a', created_at: '2020-01-01T00:00:00.000Z' },
      { id: 'b', created_at: '2020-01-01T00:00:00.000Z' },
    ]
    const result = buildUpgradeRate12mBackfillRows(
      [{ date_id: '2024-02-28', upgrade_rate_12m: 0, upgraded_orgs: 0 }],
      orgRows,
      rows,
    )
    // endExclusive 2024-02-29 => start 2023-02-28; includes both March-window upgrades
    expect(result[0]?.upgraded_orgs_12m).toBe(2)
  })
})
