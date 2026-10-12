import { describe, expect, it } from 'vitest'
import { COCOAPODS_DEPRECATION_EVENT, COCOAPODS_END_OF_SUPPORT } from '../supabase/functions/_backend/utils/cocoapods_deprecation.ts'

describe('cocoaPods end of support email', () => {
  it.concurrent('announces the CocoaPods end of support for December 2026', () => {
    expect(COCOAPODS_DEPRECATION_EVENT).toBe('org:ios_cocoapods_deprecation')
    expect(COCOAPODS_END_OF_SUPPORT).toBe('2026-12-01')
  })
})
