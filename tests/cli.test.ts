import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupCli, getSemver, prepareCli, runCli, tempFileFolder } from './cli-utils'
import { getSupabaseClient, ORG_ID, resetAndSeedAppData, resetAppData, resetAppDataStats, USER_ID } from './test-utils'

describe('tests CLI upload', () => {
  const id_one = randomUUID()
  const APPNAME_one = `com.cli_${id_one}`

  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME_one)
    await prepareCli(APPNAME_one)
  })

  afterAll(async () => {
    await cleanupCli(APPNAME_one)
    await resetAppData(APPNAME_one)
    await resetAppDataStats(APPNAME_one)
  })

  // Essential upload tests only
  it('should upload bundle successfully', async () => {
    const semver = getSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--ignore-checksum-check', '--dry-upload'], APPNAME_one, false)
    expect(output).toContain('Time to share your update to the world')
  }, 30000) // Increase timeout to 30 seconds

  it('should not upload same hash twice', async () => {
    const semver = getSemver()

    // First upload
    await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--dry-upload'], APPNAME_one, false)

    // Second upload with same content should be skipped
    const output2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--dry-upload'], APPNAME_one, false)
    expect(output2).toContain('Cannot upload the same bundle content')
  }, 30000) // Increase timeout
})

describe.concurrent('tests CLI upload options in parallel', () => {
  // Single shared app for most tests to reduce setup overhead
  const sharedId = randomUUID()
  const SHARED_APPNAME = `com.cli_shared_${sharedId}`

  // Pre-create minimal apps for file modification tests
  const fileTestApps: Array<{ id: string, APPNAME: string }> = []
  const apiTestApps: Array<{ id: string, APPNAME: string }> = []
  const usedApps: Array<string> = []

  const prepareApp = async () => {
    const id = randomUUID()
    const APPNAME = `com.cli_ccr_${id}`
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME)
    return { id, APPNAME }
  }

  beforeAll(async () => {
    // Setup shared app
    await resetAndSeedAppData(SHARED_APPNAME)
    await prepareCli(SHARED_APPNAME)

    // Pre-create only essential apps (reduced further)
    const promises = []

    // Only 1 app for file tests
    for (let i = 0; i < 1; i++) {
      promises.push(prepareApp().then(app => fileTestApps.push(app)))
    }

    // Create enough API test apps to handle retries
    for (let i = 0; i < 6; i++) {
      promises.push(prepareApp().then(app => apiTestApps.push(app)))
    }

    await Promise.all(promises)
  })

  afterAll(async () => {
    const allApps = [SHARED_APPNAME, ...usedApps]

    for (const appName of allApps) {
      await cleanupCli(appName)
      await resetAppData(appName)
      await resetAppDataStats(appName)
    }
  })

  // Essential file modification tests (only most critical)
  it.concurrent('test code check (missing notifyAppReady)', async () => {
    const app = fileTestApps.shift()
    if (!app)
      throw new Error('No file test app available')
    usedApps.push(app.APPNAME)

    const semver = getSemver()
    writeFileSync(join(tempFileFolder(app.APPNAME), 'dist', 'index.js'), 'import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log("Hello world!!!");')
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--dry-upload'], app.APPNAME, false)
    expect(output).toContain('notifyAppReady() is missing in')
  }, 30000)

  // Essential upload option tests (use shared app)
  it.concurrent('test --min-update-version', async () => {
    const semver = getSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--min-update-version', '1.0.0', '--ignore-checksum-check', '--dry-upload'], SHARED_APPNAME, false)
    expect(output).toContain('Time to share your update to the world')

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
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--dry-upload'], SHARED_APPNAME, false, testApiKey)
    expect(output).toContain('Invalid API key or insufficient permissions.')
  }, 30000)

  // Essential API key tests (only most critical)
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

      const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--ignore-checksum-check', '--dry-upload'], app.APPNAME, false, testApiKey)
      expect(output).toContain('Bundle uploaded')
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

      const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--dry-upload'], app.APPNAME, false, testApiKey)
      expect(output).toContain(`Cannot get organization id for app id ${app.APPNAME}`)
    }
    finally {
      await supabase.from('apikeys').delete().eq('key', testApiKey)
    }
  }, 30000)
})
