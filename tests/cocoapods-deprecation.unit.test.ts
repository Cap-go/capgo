import { describe, expect, it } from 'vitest'
import { COCOAPODS_DEPRECATION_EVENT, COCOAPODS_TRUNK_READ_ONLY, IOS_27_SDK_DEFAULT } from '../supabase/functions/_backend/utils/cocoapods_deprecation.ts'

describe('cocoaPods trunk read-only email', () => {
  it.concurrent('announces the CocoaPods trunk freeze of December 2026', () => {
    expect(COCOAPODS_DEPRECATION_EVENT).toBe('org:ios_cocoapods_deprecation')
    expect(COCOAPODS_TRUNK_READ_ONLY).toBe('2026-12-02')
    expect(IOS_27_SDK_DEFAULT).toBe('2027-01-01')
  })
})
