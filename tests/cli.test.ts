import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanupCli, getSemver, prepareCli, runCli, setDependencies, tempFileFolder } from './cli-utils'
import { getSupabaseClient, getUpdate, getUpdateBaseData, resetAndSeedAppData, responseOk } from './test-utils'

describe('tests CLI upload', () => {
  const id = randomUUID()
  const APPNAME = `com.demo.app.cli_${id}`
  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME, id)
  })

  let semver = getSemver()
  it('should upload bundle successfully', async () => {
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], id, false)
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
  it('should not upload same twice', async () => {
    semver = getSemver(semver)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], id, false)
    expect(output).toContain('Cannot upload the same bundle content')
  })
  it ('should not upload same hash twice', async () => {
    semver = getSemver(semver)
    await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'], id, false)
    semver = getSemver(semver)

    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'], id, false)
    expect(output).toContain('Cannot upload the same bundle content')
  })
  it ('should upload an external bundle', async () => {
    semver = getSemver(semver)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--external', 'https://example.com'], id, false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .single()
      .throwOnError()

    expect(error).toBeNull()
    expect(data?.external_url).toBe('https://example.com')
  })
  it('test --iv-session-key with cloud upload', async () => {
    semver = getSemver(semver)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--iv-session-key', 'aaa:bbb'], id, false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .single()
      .throwOnError()

    expect(error).toBeNull()
    expect(data?.session_key).toBeNull()
  })
  it('test --iv-session-key with external upload', async () => {
    semver = getSemver(semver)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--iv-session-key', 'aaa:bbb', '--external', 'https://example.com'], id, false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .single()
      .throwOnError()

    expect(error).toBeNull()
    expect(data?.session_key).toBe('aaa:bbb')
  })
  it('test --encrypted-checksum with cloud upload', async () => {
    semver = getSemver(semver)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--encrypted-checksum', 'aaaa'], id, false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .single()
      .throwOnError()

    expect(error).toBeNull()
    expect(data?.checksum).not.toBe('aaaa')
  })
  it('test --min-update-version', async () => {
    semver = getSemver(semver)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--min-update-version', '1.0.0', '--ignore-checksum-check'], id, false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .single()
      .throwOnError()

    expect(error).toBeNull()
    expect(data?.minUpdateVersion).not.toBe('1.0.0')
  })
  it('test --encrypted-checksum with external upload', async () => {
    semver = getSemver(semver)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--encrypted-checksum', 'aaaa', '--external', 'https://example.com'], id, false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .single()
      .throwOnError()

    expect(error).toBeNull()
    expect(data?.checksum).toBe('aaaa')
  })
  it('test code check (missing notifyAppReady)', async () => {
    writeFileSync(join(tempFileFolder(id), 'dist', 'index.js'), 'import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log("Hello world!!!");')
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], id, false)
    expect(output).toContain('notifyAppReady() is missing in')
  })
  cleanupCli(id)
})

describe('tests Code check', () => {
  const id = randomUUID()
  const APPNAME = `com.demo.app.cli_${id}`
  let semver = getSemver()
  beforeEach(async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME, id)
  })
  it('test code check (missing index.html)', async () => {
    rmSync(join(tempFileFolder(id), 'dist', 'index.html'))
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], id, false)
    expect(output).toContain('index.html is missing')
  })
  it('test --no-code-check', async () => {
    rmSync(join(tempFileFolder(id), 'dist', 'index.html'))
    semver = getSemver(semver)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--no-code-check'], id, false)
    expect(output).toContain('Time to share your update to the world')
  })
  cleanupCli(id)
})

describe('tests Wrong cases', () => {
  const id = randomUUID()
  const APPNAME = `com.demo.app.cli_${id}`
  let semver = getSemver()
  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME, id)
  })
  it('cannot upload with wrong api key', async () => {
    const testApiKey = randomUUID()

    semver = getSemver(semver)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], id, false, testApiKey)
    expect(output).toContain('Invalid API key or insufficient permissions.')
  })

  it('should test selectable disallow upload', async () => {
    const supabase = getSupabaseClient()
    semver = getSemver(semver)
    await supabase.from('channels').update({ disable_auto_update: 'version_number' }).eq('name', 'production').eq('app_id', APPNAME).throwOnError()

    // test if is set correctly
    const { data: channel } = await supabase.from('channels').select('*').eq('name', 'production').eq('app_id', APPNAME).single().throwOnError()
    expect(channel?.disable_auto_update).toBe('version_number')

    try {
      const output1 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'], id)
      expect(output1).toContain('to provide a min-update-version')

      const output2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--min-update-version', 'invalid', '--ignore-metadata-check'], id)
      expect(output2).toContain('should follow semver convention')
    }
    finally {
      await supabase.from('channels').update({ disable_auto_update: 'major' }).eq('name', 'production').eq('app_id', APPNAME).throwOnError()
    }
  })
  cleanupCli(id)
})

describe('tests CLI for organization', () => {
  const id = randomUUID()
  const APPNAME = `com.demo.app.cli_${id}`
  let semver = getSemver()
  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME, id)
  })
  it('should test auto min version flag', async () => {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('app_versions').update({ min_update_version: '1.0.0' }).eq('name', '1.0.0').eq('app_id', APPNAME).throwOnError()
    expect(error).toBeNull()
    const uploadWithAutoFlagWithAssert = async (expected: string) => {
      const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--auto-min-update-version', '--ignore-checksum-check'], id)
      const min_update_version = output.split('\n').find(l => l.includes('Auto set min-update-version'))
      expect(min_update_version).toBeDefined()
      expect(min_update_version).toContain(expected)
      return output
    }

    semver = getSemver(semver)
    await uploadWithAutoFlagWithAssert(semver)

    const expected = semver
    semver = getSemver(semver)
    await uploadWithAutoFlagWithAssert(expected)
    await supabase
      .from('app_versions')
      .update({ min_update_version: null })
      .eq('name', semver)
      .throwOnError()

    // this CLI uplaod won't actually succeed.
    // After increaseSemver, setting the min_update_version and native_packages will required the previous semver
    const prevSemver = semver
    semver = getSemver(semver)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--auto-min-update-version', '--ignore-checksum-check'], id)
    expect(output).toContain('skipping auto setting compatibility')

    const { error: error2 } = await supabase
      .from('app_versions')
      .update({ min_update_version: null, native_packages: null })
      .eq('name', prevSemver)
      .throwOnError()
    expect(error2).toBeNull()

    semver = getSemver(semver)
    const output2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--auto-min-update-version', '--ignore-checksum-check'], id)
    expect(output2).toContain('it\'s your first upload with compatibility check')
  })

  it('should test upload with organization', async () => {
    const testApiKey = randomUUID()
    const testUserId = '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5'
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
          .insert({ user_id: testUserId, org_id: '046a36ac-e03c-4590-9257-bd6c9dba9ee8', user_right: 'upload' })
          .throwOnError()

        try {
          semver = getSemver(semver)
          const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--ignore-checksum-check'], id, false, testApiKey)
          expect(output).toContain('Bundle uploaded')
        }
        finally {
          await supabase.from('org_users')
            .delete()
            .eq('user_id', testUserId)
            .eq('org_id', '046a36ac-e03c-4590-9257-bd6c9dba9ee8')
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
  cleanupCli(id)
})

describe('tests CLI metadata', () => {
  const id = randomUUID()
  const APPNAME = `com.demo.app.cli_${id}`
  const semver = getSemver()
  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME, id)
  })
  it('should test compatibility table', async () => {
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'], id, false)
    expect(output).toContain('Bundle uploaded')

    const assertCompatibilityTableColumns = async (column1: string, column2: string, column3: string, column4: string) => {
      const output = await runCli(['bundle', 'compatibility', '-c', 'production'], id)
      const androidPackage = output.split('\n').find(l => l.includes('@capacitor/android'))
      expect(androidPackage).toBeDefined()

      const columns = androidPackage!.split('│').slice(2, -1)
      expect(columns.length).toBe(4)
      expect(columns[0]).toContain(column1)
      expect(columns[1]).toContain(column2)
      expect(columns[2]).toContain(column3)
      expect(columns[3]).toContain(column4)
    }

    // await assertCompatibilityTableColumns('@capacitor/android', '6.0.0', 'None', '❌')

    // semver = getSemver()
    await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], id)

    await assertCompatibilityTableColumns('@capacitor/android', '6.0.0', '6.0.0', '✅')

    setDependencies({}, id, APPNAME)

    // well, the local version doesn't exist, so I expect an empty string ???
    await assertCompatibilityTableColumns('@capacitor/android', '', '6.0.0', '❌')
  })
  cleanupCli(id)
})
