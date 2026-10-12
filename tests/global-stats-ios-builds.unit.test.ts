import { describe, expect, it } from 'vitest'
import { globalStatsTestUtils } from '../supabase/functions/_backend/triggers/global_stats.ts'

const { summarizeIosBuildRequestRows } = globalStatsTestUtils

describe('summarizeIosBuildRequestRows', () => {
  it.concurrent('counts iOS builds by dependency manager and iOS SDK major', () => {
    expect(summarizeIosBuildRequestRows([
      { ios_dependency_manager: 'cocoapods', xcode_major: '26', total_builds: 10 },
      { ios_dependency_manager: 'spm', xcode_major: '26', total_builds: '4' },
      { ios_dependency_manager: 'spm', xcode_major: '27', total_builds: 2 },
      { ios_dependency_manager: null, xcode_major: null, total_builds: 3 },
      { ios_dependency_manager: 'cocoapods', xcode_major: 'beta', total_builds: 1 },
    ])).toEqual({
      dependencyManager: { cocoapods: 11, spm: 6, unknown: 3 },
      sdk: { 26: 14, 27: 2, unknown: 4 },
    })
  })

  it.concurrent('returns empty counts without builds', () => {
    expect(summarizeIosBuildRequestRows([])).toEqual({
      dependencyManager: { cocoapods: 0, spm: 0, unknown: 0 },
      sdk: {},
    })
  })
})
