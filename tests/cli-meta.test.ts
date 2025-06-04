import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupCli, getSemver, npmInstall, prepareCli, runCli, setDependencies } from './cli-utils'
import { resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils'

async function assertCompatibilityTableColumns(appId: string, column1: string, column2: string, column3: string, column4: string) {
  const output = await runCli(['bundle', 'compatibility', '-c', 'production'], appId, false, undefined, true, false)
  const packageLine = output.split('\n').find(l => l.includes(`│ ${column1}`))
  // console.log('packageLine', packageLine)
  expect(packageLine).toBeDefined()

  const columns = packageLine!.split('│').slice(2, -1)
  expect(columns.length).toBe(4)
  expect(columns[0]).toContain(column1)
  expect(columns[1]).toContain(column2)
  expect(columns[2]).toContain(column3)
  expect(columns[3]).toContain(column4)
}

describe('tests CLI metadata', () => {
  const id = randomUUID()
  const APPNAME = `com.cli_meta_${id}`

  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME)
  })

  afterAll(async () => {
    await cleanupCli(APPNAME)
    await resetAppData(APPNAME)
    await resetAppDataStats(APPNAME)
  })

  it('should upload bundle with metadata check ignored', async () => {
    const testSemver = getSemver()
    await runCli(['bundle', 'upload', '-b', testSemver, '-c', 'production', '--dry-upload', '--ignore-checksum-check'], APPNAME, false, undefined, true, false)
    await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '7.0.0', '7.0.0', '✅')
  })

  describe.concurrent('version compatibility tests', () => {
    it.concurrent('should handle matching versions', async () => {
      setDependencies({
        '@capacitor/android': '7.0.0',
      }, APPNAME)
      await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '7.0.0', '7.0.0', '✅')
    })

    it.concurrent('should handle semver caret ranges', async () => {
      setDependencies({
        '@capacitor/android': '^7.0.0',
      }, APPNAME)
      await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '7.0.0', '7.0.0', '✅')
    })

    it.concurrent('should handle semver tilde ranges', async () => {
      setDependencies({
        '@capacitor/android': '~7.0.0',
      }, APPNAME)
      await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '7.0.0', '7.0.0', '✅')
    })
  })

  // Sequential tests that modify package.json and test invalid scenarios
  it('should handle registry prefixes as incompatible', async () => {
    setDependencies({
      '@capacitor/android': 'npm:@capacitor/android@7.0.0',
    }, APPNAME)
    // Don't install since these are expected to fail
    await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', 'npm:@capacitor/android@7.0.0', '7.0.0', '❌')
  })

  it('should handle file references as incompatible', async () => {
    setDependencies({
      '@capacitor/android': 'file:../capacitor-android',
    }, APPNAME)
    await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', 'file:../capacitor-android', '7.0.0', '❌')
  })

  it('should handle git references as incompatible', async () => {
    setDependencies({
      '@capacitor/android': 'github:capacitorjs/capacitor#main',
    }, APPNAME)
    await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', 'github:capacitorjs/capacitor#main', '7.0.0', '❌')
  })

  it('should handle additional local plugins', async () => {
    setDependencies({
      '@capacitor/android': '7.0.0',
      'capacitor-plugin-safe-area': '2.0.0',
    }, APPNAME)
    await npmInstall(APPNAME)
    await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '7.0.0', '7.0.0', '✅')
    await assertCompatibilityTableColumns(APPNAME, 'capacitor-plugin-safe-area', '2.0.0', '', '❌')
  })
})
