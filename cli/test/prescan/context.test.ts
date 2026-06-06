// test/prescan/context.test.ts
import { describe, expect, it } from 'bun:test'
import { buildScanContext } from '../../src/build/prescan/context'
import { makeProject } from './helpers'

describe('buildScanContext', () => {
  it('uses pre-merged credentials verbatim (no saved-file/env re-merge)', async () => {
    const credentials = { ANDROID_KEYSTORE_FILE: 'b64', KEYSTORE_KEY_ALIAS: 'release' }
    const ctx = await buildScanContext({
      appId: 'com.demo.app',
      platform: 'android',
      projectDir: makeProject({}),
      credentials,
    })
    expect(ctx.credentials).toEqual(credentials)
  })

  it('falls back to CAPGO_ANDROID_FLAVOR / CAPGO_IOS_DISTRIBUTION from credentials', async () => {
    const ctx = await buildScanContext({
      appId: 'com.demo.app',
      platform: 'android',
      projectDir: makeProject({}),
      credentials: { CAPGO_ANDROID_FLAVOR: 'prod', CAPGO_IOS_DISTRIBUTION: 'ad_hoc' },
    })
    expect(ctx.androidFlavor).toBe('prod')
    expect(ctx.distributionMode).toBe('ad_hoc')
  })

  it('explicit args win over credential-derived fallbacks', async () => {
    const ctx = await buildScanContext({
      appId: 'com.demo.app',
      platform: 'android',
      projectDir: makeProject({}),
      androidFlavor: 'dev',
      distributionMode: 'app_store',
      credentials: { CAPGO_ANDROID_FLAVOR: 'prod', CAPGO_IOS_DISTRIBUTION: 'ad_hoc' },
    })
    expect(ctx.androidFlavor).toBe('dev')
    expect(ctx.distributionMode).toBe('app_store')
  })

  it('ignores invalid CAPGO_IOS_DISTRIBUTION values', async () => {
    const ctx = await buildScanContext({
      appId: 'com.demo.app',
      platform: 'ios',
      projectDir: makeProject({}),
      credentials: { CAPGO_IOS_DISTRIBUTION: 'enterprise' },
    })
    expect(ctx.distributionMode).toBeUndefined()
  })
})
