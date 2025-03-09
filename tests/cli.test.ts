import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupCli, getSemver, prepareCli, runCli, tempFileFolder } from './cli-utils'
import { getSupabaseClient, getUpdate, getUpdateBaseData, ORG_ID, resetAndSeedAppData, resetAppData, resetAppDataStats, responseOk } from './test-utils'

describe('tests CLI upload', () => {
  const id = randomUUID()
  const APPNAME = `com.demo.app.cli_${id}`
  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME, id)
  })
  afterAll(async () => {
    await cleanupCli(APPNAME)
    await resetAppData(APPNAME)
    await resetAppDataStats(APPNAME)
  })

  let semver = getSemver()
  it('should upload bundle successfully', async () => {
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'], id, false)
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
      .eq('app_id', APPNAME)
      .single()
      .throwOnError()

    expect(error).toBeNull()
    expect(data?.external_url).toBe('https://example.com')
  })
})
describe('tests CLI upload options in parallel', () => {
  const id_one = randomUUID()
  const APPNAME_one = `com.demo.app.cli_${id_one}`
  const prepareApp = async () => {
    const id = randomUUID()
    const APPNAME = `com.demo.app.cli_${id}`
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME, id)
    return { id, APPNAME }
  }
  const cleanupApp = async (id: string) => {
    await cleanupCli(id)
    await resetAppData(id)
    await resetAppDataStats(id)
  }
  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME_one)
    await prepareCli(APPNAME_one, id_one)
  })
  afterAll(async () => {
    await cleanupApp(APPNAME_one)
  })

  it.concurrent('test code check (missing notifyAppReady)', async () => {
    const { id } = await prepareApp()
    const semver = getSemver()
    writeFileSync(join(tempFileFolder(id), 'dist', 'index.js'), 'import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log("Hello world!!!");')
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], id, false)
    expect(output).toContain('notifyAppReady() is missing in')
    await cleanupApp(id)
  })
  it.concurrent('test --iv-session-key with cloud upload', async () => {
    const semver = getSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--iv-session-key', 'aaa:bbb'], id_one, false)
    expect(output).toContain('You need to provide an external url if you want to use the --iv-session-key option')
  })
  it.concurrent('test --iv-session-key with external upload', async () => {
    const semver = getSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--iv-session-key', 'aaa:bbb', '--external', 'https://example.com'], id_one, false)
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
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--encrypted-checksum', 'aaaa'], id_one, false)
    expect(output).toContain('You need to provide an external url if you want to use the --encrypted-checksum option')
  })
  it.concurrent('test --min-update-version', async () => {
    const semver = getSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--min-update-version', '1.0.0', '--ignore-checksum-check'], id_one, false)
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
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--encrypted-checksum', 'aaaa', '--external', 'https://example.com'], id_one, false)
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
    const { id } = await prepareApp()
    const semver = getSemver()
    rmSync(join(tempFileFolder(id), 'dist', 'index.html'))
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], id, false)
    expect(output).toContain('index.html is missing')
    await cleanupApp(id)
  })
  it.concurrent('test --no-code-check', async () => {
    const { id } = await prepareApp()
    let semver = getSemver()
    rmSync(join(tempFileFolder(id), 'dist', 'index.html'))
    semver = getSemver(semver)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--no-code-check'], id, false)
    expect(output).toContain('Time to share your update to the world')
    await cleanupApp(id)
  })
  it.concurrent('cannot upload with wrong api key', async () => {
    const { id } = await prepareApp()
    const testApiKey = randomUUID()
    const semver = getSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], id, false, testApiKey)
    expect(output).toContain('Invalid API key or insufficient permissions.')
    await cleanupApp(id)
  })

  it.concurrent('should test selectable disallow upload', async () => {
    const { id, APPNAME } = await prepareApp()
    const supabase = getSupabaseClient()
    const semver = getSemver()
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
      await cleanupApp(id)
    }
  })
  it.concurrent('should test upload with organization', async () => {
    const { id } = await prepareApp()
    let semver = getSemver()
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
          .insert({ user_id: testUserId, org_id: ORG_ID, user_right: 'upload' })
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
      await cleanupApp(id)
    }
  })
})
