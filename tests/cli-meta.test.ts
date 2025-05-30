import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupCli, getSemver, npmInstall, prepareCli, runCli, setDependencies } from './cli-utils'
import { resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils'

describe('tests CLI metadata', () => {
  const id = randomUUID()
  const APPNAME = `com.cli_meta_${id}`
  const semver = getSemver()

  const assertCompatibilityTableColumns = async (column1: string, column2: string, column3: string, column4: string) => {
    const output = await runCli(['bundle', 'compatibility', '-c', 'production'], APPNAME, false)
    const packageLine = output.split('\n').find(l => l.includes(`│ ${column1}`))
    expect(packageLine).toBeDefined()

    const columns = packageLine!.split('│').slice(2, -1)
    expect(columns.length).toBe(4)
    expect(columns[0]).toContain(column1)
    expect(columns[1]).toContain(column2)
    expect(columns[2]).toContain(column3)
    expect(columns[3]).toContain(column4)
  }

  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME)
  })

  afterAll(async () => {
    await cleanupCli(APPNAME)
    await resetAppData(APPNAME)
    await resetAppDataStats(APPNAME)
  })

  it('should upload initial bundle', async () => {
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'], APPNAME, false)
    expect(output).toContain('Bundle uploaded')
  })

  it('should upload bundle with metadata check ignored', async () => {
    await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], APPNAME)
    await assertCompatibilityTableColumns('@capacitor/android', '7.0.0', '7.0.0', '✅')
  })

  it('should handle matching versions', async () => {
    setDependencies({
      '@capacitor/android': '7.0.0',
    }, APPNAME)
    await assertCompatibilityTableColumns('@capacitor/android', '7.0.0', '7.0.0', '✅')
  })

  it('should handle semver ranges', async () => {
    setDependencies({
      '@capacitor/android': '^7.0.0',
    }, APPNAME)
    await assertCompatibilityTableColumns('@capacitor/android', '7.0.0', '7.0.0', '✅')

    setDependencies({
      '@capacitor/android': '~7.0.0',
    }, APPNAME)
    await assertCompatibilityTableColumns('@capacitor/android', '7.0.0', '7.0.0', '✅')
  })

  it('should handle prerelease versions', async () => {
    setDependencies({
      '@capacitor/android': '7.0.0-beta.1',
    }, APPNAME)
    await assertCompatibilityTableColumns('@capacitor/android', '7.0.0-beta.1', '7.0.0', '❌')
  })

  it('should handle registry prefixes', async () => {
    setDependencies({
      '@capacitor/android': 'jsr:@capacitor/android@7.0.0',
    }, APPNAME)
    await assertCompatibilityTableColumns('@capacitor/android', 'jsr:@capacitor/android@7.0.0', '7.0.0', '❌')

    setDependencies({
      '@capacitor/android': 'npm:@capacitor/android@7.0.0',
    }, APPNAME)
    await assertCompatibilityTableColumns('@capacitor/android', 'npm:@capacitor/android@7.0.0', '7.0.0', '❌')
  })

  it('should handle file and git references', async () => {
    setDependencies({
      '@capacitor/android': 'file:../capacitor-android',
    }, APPNAME)
    await assertCompatibilityTableColumns('@capacitor/android', 'file:../capacitor-android', '7.0.0', '❌')

    setDependencies({
      '@capacitor/android': 'github:capacitorjs/capacitor#main',
    }, APPNAME)
    await assertCompatibilityTableColumns('@capacitor/android', 'github:capacitorjs/capacitor#main', '7.0.0', '❌')

    setDependencies({
      '@capacitor/android': 'git+https://github.com/capacitorjs/capacitor.git#main',
    }, APPNAME)
    await assertCompatibilityTableColumns('@capacitor/android', 'git+https://github.com/capacitorjs/capacitor.git#main', '7.0.0', '❌')
  })

  it('should handle additional local plugins', async () => {
    setDependencies({
      '@capacitor/android': '7.0.0',
      'capacitor-plugin-safe-area': '2.0.0',
    }, APPNAME)
    npmInstall(APPNAME)
    await assertCompatibilityTableColumns('@capacitor/android', '7.0.0', '7.0.0', '✅')
    await assertCompatibilityTableColumns('capacitor-plugin-safe-area', '2.0.0', '', '❌')
  })
})
