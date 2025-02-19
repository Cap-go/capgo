import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { cleanupCli, getSemver, prepareCli, runCli, setDependencies } from './cli-utils'
import { resetAndSeedAppData } from './test-utils'

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

    // await assertCompatibilityTableColumns('@capacitor/android', '7.0.0', 'None', '❌')

    // semver = getSemver()
    await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], id)

    await assertCompatibilityTableColumns('@capacitor/android', '7.0.0', '7.0.0', '✅')

    setDependencies({
      '@capacitor/android': '7.0.0',
    }, id, APPNAME)
    await assertCompatibilityTableColumns('@capacitor/android', '7.0.0', '^7.0.0', '✅')

    setDependencies({}, id, APPNAME)

    // well, the local version doesn't exist, so I expect an empty string ???
    await assertCompatibilityTableColumns('@capacitor/android', '', '7.0.0', '❌')
  })
  cleanupCli(id)
})
