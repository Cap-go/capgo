import type { Compatibility } from '../cli/src/utils.ts'
import { Buffer } from 'node:buffer'
import { parse } from '@std/semver'
import { bench, describe } from 'vitest'
import { getChecksum } from '../cli/src/checksum.ts'
import { getCompatibilityDetails, isCompatible, isDeprecatedPluginVersion, regexSemver } from '../cli/src/utils.ts'
import { autoBumpVersion, getVersionSuggestions } from '../cli/src/versionHelpers.ts'

const bundleVersions = [
  '1.0.0',
  '1.2.3-beta.1',
  '2.0.0+build.7',
  '8.45.10',
  '2026.5.7',
  'invalid-version',
]

const updaterVersions = [
  '5.9.9',
  '5.10.0',
  '6.24.9',
  '6.25.0',
  '7.24.9',
  '7.25.0',
  '8.0.0',
]

const compatibilityMatrix: Compatibility[] = [
  {
    name: '@capacitor/app',
    localVersion: '^8.1.0',
    remoteVersion: '^8.1.0',
    localIosChecksum: 'same-ios',
    remoteIosChecksum: 'same-ios',
    localAndroidChecksum: 'same-android',
    remoteAndroidChecksum: 'same-android',
  },
  {
    name: '@capacitor/camera',
    localVersion: '^8.2.0',
    remoteVersion: '^7.0.0',
    localIosChecksum: 'ios-new',
    remoteIosChecksum: 'ios-old',
    localAndroidChecksum: 'android-new',
    remoteAndroidChecksum: 'android-old',
  },
  {
    name: '@capgo/capacitor-updater',
    localVersion: '^8.45.0',
    remoteVersion: undefined,
  },
  {
    name: '@capacitor/device',
    localVersion: undefined,
    remoteVersion: '^8.0.0',
  },
]

const checksumPayload = Buffer.alloc(128 * 1024, 'capgo-benchmark-payload')

describe('cli version helpers', () => {
  bench('validate bundle semver candidates', () => {
    for (const version of bundleVersions) {
      const isExpectedInvalid = version === 'invalid-version'
      const isValid = regexSemver.test(version)
      if (!isExpectedInvalid && !isValid)
        throw new Error(`Expected valid semver fixture: ${version}`)
      if (isExpectedInvalid && isValid)
        throw new Error(`Expected invalid semver fixture: ${version}`)
    }
  })

  bench('auto bump bundle versions', () => {
    for (const version of bundleVersions)
      autoBumpVersion(version)
  })

  bench('suggest replacement bundle versions', () => {
    for (const version of bundleVersions)
      getVersionSuggestions(version)
  })

  bench('classify updater support windows', () => {
    for (const version of updaterVersions)
      isDeprecatedPluginVersion(parse(version))
  })
})

describe('cli compatibility helpers', () => {
  bench('classify native package compatibility - getCompatibilityDetails', () => {
    for (const entry of compatibilityMatrix)
      getCompatibilityDetails(entry)
  })

  bench('classify native package compatibility - isCompatible', () => {
    for (const entry of compatibilityMatrix)
      isCompatible(entry)
  })
})

describe('cli checksum helpers', () => {
  bench('sha256 checksum for medium bundle payload', async () => {
    await getChecksum(checksumPayload, 'sha256')
  })

  bench('crc32 checksum for medium bundle payload', async () => {
    await getChecksum(checksumPayload, 'crc32')
  })
})
