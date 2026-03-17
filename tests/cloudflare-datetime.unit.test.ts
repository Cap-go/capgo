import { describe, expect, it } from 'vitest'
import { formatDateCF } from '../supabase/functions/_backend/utils/cloudflare.ts'

describe('formatDateCF', () => {
  it('normalizes Date objects to a stable UTC SQL timestamp', () => {
    expect(formatDateCF(new Date('2026-03-17T09:08:07.654Z'))).toBe('2026-03-17 09:08:07')
  })

  it('normalizes ISO strings with offsets to UTC SQL timestamps', () => {
    expect(formatDateCF('2026-03-17T10:08:07+01:00')).toBe('2026-03-17 09:08:07')
  })
})
