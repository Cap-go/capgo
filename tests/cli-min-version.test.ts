import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { cleanupCli, getSemver, prepareCli, runCli } from './cli-utils'
import { getSupabaseClient, resetAndSeedAppData } from './test-utils'

describe('tests min version', () => {
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
  cleanupCli(id)
})
