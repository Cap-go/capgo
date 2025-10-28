import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { uploadBundleSDK } from './cli-sdk-utils'
import { cleanupCli, getSemver, prepareCli, tempFileFolder } from './cli-utils'
import { getSupabaseClient, ORG_ID, resetAndSeedAppData, resetAppData, resetAppDataStats, USER_ID } from './test-utils'

describe('tests CLI upload', () => {
  const id_one = randomUUID()
  const APPNAME_one = `com.cli_${id_one}`

  beforeAll(async () => {
    await Promise.all([
      resetAndSeedAppData(APPNAME_one),
      prepareCli(APPNAME_one),
    ])
  })

  afterAll(async () => {
    await Promise.all([
      cleanupCli(APPNAME_one),
      resetAppData(APPNAME_one),
      resetAppDataStats(APPNAME_one),
    ])
  })

  it('should upload bundle successfully', async () => {
    const semver = getSemver()
    const result = await uploadBundleSDK(APPNAME_one, semver, 'production', {
      ignoreCompatibilityCheck: true,
    })
    expect(result.success).toBe(true)
  }, 30000)

  it('should not upload same hash twice', async () => {
    const semver = getSemver()

    // First upload
    await uploadBundleSDK(APPNAME_one, semver, 'production', {
      ignoreCompatibilityCheck: true,
    })

    // Second upload with same content should be skipped
    const result2 = await uploadBundleSDK(APPNAME_one, semver, 'production', {
      ignoreCompatibilityCheck: true,
    })
    expect(result2.success).toBe(false)
    expect(result2.error).toContain('same bundle content')
  }, 30000)
})

describe.concurrent('tests CLI upload options in parallel', () => {
  const sharedId = randomUUID()
  const SHARED_APPNAME = `com.cli_shared_${sharedId}`

  const fileTestApps: Array<{ id: string, APPNAME: string }> = []
  const apiTestApps: Array<{ id: string, APPNAME: string }> = []
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

    promises.push(prepareApp().then(app => fileTestApps.push(app)))

    for (let i = 0; i < 2; i++) {
      promises.push(prepareApp().then(app => apiTestApps.push(app)))
    }

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
    const app = fileTestApps.shift()
    if (!app)
      throw new Error('No file test app available')
    usedApps.push(app.APPNAME)

    const semver = getSemver()
    writeFileSync(join(tempFileFolder(app.APPNAME), 'dist', 'index.js'), 'import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log("Hello world!!!");')

    const result = await uploadBundleSDK(app.APPNAME, semver, 'production', {
      ignoreCompatibilityCheck: true,
      disableCodeCheck: false, // Enable code check for this test
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('notifyAppReady')
  }, 30000)

  it.concurrent('test --min-update-version', async () => {
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
  }, 30000)

  it.concurrent('cannot upload with wrong api key', async () => {
    const testApiKey = randomUUID()
    const semver = getSemver()
    const result = await uploadBundleSDK(SHARED_APPNAME, semver, 'production', {
      ignoreCompatibilityCheck: true,
      apikey: testApiKey,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid API key')
  }, 30000)

  it.concurrent('should test upload with org-limited API key', async () => {
    const app = apiTestApps.shift()
    if (!app)
      throw new Error('No API test app available')
    usedApps.push(app.APPNAME)

    const semver = getSemver()
    const testApiKey = randomUUID()
    const supabase = getSupabaseClient()

    try {
      await supabase.from('apikeys')
        .insert({
          key: testApiKey,
          user_id: USER_ID,
          mode: 'all',
          name: 'test',
          limited_to_orgs: [ORG_ID],
        })

      const result = await uploadBundleSDK(app.APPNAME, semver, 'production', {
        ignoreCompatibilityCheck: true,
        apikey: testApiKey,
      })
      expect(result.success).toBe(true)
    }
    finally {
      await supabase.from('apikeys').delete().eq('key', testApiKey)
    }
  }, 30000)

  it.concurrent('should fail upload with wrong org-limited API key', async () => {
    const app = apiTestApps.shift()
    if (!app)
      throw new Error('No API test app available')
    usedApps.push(app.APPNAME)

    const semver = getSemver()
    const testApiKey = randomUUID()
    const wrongOrgId = randomUUID()
    const supabase = getSupabaseClient()

    try {
      await supabase.from('apikeys')
        .insert({
          key: testApiKey,
          user_id: USER_ID,
          mode: 'upload',
          name: 'test',
          limited_to_orgs: [wrongOrgId],
        })

      const result = await uploadBundleSDK(app.APPNAME, semver, 'production', {
        ignoreCompatibilityCheck: true,
        apikey: testApiKey,
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain(`Cannot get organization id for app id ${app.APPNAME}`)
    }
    finally {
      await supabase.from('apikeys').delete().eq('key', testApiKey)
    }
  }, 30000)
})
