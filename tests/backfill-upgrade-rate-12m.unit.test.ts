import { describe, expect, it } from 'vitest'
import { buildUpgradeRate12mBackfillRows, calculateUpgradeRate12m } from '../scripts/backfill_upgrade_rate_12m.ts'

describe('upgrade_rate_12m backfill helpers', () => {
  it.concurrent('returns zero when there are no orgs', () => {
    expect(calculateUpgradeRate12m(3, 0)).toBe(0)
  })

  it.concurrent('rounds to one decimal place', () => {
    expect(calculateUpgradeRate12m(1, 3)).toBe(33.3)
  })

  it.concurrent('counts distinct upgraded orgs in the trailing 12 months', () => {
    const rows = buildUpgradeRate12mBackfillRows(
      [
        { date_id: '2026-07-20', upgrade_rate_12m: 0 },
        { date_id: '2025-07-20', upgrade_rate_12m: 0 },
      ],
      [
        { id: 'org-1', created_at: '2024-01-01T00:00:00.000Z', customer_id: 'cus_1' },
        { id: 'org-2', created_at: '2024-06-01T00:00:00.000Z', customer_id: 'cus_2' },
        { id: 'org-3', created_at: '2026-07-21T00:00:00.000Z', customer_id: 'cus_3' },
      ],
      [
        { customer_id: 'cus_1', upgraded_at: '2026-01-15T12:00:00.000Z' },
        { customer_id: 'cus_2', upgraded_at: '2024-08-01T00:00:00.000Z' },
      ],
    )

    expect(rows).toEqual([
      {
        date_id: '2025-07-20',
        orgs: 2,
        upgraded_orgs_12m: 1,
        current_rate: 0,
        next_rate: 50,
        changed: true,
      },
      {
        date_id: '2026-07-20',
        orgs: 2,
        upgraded_orgs_12m: 1,
        current_rate: 0,
        next_rate: 50,
        changed: true,
      },
    ])
  })
})
