import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { uploadBundleSDK } from './cli-sdk-utils'
import { cleanupCli, getSemver, prepareCli, tempFileFolder } from './cli-utils'
import { BASE_URL, getSupabaseClient, headers, ORG_ID, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils'

// Helper to retry SDK operations that may fail due to transient network issues in CI
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

async function uploadWithFreshVersionRetry(
  appId: string,
  channel: string,
  additionalOptions?: Parameters<typeof uploadBundleSDK>[3],
  maxRetries = 4,
) {
  let lastVersion = getSemver()
  let lastResult = await uploadBundleSDK(appId, lastVersion, channel, additionalOptions)

  for (let attempt = 1; attempt < maxRetries; attempt++) {
    if (lastResult.success || !lastResult.error?.includes('fetch failed')) {
      return { result: lastResult, version: lastVersion }
    }
    await new Promise(resolve => setTimeout(resolve, 500 * attempt))
    lastVersion = getSemver()
    lastResult = await uploadBundleSDK(appId, lastVersion, channel, additionalOptions)
  }

  return { result: lastResult, version: lastVersion }
}

async function createScopedApiKey(mode: 'all' | 'upload', limitedToOrgs: string[]) {
  const response = await fetch(`${BASE_URL}/apikey`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `cli-test-${randomUUID()}`,
      mode,
      limited_to_orgs: limitedToOrgs,
      limited_to_apps: [],
    }),
  })

  const data = await response.json() as { id?: number, key?: string, error?: string }
  expect(response.status).toBe(200)
  expect(data.id).toBeTypeOf('number')
  expect(data.key).toBeTypeOf('string')

  return {
    id: data.id as number,
    key: data.key as string,
  }
}

async function deleteScopedApiKey(id: number) {
  await fetch(`${BASE_URL}/apikey/${id}`, {
    method: 'DELETE',
    headers,
  })
}

describe('tests CLI upload', () => {
  const idSuccess = randomUUID()
  const APPNAME_success = `com.cli_${idSuccess}`

  beforeAll(async () => {
    await Promise.all([
      resetAndSeedAppData(APPNAME_success),
      prepareCli(APPNAME_success),
    ])
  })

  afterAll(async () => {
    await Promise.all([
      cleanupCli(APPNAME_success),
      resetAppData(APPNAME_success),
      resetAppDataStats(APPNAME_success),
    ])
  })

  it('should upload bundle successfully', async () => {
    const { result } = await uploadWithFreshVersionRetry(APPNAME_success, 'production', {
      ignoreCompatibilityCheck: true,
    })
    expect(result.success).toBe(true)
  }, 60000)

  it('should not upload same hash twice', async () => {
    const appName = `com.cli_duplicate_${randomUUID()}`
    await Promise.all([
      resetAndSeedAppData(appName),
      prepareCli(appName),
    ])

    try {
      // First upload
      const { result: firstUpload, version } = await uploadWithFreshVersionRetry(appName, 'production', {
        ignoreCompatibilityCheck: true,
      })
      expect(firstUpload.success).toBe(true)

      // Second upload with same content should be skipped
      const result2 = await uploadBundleSDK(appName, version, 'production', {
        ignoreCompatibilityCheck: true,
      })
      expect(result2.success).toBe(false)
      expect(
        result2.error?.includes('same bundle content')
        || result2.error?.includes('already exists'),
      ).toBe(true)
    }
    finally {
      await Promise.all([
        cleanupCli(appName),
        resetAppData(appName),
        resetAppDataStats(appName),
      ])
    }
  }, 60000)
})

describe('tests CLI upload options in parallel', () => {
  const sharedId = randomUUID()
  const SHARED_APPNAME = `com.cli_shared_${sharedId}`

  // Use Maps with unique keys for atomic access in concurrent tests
  const fileTestApps = new Map<string, { id: string, APPNAME: string }>()
  const apiTestApps = new Map<string, { id: string, APPNAME: string }>()
  const usedApps: Array<string> = []

  const prepareApp = async () => {
    const id = randomUUID()
    const APPNAME = `com.cli_ccr_${id}`
    await Promise.all([
      resetAndSeedAppData(APPNAME),
      prepareCli(APPNAME),
    ])
    return { id, APPNAME }
  }

  beforeAll(async () => {
    const promises = []

    promises.push(Promise.all([
      resetAndSeedAppData(SHARED_APPNAME),
      prepareCli(SHARED_APPNAME),
    ]))

    // Use unique keys for each test that needs an app
    promises.push(prepareApp().then(app => fileTestApps.set('code-check', app)))
    promises.push(prepareApp().then(app => apiTestApps.set('org-limited', app)))
    promises.push(prepareApp().then(app => apiTestApps.set('wrong-org', app)))

    await Promise.all(promises)
  })

  afterAll(async () => {
    const allApps = [SHARED_APPNAME, ...usedApps]

    await Promise.all(allApps.map(async (appName) => {
      await Promise.all([
        cleanupCli(appName),
        resetAppData(appName),
        resetAppDataStats(appName),
      ])
    }))
  })

  it.concurrent('test code check (missing notifyAppReady)', async () => {
    const app = fileTestApps.get('code-check')
    if (!app)
      throw new Error('No file test app available for code-check test')
    usedApps.push(app.APPNAME)

    const semver = getSemver()
    writeFileSync(join(tempFileFolder(app.APPNAME), 'dist', 'index.js'), 'import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log("Hello world!!!");')

    const result = await uploadBundleSDK(app.APPNAME, semver, 'production', {
      ignoreCompatibilityCheck: true,
      disableCodeCheck: false, // Enable code check for this test
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('notifyAppReady')
  }, 60000)

  it('test --min-update-version', async () => {
    const semver = getSemver()
    const result = await uploadBundleSDK(SHARED_APPNAME, semver, 'production', {
      ignoreCompatibilityCheck: true,
      minUpdateVersion: '1.0.0',
    })
    expect(result.success).toBe(true)

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('min_update_version')
      .eq('name', semver)
      .eq('app_id', SHARED_APPNAME)
      .single()

    expect(error).toBeNull()
    expect(data?.min_update_version).toBe('1.0.0')
  }, 60000)

  it('cannot upload with wrong api key', async () => {
    const testApiKey = randomUUID()
    const semver = getSemver()
    const result = await uploadBundleSDK(SHARED_APPNAME, semver, 'production', {
      ignoreCompatibilityCheck: true,
      apikey: testApiKey,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid API key')
  }, 60000)

  it.concurrent('should test upload with org-limited API key', async () => {
    const app = apiTestApps.get('org-limited')
    if (!app)
      throw new Error('No API test app available for org-limited test')
    usedApps.push(app.APPNAME)

    const semver = getSemver()
    let createdApikeyId: number | null = null
    let createdPlainKey: string | null = null

    try {
      const createdApikey = await createScopedApiKey('all', [ORG_ID])
      createdApikeyId = createdApikey.id
      createdPlainKey = createdApikey.key

      const result = await retryUpload(() => uploadBundleSDK(app.APPNAME, semver, 'production', {
        ignoreCompatibilityCheck: true,
        apikey: createdPlainKey as string,
      }))
      expect(result.success).toBe(true)
    }
    finally {
      if (createdApikeyId !== null)
        await deleteScopedApiKey(createdApikeyId)
    }
  }, 60000)

  it.concurrent('should fail upload with wrong org-limited API key', async () => {
    const app = apiTestApps.get('wrong-org')
    if (!app)
      throw new Error('No API test app available for wrong-org test')
    usedApps.push(app.APPNAME)

    const semver = getSemver()
    const wrongOrgId = randomUUID()
    let createdApikeyId: number | null = null
    let createdPlainKey: string | null = null

    try {
      const createdApikey = await createScopedApiKey('upload', [wrongOrgId])
      createdApikeyId = createdApikey.id
      createdPlainKey = createdApikey.key

      const result = await uploadBundleSDK(app.APPNAME, semver, 'production', {
        ignoreCompatibilityCheck: true,
        apikey: createdPlainKey as string,
      })
      expect(result.success).toBe(false)
      // Error message can vary - either explicit org mismatch or generic permission error
      expect(
        result.error?.includes('Cannot get organization id for app id')
        || result.error?.includes('Invalid API key or insufficient permissions'),
      ).toBe(true)
    }
    finally {
      if (createdApikeyId !== null)
        await deleteScopedApiKey(createdApikeyId)
    }
  }, 60000)
})
