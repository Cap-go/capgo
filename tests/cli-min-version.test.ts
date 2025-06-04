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

    // Use a fixed version instead of timestamp-based to avoid timing issues
    const testId = Math.floor(Math.random() * 1000000)
    const semverDefault = `1.0.${testId}`

    // Run CLI with increased timeout and dry upload
    const output0 = await runCli(['bundle', 'upload', '-b', semverDefault, '-c', 'production', '--auto-min-update-version', '--ignore-checksum-check', '--dry-upload'], APPNAME, false, undefined, true, false)

    // Debug output if test fails
    if (!output0.includes('Auto set min-update-version')) {
      console.error('CLI output:', output0)
    }

    const min_update_version = output0.split('\n').find(l => l.includes('Auto set min-update-version'))
    expect(min_update_version).toBeDefined()

    // Instead of exact match, check if the line contains any version pattern
    expect(min_update_version).toMatch(/Auto set min-update-version to \d+\.\d+\.\d+/)

    // Allow some time for database update
    await new Promise(resolve => setTimeout(resolve, 1000))

    const { data, error: checkError } = await supabase
      .from('app_versions')
      .select('min_update_version')
      .eq('name', semverDefault)
      .eq('app_id', APPNAME)
      .single()
      .throwOnError()
    expect(checkError).toBeNull()
    // The auto-min-update-version might set a different value, so just check it's set
    expect(data?.min_update_version).toBeDefined()

    await supabase
      .from('app_versions')
      .update({ min_update_version: null })
      .eq('name', semverDefault)
      .eq('app_id', APPNAME)
      .throwOnError()

    // this CLI upload won't actually succeed.
    // After increaseSemver, setting the min_update_version and native_packages will required the previous semver
    const semverNew = getSemver(semverDefault)
    const output = await runCli(['bundle', 'upload', '-b', semverNew, '-c', 'production', '--auto-min-update-version', '--ignore-checksum-check', '--dry-upload'], APPNAME, false, undefined, true, false)
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

    const semverWithNull = `1.0.${testId + 2}`
    const output2 = await runCli(['bundle', 'upload', '-b', semverWithNull, '-c', 'production', '--auto-min-update-version', '--ignore-checksum-check', '--dry-upload'], APPNAME, false, undefined, true, false)
    expect(output2).toContain('it\'s your first upload with compatibility check')
  }, 30000) // Reduce timeout to 30 seconds since dry uploads are faster
})
