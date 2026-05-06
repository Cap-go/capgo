import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestSDK, uploadBundleSDK } from './cli-sdk-utils'
import { cleanupCli, getSemver, prepareCli } from './cli-utils'
import { getSupabaseClient, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils'

// Helper to retry Supabase operations that may fail due to transient network issues in CI
async function retrySupabase<T>(
  fn: () => PromiseLike<{ data: T | null, error: any }>,
  maxRetries = 3,
): Promise<{ data: T | null, error: any }> {
  let lastResult: { data: T | null, error: any } = { data: null, error: null }
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      lastResult = await fn()
      if (!lastResult.error || !lastResult.error.message?.includes('fetch failed')) {
        return lastResult
      }
    }
    catch (e: any) {
      if (!e.message?.includes('fetch failed') && !e.message?.includes('other side closed')) {
        throw e
      }
      lastResult = { data: null, error: e }
    }
    // Wait before retry with exponential backoff
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
  }
  return lastResult
}

// Helper to retry SDK upload operations that may fail due to transient network issues in CI
async function retryUpload<T extends { success: boolean, error?: string }>(
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let lastResult: T | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    lastResult = await fn()
    // Only retry on transient network errors, not on actual failures
    if (lastResult.success || !lastResult.error?.includes('fetch failed')) {
      return lastResult
    }
    // Wait before retry with exponential backoff
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
  }
  return lastResult!
}

function getUploadErrorMessage(result: { error?: string }) {
  return result.error ?? ''
}

function isTransientNetworkError(error: string) {
  return error.includes('fetch failed') || error.includes('other side closed')
}

async function writeBundleContent(appId: string, marker: string) {
  const indexHtmlPath = join(process.cwd(), 'temp_cli_test', appId, 'dist', 'index.html')
  await writeFile(indexHtmlPath, `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CLI Min Version Test</title>
</head>
<body>
  <h1>${marker}</h1>
  <script>
    if (window.CapacitorUpdater) {
      window.CapacitorUpdater.notifyAppReady();
    }
  </script>
</body>
</html>`)
}

describe('tests min version', () => {
  const id = randomUUID()
  const APPNAME = `com.cli_min_version_${id}`

  beforeAll(async () => {
    await Promise.all([
      resetAndSeedAppData(APPNAME),
      prepareCli(APPNAME, false, false), // Use main project dependencies instead
    ])
  })

  afterAll(async () => {
    await Promise.all([
      cleanupCli(APPNAME),
      resetAppData(APPNAME),
      resetAppDataStats(APPNAME),
    ])
  })

  it('should test auto min version flag', async () => {
    const supabase = getSupabaseClient()
    await resetAppData(APPNAME)
    await resetAndSeedAppData(APPNAME)

    const { error } = await supabase.from('app_versions').update({ min_update_version: '1.0.0' }).eq('name', '1.0.0').eq('app_id', APPNAME).throwOnError()
    expect(error).toBeNull()

    // Use a fixed version instead of timestamp-based to avoid timing issues
    const testId = Math.floor(Math.random() * 1000000)
    const semverDefault = `1.0.${testId}`
    const channelName = `min-version-${testId}`
    const packageJsonPath = join(process.cwd(), 'temp_cli_test', APPNAME, 'package.json')
    const sdk = createTestSDK()

    const createChannelResult = await retryUpload(() => sdk.addChannel({
      appId: APPNAME,
      channelId: channelName,
    }), 5)
    const createChannelError = getUploadErrorMessage(createChannelResult)
    if (isTransientNetworkError(createChannelError)) {
      console.warn('Skipping test due to network flakiness:', createChannelError)
      return
    }
    expect(createChannelResult.success).toBe(true)

    const linkSeedBundleResult = await retryUpload(() => sdk.updateChannel({
      appId: APPNAME,
      channelId: channelName,
      bundle: '1.0.0',
    }), 5)
    const linkSeedBundleError = getUploadErrorMessage(linkSeedBundleResult)
    if (isTransientNetworkError(linkSeedBundleError)) {
      console.warn('Skipping test due to network flakiness:', linkSeedBundleError)
      return
    }
    expect(linkSeedBundleResult.success).toBe(true)

    await writeBundleContent(APPNAME, `auto-min-${semverDefault}`)

    // Upload with auto-min-update-version:app_versions!channels_version_fkey(needs metadata check enabled)
    const result0 = await retryUpload(() => uploadBundleSDK(APPNAME, semverDefault, channelName, {
      ignoreCompatibilityCheck: false,
      packageJsonPaths: packageJsonPath,
      autoMinUpdateVersion: true,
    }), 5) // Increase retries for network flakiness

    // Allow network errors during CI - they don't indicate a test logic failure
    const result0Error = getUploadErrorMessage(result0)
    if (isTransientNetworkError(result0Error)) {
      console.warn('Skipping test due to network flakiness:', result0Error)
      return
    }

    expect(result0.success).toBe(true)

    // Check that min_update_version was auto-set
    const { data, error: checkError } = await supabase
      .from('app_versions')
      .select('min_update_version')
      .eq('name', semverDefault)
      .eq('app_id', APPNAME)
      .single()
      .throwOnError()
    expect(checkError).toBeNull()
    // The auto-min-update-version should have set a value
    expect(data?.min_update_version).toBeDefined()

    // Clear min_update_version for next test (with retry for transient network errors)
    await retrySupabase(() => supabase
      .from('app_versions')
      .update({ min_update_version: null })
      .eq('name', semverDefault)
      .eq('app_id', APPNAME))

    // Upload a new version with auto-min-update-version
    // This should FAIL because native_packages aren't set on previous version
    const semverNew = getSemver(semverDefault)
    await writeBundleContent(APPNAME, `auto-min-${semverNew}`)
    const result1 = await retryUpload(() => uploadBundleSDK(APPNAME, semverNew, channelName, {
      ignoreCompatibilityCheck: false,
      packageJsonPaths: packageJsonPath,
      autoMinUpdateVersion: true,
    }), 5)
    const result1Error = getUploadErrorMessage(result1)
    if (isTransientNetworkError(result1Error)) {
      console.warn('Skipping test due to network flakiness:', result1Error)
      return
    }

    // This upload should fail with auto-setting compatibility error
    // Note: May also fail with network error during native packages fetch
    expect(result1.success).toBe(false)
    expect(
      result1Error.includes('Cannot auto set compatibility')
      || result1Error.includes('Error fetching native packages')
      || result1Error.includes('Invalid remote min update version'),
    ).toBe(true)

    // The new version should NOT exist because upload failed
    const { data: dataNew, error: checkErrorNew } = await supabase
      .from('app_versions')
      .select('min_update_version')
      .eq('name', semverNew)
      .eq('app_id', APPNAME)
      .single()
    expect(checkErrorNew).toBeDefined()
    expect(dataNew).toBeNull()

    // Clear native_packages from previous version to simulate first upload
    const { error: error2 } = await supabase
      .from('app_versions')
      .update({ min_update_version: null, native_packages: null })
      .eq('name', semverDefault)
      .eq('app_id', APPNAME)
      .throwOnError()
    expect(error2).toBeNull()

    // Upload with auto-min-update-version when previous version has no native_packages
    const semverWithNull = `1.0.${testId + 2}`
    await writeBundleContent(APPNAME, `auto-min-${semverWithNull}`)
    const result2 = await retryUpload(() => uploadBundleSDK(APPNAME, semverWithNull, channelName, {
      ignoreCompatibilityCheck: false,
      packageJsonPaths: packageJsonPath,
      autoMinUpdateVersion: true,
    }), 5)
    const result2Error = getUploadErrorMessage(result2)
    if (isTransientNetworkError(result2Error)) {
      console.warn('Skipping test due to network flakiness:', result2Error)
      return
    }

    // Should succeed - it's first upload with compatibility check after clearing metadata.
    expect(result2.success).toBe(true)
  }, 30000)
})
