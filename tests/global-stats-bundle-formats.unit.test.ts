import { describe, expect, it } from 'vitest'
import { globalStatsTestUtils } from '../supabase/functions/_backend/triggers/global_stats.ts'

const { summarizeBundleFormatRow } = globalStatsTestUtils

describe('summarizeBundleFormatRow', () => {
  it.concurrent('maps the daily bundle format aggregate to snapshot counts', () => {
    expect(summarizeBundleFormatRow({ zip_only: 12, delta_only: '3', both: 7 })).toEqual({
      zipOnly: 12,
      deltaOnly: 3,
      both: 7,
    })
  })

  it.concurrent('returns zero counts without bundles', () => {
    expect(summarizeBundleFormatRow(undefined)).toEqual({ zipOnly: 0, deltaOnly: 0, both: 0 })
    expect(summarizeBundleFormatRow({ zip_only: null, delta_only: null, both: null })).toEqual({ zipOnly: 0, deltaOnly: 0, both: 0 })
  })
})
