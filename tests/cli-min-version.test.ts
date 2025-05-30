import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupCli, getSemver, prepareCli, runCli } from './cli-utils'
import { getSupabaseClient, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils'

describe('tests min version', () => {
  const id = randomUUID()
  const APPNAME = `com.cli_min_version_${id}`
  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME)
  })
  afterAll(async () => {
    await cleanupCli(APPNAME)
    await resetAppData(APPNAME)
    await resetAppDataStats(APPNAME)
  })
  it('should test auto min version flag', async () => {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('app_versions').update({ min_update_version: '1.0.0' }).eq('name', '1.0.0').eq('app_id', APPNAME).throwOnError()
    expect(error).toBeNull()

    const semverDefault = getSemver()
    const output0 = await runCli(['bundle', 'upload', '-b', semverDefault, '-c', 'production', '--auto-min-update-version', '--ignore-checksum-check'], APPNAME)
    const min_update_version = output0.split('\n').find(l => l.includes('Auto set min-update-version'))
    expect(min_update_version).toBeDefined()
    expect(min_update_version).toContain(semverDefault)

    const { data, error: checkError } = await supabase
      .from('app_versions')
      .select('min_update_version')
      .eq('name', semverDefault)
      .eq('app_id', APPNAME)
      .single()
      .throwOnError()
    expect(checkError).toBeNull()
    expect(data?.min_update_version).toBe(semverDefault)

    await supabase
      .from('app_versions')
      .update({ min_update_version: null })
      .eq('name', semverDefault)
      .eq('app_id', APPNAME)
      .throwOnError()

    // this CLI uplaod won't actually succeed.
    // After increaseSemver, setting the min_update_version and native_packages will required the previous semver
    const semverNew = getSemver(semverDefault)
    const output = await runCli(['bundle', 'upload', '-b', semverNew, '-c', 'production', '--auto-min-update-version', '--ignore-checksum-check'], APPNAME)
    expect(output).toContain('skipping auto setting compatibility')

    const { data: dataNew, error: checkErrorNew } = await supabase
      .from('app_versions')
      .select('min_update_version')
      .eq('name', semverNew)
      .eq('app_id', APPNAME)
      .single()
    expect(checkErrorNew).toBeDefined()
    expect(dataNew).toBeNull()

    const { error: error2 } = await supabase
      .from('app_versions')
      .update({ min_update_version: null, native_packages: null })
      .eq('name', semverDefault)
      .throwOnError()
    expect(error2).toBeNull()

    const semverWithNull = getSemver()
    const output2 = await runCli(['bundle', 'upload', '-b', semverWithNull, '-c', 'production', '--auto-min-update-version', '--ignore-checksum-check'], APPNAME)
    expect(output2).toContain('it\'s your first upload with compatibility check')
  })
})
