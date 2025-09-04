import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupCli, getSemver, prepareCli, runCli } from './cli-utils'
import { resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils'

describe('tests CLI old checksum', () => {
  const id = randomUUID()
  const APPNAME = `com.cli_old_checksum_${id}`
  let semver = getSemver()

  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME, true)
  })
  afterAll(async () => {
    await cleanupCli(APPNAME)
    await resetAppData(APPNAME)
    await resetAppDataStats(APPNAME)
  })

  it('test upload bundle with auto encryption ', async () => {
    semver = getSemver(semver)
    const output2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--ignore-checksum-check'], APPNAME, false)
    expect(output2).toContain('Time to share your update to the world')
    expect(output2).toContain('Checksum')

    const checksum = output2.split('\n').find(line => line.includes('Checksum'))?.split(' ').at(-1) as string
    expect(checksum).toBeDefined()
    expect(checksum?.length).toBe(8)
  })
})
