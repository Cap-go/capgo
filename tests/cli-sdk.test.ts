import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resetAndSeedAppData } from './test-utils'
import {
  addChannelSDK,
  cleanupCli,
  deleteChannelSDK,
  listBundlesSDK,
  listChannelsSDK,
  prepareCli,
  uploadBundleSDK,
} from './cli-sdk-utils'

/**
 * SDK-based CLI tests - demonstrating direct SDK imports instead of process spawning
 * This approach is significantly faster because it avoids Node process startup overhead
 */

// Use a unique app name for each test run
const APPNAME = `com.cli_sdk_test.${Date.now()}.${Math.random().toString(36).substring(7)}`

describe('CLI SDK Tests - Upload and Channel Management', () => {
  beforeAll(async () => {
    await Promise.all([
      resetAndSeedAppData(APPNAME),
      prepareCli(APPNAME),
    ])
  })

  it('should upload bundle using SDK', async () => {
    const result = await uploadBundleSDK(APPNAME, '2.0.0', 'production', {
      ignoreCompatibilityCheck: true,
    })

    expect(result.success).toBe(true)
    expect(result.bundleId).toBe('2.0.0')
  }, 60000)

  it('should list bundles using SDK', async () => {
    const result = await listBundlesSDK(APPNAME)

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data!.length).toBeGreaterThan(0)
    // Should contain our uploaded bundle
    const uploaded = result.data!.find(b => b.version === '2.0.0')
    expect(uploaded).toBeDefined()
  }, 10000)

  it('should add channel using SDK', async () => {
    const result = await addChannelSDK('staging', APPNAME, false)

    expect(result.success).toBe(true)
  }, 10000)

  it('should list channels using SDK', async () => {
    const result = await listChannelsSDK(APPNAME)

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data!.length).toBeGreaterThanOrEqual(2) // production and staging
  }, 10000)

  it('should upload another bundle version', async () => {
    const result = await uploadBundleSDK(APPNAME, '2.1.0', 'staging', {
      ignoreCompatibilityCheck: true,
    })

    expect(result.success).toBe(true)
    expect(result.bundleId).toBe('2.1.0')
  }, 60000)

  it('should delete channel using SDK', async () => {
    const result = await deleteChannelSDK('staging', APPNAME, false)

    expect(result.success).toBe(true)
  }, 10000)

  it('should verify channel was deleted', async () => {
    const result = await listChannelsSDK(APPNAME)

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()

    // Staging should be removed, only production should remain
    const stagingChannel = result.data!.find(ch => ch.name === 'staging')
    expect(stagingChannel).toBeUndefined()
  }, 10000)

  // Cleanup after test
  afterAll(async () => {
    await cleanupCli(APPNAME)
  })
})

describe('SDK Performance Comparison', () => {
  const SDK_TEST_APP = `com.sdk_perf_test.${Date.now()}`

  beforeAll(async () => {
    await Promise.all([
      resetAndSeedAppData(SDK_TEST_APP),
      prepareCli(SDK_TEST_APP),
    ])
  })

  it('should upload bundle quickly using SDK (no process spawn overhead)', async () => {
    const startTime = Date.now()

    const result = await uploadBundleSDK(SDK_TEST_APP, '3.0.0', 'production', {
      ignoreCompatibilityCheck: true,
    })

    const duration = Date.now() - startTime

    expect(result.success).toBe(true)
    console.log(`SDK upload took ${duration}ms`)

    // SDK should be faster than traditional CLI spawn (which takes ~1-2s just for process startup)
    // We're just measuring here for comparison
  }, 60000)

  afterAll(async () => {
    await cleanupCli(SDK_TEST_APP)
  })
})
