import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupCli, getSemver, prepareCli, runCli, tempFileFolder } from './cli-utils'
import { APIKEY_TEST_UPLOAD, getSupabaseClient, getUpdate, getUpdateBaseData, ORG_ID, resetAndSeedAppData, resetAppData, resetAppDataStats, responseOk, USER_ID, USER_ID_2 } from './test-utils'

//  only user USER_ID_2 for separate test in the parallel tests as it modifies the database

describe('tests CLI upload', () => {
  const id = randomUUID()
  const APPNAME = `com.cli_${id}`
  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME)
  })
  afterAll(async () => {
    await cleanupCli(APPNAME)
    await resetAppData(APPNAME)
    await resetAppDataStats(APPNAME)
  })

  let semver = getSemver()
  it('should upload bundle successfully', async () => {
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'], APPNAME, false)
    expect(output).toContain('Bundle uploaded')
  })
  it('should download and verify uploaded bundle', async () => {
    const baseData = getUpdateBaseData(APPNAME)
    const response = await getUpdate(baseData)
    await responseOk(response, 'Update new bundle')

    const responseJson = await response.json<{ url: string, version: string }>()
    expect(responseJson.url).toBeDefined()
    expect(responseJson.version).toBe(semver)

    const downloadResponse = await fetch(responseJson.url)
    await responseOk(downloadResponse, 'Download new bundle')
    const arrayBuffer = await downloadResponse.arrayBuffer()

    const zip = new AdmZip(Buffer.from(arrayBuffer))
    const zipEntries = zip.getEntries()

    expect(zipEntries.length).toBe(2)

    const indexJsEntry = zipEntries.find(entry => entry.entryName.includes('index.js'))
    expect(indexJsEntry).toBeDefined()

    const indexJsContent = indexJsEntry!.getData().toString('utf8')
    expect(indexJsContent).toBe('import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log(\"Hello world!!!\");\nCapacitorUpdater.notifyAppReady();')
  })
  it ('should not upload same hash twice', async () => {
    semver = getSemver(semver)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'], APPNAME, false)
    expect(output).toContain('Cannot upload the same bundle content')
  })
  it ('should upload an external bundle', async () => {
    semver = getSemver(semver)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--external', 'https://example.com'], APPNAME, false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .eq('app_id', APPNAME)
      .single()
      .throwOnError()

    expect(error).toBeNull()
    expect(data?.external_url).toBe('https://example.com')
    // New fields should exist but can be null
    expect(data).toHaveProperty('link')
    expect(data).toHaveProperty('comment')
  })
})
describe('tests CLI upload options in parallel', () => {
  const id_one = randomUUID()
  const APPNAME_one = `com.demo.app.cli_${id_one}`
  const prepareApp = async () => {
    const id = randomUUID()
    const APPNAME = `com.demo.app.cli_${id}`
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME)
    return { id, APPNAME }
  }
  const cleanupApp = async (id: string) => {
    await cleanupCli(id)
    await resetAppData(id)
    await resetAppDataStats(id)
  }
  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME_one)
    await prepareCli(APPNAME_one)
  })
  afterAll(async () => {
    console.log('cleanupApp', APPNAME_one)
    await cleanupApp(APPNAME_one)
  })

  it.concurrent('test code check (missing notifyAppReady)', async () => {
    const { APPNAME } = await prepareApp()
    const semver = getSemver()
    writeFileSync(join(tempFileFolder(APPNAME), 'dist', 'index.js'), 'import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log("Hello world!!!");')
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], APPNAME, false)
    expect(output).toContain('notifyAppReady() is missing in')
  })
  it.concurrent('test --iv-session-key with cloud upload', async () => {
    const semver = getSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--iv-session-key', 'aaa:bbb'], APPNAME_one, false)
    expect(output).toContain('You need to provide an external url if you want to use the --iv-session-key option')
  })
  it.concurrent('test --iv-session-key with external upload', async () => {
    const semver = getSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--iv-session-key', 'aaa:bbb', '--external', 'https://example.com'], APPNAME_one, false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .eq('app_id', APPNAME_one)
      .single()
      .throwOnError()

    expect(error).toBeNull()
    expect(data?.session_key).toBe('aaa:bbb')
  })
  it.concurrent('test --encrypted-checksum with cloud upload', async () => {
    const semver = getSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--encrypted-checksum', 'aaaa'], APPNAME_one, false)
    expect(output).toContain('You need to provide an external url if you want to use the --encrypted-checksum option')
  })
  it.concurrent('test --min-update-version', async () => {
    const semver = getSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--min-update-version', '1.0.0', '--ignore-checksum-check'], APPNAME_one, false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .eq('app_id', APPNAME_one)
      .single()
      .throwOnError()

    expect(error).toBeNull()
    expect(data?.min_update_version).toBe('1.0.0')
  })
  it.concurrent('test --encrypted-checksum with external upload', async () => {
    const semver = getSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--encrypted-checksum', 'aaaa', '--external', 'https://example.com'], APPNAME_one, false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .eq('app_id', APPNAME_one)
      .single()
      .throwOnError()

    expect(error).toBeNull()
    expect(data?.checksum).toBe('aaaa')
  })
  it.concurrent('test code check (missing index.html)', async () => {
    const { APPNAME } = await prepareApp()
    const semver = getSemver()
    rmSync(join(tempFileFolder(APPNAME), 'dist', 'index.html'))
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], APPNAME, false)
    expect(output).toContain('index.html is missing')
  })
  it.concurrent('test --no-code-check', async () => {
    const { APPNAME } = await prepareApp()
    let semver = getSemver()
    rmSync(join(tempFileFolder(APPNAME), 'dist', 'index.html'))
    semver = getSemver(semver)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--no-code-check'], APPNAME, false)
    expect(output).toContain('Time to share your update to the world')
  })
  it.concurrent('cannot upload with wrong api key', async () => {
    const { APPNAME } = await prepareApp()
    const testApiKey = randomUUID()
    const semver = getSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], APPNAME, false, testApiKey)
    expect(output).toContain('Invalid API key or insufficient permissions.')
  })

  it.concurrent('should test selectable disallow upload', async () => {
    const { APPNAME } = await prepareApp()
    const supabase = getSupabaseClient()
    const semver = getSemver()
    await supabase.from('channels').update({ disable_auto_update: 'version_number' }).eq('name', 'no_access').eq('app_id', APPNAME).throwOnError()

    // test if is set correctly
    const { data: channel } = await supabase.from('channels').select('*').eq('name', 'no_access').eq('app_id', APPNAME).single().throwOnError()
    expect(channel?.disable_auto_update).toBe('version_number')

    try {
      const output1 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'no_access'], APPNAME)
      expect(output1).toContain('to provide a min-update-version')

      const output2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'no_access', '--min-update-version', 'invalid', '--ignore-metadata-check'], APPNAME)
      expect(output2).toContain('should follow semver convention')
    }
    finally {
      await supabase.from('channels').update({ disable_auto_update: 'major' }).eq('name', 'no_access').eq('app_id', APPNAME).throwOnError()
    }
  })
  it.concurrent('should test upload with organization', async () => {
    const { APPNAME } = await prepareApp()
    let semver = getSemver()
    const testApiKey = randomUUID()
    const testUserId = USER_ID_2
    const supabase = getSupabaseClient()

    try {
      await supabase.from('apikeys')
        .insert({ key: testApiKey, user_id: testUserId, mode: 'upload', name: 'test' })
        .throwOnError()
      const { data: orgMembers } = await supabase.from('org_users')
        .delete()
        .eq('user_id', testUserId)
        .select('*')
        .throwOnError()

      try {
        await supabase.from('org_users')
          .insert({ user_id: testUserId, org_id: ORG_ID, user_right: 'upload' })
          .throwOnError()

        try {
          semver = getSemver(semver)
          const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--ignore-checksum-check'], APPNAME, false, testApiKey)
          expect(output).toContain('Bundle uploaded')
        }
        finally {
          await supabase.from('org_users')
            .delete()
            .eq('user_id', testUserId)
            .eq('org_id', ORG_ID)
            .eq('user_right', 'upload')
            .throwOnError()
        }
      }
      finally {
        await supabase.from('org_users').insert(orgMembers!)
      }
    }
    finally {
      await supabase.from('apikeys')
        .delete()
        .eq('key', testApiKey)
        .eq('user_id', testUserId)
        .throwOnError()
    }
  })
  it.concurrent('should not allow setting channel with APIKEY_TEST_UPLOAD but allow upload', async () => {
    const { APPNAME } = await prepareApp()
    const semver = getSemver()

    const supabase = getSupabaseClient()
    // Get channel version before upload
    const { data: channelBefore } = await supabase
      .from('channels')
      .select('version')
      .eq('name', 'production')
      .eq('app_id', APPNAME)
      .single()
      .throwOnError()

    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], APPNAME, false, APIKEY_TEST_UPLOAD)
    expect(output).toContain('The upload key is not allowed to set the version in the channel')
    expect(output).toContain('Bundle uploaded')

    // Verify channel version hasn't changed
    const { data: channelAfter } = await supabase
      .from('channels')
      .select('version')
      .eq('name', 'production')
      .eq('app_id', APPNAME)
      .single()
      .throwOnError()

    expect(channelAfter.version).toBe(channelBefore.version)
  })
  it.concurrent('should test upload with org-limited API key', async () => {
    const { APPNAME } = await prepareApp()
    const semver = getSemver()
    const testApiKey = randomUUID()
    const testUserId = USER_ID
    const supabase = getSupabaseClient()

    try {
      await supabase.from('apikeys')
        .insert({
          key: testApiKey,
          user_id: testUserId,
          mode: 'all',
          name: 'test',
          limited_to_orgs: [ORG_ID],
        })
        .throwOnError()

      const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--ignore-checksum-check'], APPNAME, false, testApiKey)
      expect(output).toContain('Bundle uploaded')
    }
    finally {
      await supabase.from('apikeys')
        .delete()
        .eq('key', testApiKey)
        .throwOnError()
    }
  })

  it.concurrent('should test upload with app-limited API key', async () => {
    const { APPNAME } = await prepareApp()
    const semver = getSemver()
    const testApiKey = randomUUID()
    const testUserId = USER_ID
    const supabase = getSupabaseClient()

    try {
      await supabase.from('apikeys')
        .insert({
          key: testApiKey,
          user_id: testUserId,
          mode: 'upload',
          name: 'test',
          limited_to_apps: [APPNAME],
        })
        .throwOnError()

      const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--ignore-checksum-check'], APPNAME, false, testApiKey)
      expect(output).toContain('Bundle uploaded')
    }
    finally {
      await supabase.from('apikeys')
        .delete()
        .eq('key', testApiKey)
        .throwOnError()
    }
  })

  it.concurrent('should fail upload with wrong org-limited API key', async () => {
    const { APPNAME } = await prepareApp()
    const semver = getSemver()
    const testApiKey = randomUUID()
    const wrongOrgId = randomUUID()
    const testUserId = USER_ID
    const supabase = getSupabaseClient()

    try {
      await supabase.from('apikeys')
        .insert({
          key: testApiKey,
          user_id: testUserId,
          mode: 'upload',
          name: 'test',
          limited_to_orgs: [wrongOrgId],
        })
        .throwOnError()

      const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], APPNAME, false, testApiKey)
      expect(output).toContain(`Cannot get organization id for app id ${APPNAME}`)
    }
    finally {
      await supabase.from('apikeys')
        .delete()
        .eq('key', testApiKey)
        .throwOnError()
    }
  })

  it.concurrent('should fail upload with wrong app-limited API key', async () => {
    const { APPNAME } = await prepareApp()
    const semver = getSemver()
    const testApiKey = randomUUID()
    const wrongAppId = 'com.wrong.app'
    const testUserId = USER_ID
    const supabase = getSupabaseClient()

    try {
      await supabase.from('apikeys')
        .insert({
          key: testApiKey,
          user_id: testUserId,
          mode: 'upload',
          name: 'test',
          limited_to_apps: [wrongAppId],
        })
        .throwOnError()

      const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], APPNAME, false, testApiKey)
      expect(output).toContain(`Cannot get organization id for app id ${APPNAME}`)
    }
    finally {
      await supabase.from('apikeys')
        .delete()
        .eq('key', testApiKey)
        .throwOnError()
    }
  })

  it.concurrent('should fail upload when using read-only API key with org limitation', async () => {
    const { APPNAME } = await prepareApp()
    const semver = getSemver()
    const testApiKey = randomUUID()
    const testUserId = USER_ID
    const supabase = getSupabaseClient()

    try {
      await supabase.from('apikeys')
        .insert({
          key: testApiKey,
          user_id: testUserId,
          mode: 'read',
          name: 'test',
          limited_to_orgs: [ORG_ID],
        })
        .throwOnError()

      const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], APPNAME, false, testApiKey)
      expect(output).toContain('Invalid API key or insufficient permissions.')
    }
    finally {
      await supabase.from('apikeys')
        .delete()
        .eq('key', testApiKey)
        .throwOnError()
    }
  })

  it.concurrent('should fail upload when using read-only API key with app limitation', async () => {
    const { APPNAME } = await prepareApp()
    const semver = getSemver()
    const testApiKey = randomUUID()
    const testUserId = USER_ID
    const supabase = getSupabaseClient()

    try {
      await supabase.from('apikeys')
        .insert({
          key: testApiKey,
          user_id: testUserId,
          mode: 'read',
          name: 'test',
          limited_to_apps: [APPNAME],
        })
        .throwOnError()

      const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], APPNAME, false, testApiKey)
      expect(output).toContain('Invalid API key or insufficient permissions.')
    }
    finally {
      await supabase.from('apikeys')
        .delete()
        .eq('key', testApiKey)
        .throwOnError()
    }
  })
})
