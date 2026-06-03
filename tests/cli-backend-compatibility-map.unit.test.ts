import { describe, expect, it } from 'vitest'
import { getCompatibilityDetails, mapBackendCompatibilityResponse } from '../cli/src/utils.ts'

describe('CLI backend compatibility response mapping', () => {
  it.concurrent('maps backend package comparisons to CLI compatibility entries', () => {
    const [entry] = mapBackendCompatibilityResponse({
      comparisons: [
        {
          name: '@capacitor/camera',
          candidateVersion: '6.0.0',
          baselineVersion: '5.0.0',
          candidateIosChecksum: 'ios-new',
          baselineIosChecksum: 'ios-old',
          candidateAndroidChecksum: 'android-new',
          baselineAndroidChecksum: 'android-old',
        },
      ],
    })

    expect(entry).toEqual({
      name: '@capacitor/camera',
      localVersion: '6.0.0',
      remoteVersion: '5.0.0',
      localIosChecksum: 'ios-new',
      remoteIosChecksum: 'ios-old',
      localAndroidChecksum: 'android-new',
      remoteAndroidChecksum: 'android-old',
    })
    expect(getCompatibilityDetails(entry).compatible).toBe(false)
  })

  it.concurrent('keeps removed remote packages OTA-compatible in the CLI shape', () => {
    const [entry] = mapBackendCompatibilityResponse({
      comparisons: [
        {
          name: '@capacitor/camera',
          baselineVersion: '5.0.0',
        },
      ],
    })

    expect(entry).toEqual({
      name: '@capacitor/camera',
      localVersion: undefined,
      remoteVersion: '5.0.0',
      localIosChecksum: undefined,
      remoteIosChecksum: undefined,
      localAndroidChecksum: undefined,
      remoteAndroidChecksum: undefined,
    })
    expect(getCompatibilityDetails(entry).compatible).toBe(true)
  })
})
