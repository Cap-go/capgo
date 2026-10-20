import { describe, expect, it } from 'vitest'
import { computeNewOrgTrialEnd, DEFAULT_TRIAL_DAYS, isDirectOfferMetadata } from '../supabase/functions/_backend/utils/direct_offer.ts'

describe('direct offer trial', () => {
  it.concurrent('only the literal direct value is a direct offer', () => {
    expect(isDirectOfferMetadata({ offer: 'direct' })).toBe(true)
    expect(isDirectOfferMetadata({ offer: 'Direct' })).toBe(false)
    expect(isDirectOfferMetadata({ offer: 'direct ' })).toBe(false)
    expect(isDirectOfferMetadata({ offer: true })).toBe(false)
    expect(isDirectOfferMetadata({})).toBe(false)
    expect(isDirectOfferMetadata(null)).toBe(false)
    expect(isDirectOfferMetadata(undefined)).toBe(false)
  })

  it.concurrent('direct offer orgs get a zero-length trial', () => {
    const now = new Date('2026-10-20T12:00:00.000Z')
    expect(computeNewOrgTrialEnd(true, now).toISOString()).toBe(now.toISOString())
  })

  it.concurrent('other orgs keep the standard trial', () => {
    const now = new Date('2026-10-20T12:00:00.000Z')
    expect(DEFAULT_TRIAL_DAYS).toBe(15)
    const expected = new Date(now)
    expected.setDate(expected.getDate() + 15)
    expect(computeNewOrgTrialEnd(false, now).toISOString()).toBe(expected.toISOString())
    expect(now.toISOString()).toBe('2026-10-20T12:00:00.000Z')
  })
})
