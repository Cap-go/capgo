// test/prescan/upload-intent.test.ts
import type { ScanContext } from '../../src/build/prescan/types'
import { describe, expect, it } from 'bun:test'
import { willUploadToAppStore, willUploadToPlay } from '../../src/build/prescan/upload-intent'

const base = (partial: Partial<ScanContext>): ScanContext => ({
  appId: 'com.demo.app',
  platform: 'android',
  projectDir: '/tmp/x',
  ...partial,
})

const APPLE_TRIPLET = {
  APPLE_KEY_ID: 'KID',
  APPLE_ISSUER_ID: 'ISS',
  APPLE_KEY_CONTENT: 'base64pem',
}

describe('willUploadToPlay', () => {
  it('true on android with PLAY_CONFIG_JSON present', () => {
    expect(willUploadToPlay(base({ platform: 'android', credentials: { PLAY_CONFIG_JSON: 'eyJ9' } }))).toBe(true)
  })

  it('false on android without PLAY_CONFIG_JSON (deleted by --no-playstore-upload upstream)', () => {
    expect(willUploadToPlay(base({ platform: 'android', credentials: {} }))).toBe(false)
    expect(willUploadToPlay(base({ platform: 'android' }))).toBe(false)
  })

  it('false on ios even with PLAY_CONFIG_JSON', () => {
    expect(willUploadToPlay(base({ platform: 'ios', credentials: { PLAY_CONFIG_JSON: 'eyJ9' } }))).toBe(false)
  })
})

describe('willUploadToAppStore', () => {
  it('true on ios app_store with the full ASC triplet', () => {
    expect(willUploadToAppStore(base({ platform: 'ios', distributionMode: 'app_store', credentials: { ...APPLE_TRIPLET } }))).toBe(true)
  })

  it('true on ios with undefined distributionMode (defaults to app_store) + full triplet', () => {
    expect(willUploadToAppStore(base({ platform: 'ios', credentials: { ...APPLE_TRIPLET } }))).toBe(true)
  })

  it('false on ios ad_hoc even with full triplet', () => {
    expect(willUploadToAppStore(base({ platform: 'ios', distributionMode: 'ad_hoc', credentials: { ...APPLE_TRIPLET } }))).toBe(false)
  })

  it('false on ios app_store with a partial triplet', () => {
    expect(willUploadToAppStore(base({ platform: 'ios', distributionMode: 'app_store', credentials: { APPLE_KEY_ID: 'KID', APPLE_ISSUER_ID: 'ISS' } }))).toBe(false)
    expect(willUploadToAppStore(base({ platform: 'ios', distributionMode: 'app_store', credentials: { APPLE_KEY_ID: 'KID' } }))).toBe(false)
    expect(willUploadToAppStore(base({ platform: 'ios', distributionMode: 'app_store', credentials: {} }))).toBe(false)
  })

  it('false on ios with no credentials at all', () => {
    expect(willUploadToAppStore(base({ platform: 'ios' }))).toBe(false)
  })

  it('false on android regardless of credentials', () => {
    expect(willUploadToAppStore(base({ platform: 'android', distributionMode: 'app_store', credentials: { ...APPLE_TRIPLET } }))).toBe(false)
  })
})
