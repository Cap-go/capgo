import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupCli, getSemver, prepareCli, runCli, setDependencies } from './cli-utils'
import { resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils'

async function assertCompatibilityTableColumns(appId: string, column1: string, column2: string, column3: string, column4: string) {
  // Use temp app's package.json but main project's node_modules for metadata analysis
  const tempPackageJson = join(process.cwd(), 'temp_cli_test', appId, 'package.json')
  const mainNodeModules = join(process.cwd(), 'node_modules')
  const output = await runCli(['bundle', 'compatibility', '-c', 'production', '--package-json', tempPackageJson, '--node-modules', mainNodeModules], appId, false, undefined, true, false)
  const packageLine = output.split('\n').find(l => l.includes(`│ ${column1}`))
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
    await prepareCli(APPNAME, false, false) // Use main project dependencies instead
  })

  afterAll(async () => {
    await cleanupCli(APPNAME)
    await resetAppData(APPNAME)
    await resetAppDataStats(APPNAME)
  })

  it('should upload bundle with metadata check', async () => {
    const testSemver = getSemver()
    // First upload a bundle WITH metadata to establish baseline
    const tempPackageJson = join(process.cwd(), 'temp_cli_test', APPNAME, 'package.json')
    const mainNodeModules = join(process.cwd(), 'node_modules')
    await runCli(['bundle', 'upload', '-b', testSemver, '-c', 'production', '--ignore-checksum-check', '--package-json', tempPackageJson, '--node-modules', mainNodeModules], APPNAME, false, undefined, true, false)
    
    // Now compatibility check should show remote versions from the uploaded bundle
    await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '7.0.0', '7.0.0', '✅')
  })

  describe('version compatibility tests', () => {
    it('should handle matching versions', async () => {
      setDependencies({ '@capacitor/android': '7.0.0' }, APPNAME)
      // With matching versions, should be compatible
      await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '7.0.0', '7.0.0', '✅')
    })

    it('should handle semver caret ranges', async () => {
      setDependencies({ '@capacitor/android': '^7.0.0' }, APPNAME)
      // CLI resolves semver ranges and should be compatible with 7.0.0
      await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '7.0.0', '7.0.0', '✅')
    })

    it('should handle semver tilde ranges', async () => {
      setDependencies({ '@capacitor/android': '~7.0.0' }, APPNAME)
      // CLI resolves semver ranges and should be compatible with 7.0.0
      await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '7.0.0', '7.0.0', '✅')
    })

    it('should handle version mismatches as incompatible', async () => {
      setDependencies({ '@capacitor/android': '6.0.0' }, APPNAME)
      // Different major version should be incompatible
      await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '6.0.0', '7.0.0', '❌')
    })
  })

  // Sequential tests that modify package.json and test invalid scenarios  
  it('should handle registry prefixes as incompatible', async () => {
    setDependencies({
      '@capacitor/android': 'npm:@capacitor/android@7.0.0',
    }, APPNAME)
    // Non-standard version formats should be incompatible even with matching remote version
    await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', 'npm:@capacitor/android@7.0.0', '7.0.0', '❌')
  })

  it('should handle file references as incompatible', async () => {
    setDependencies({
      '@capacitor/android': 'file:../capacitor-android',
    }, APPNAME)
    // File references should be incompatible
    await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', 'file:../capacitor-android', '7.0.0', '❌')
  })

  it('should handle git references as incompatible', async () => {
    setDependencies({
      '@capacitor/android': 'github:capacitorjs/capacitor#main',
    }, APPNAME)
    // Git references should be incompatible 
    await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', 'github:capacitorjs/capacitor#main', '7.0.0', '❌')
  })

  it('should handle additional local plugins', async () => {
    // Only set dependencies that exist in the main project to avoid missing dependency errors
    setDependencies({
      '@capacitor/android': '7.0.0',
      '@capgo/capacitor-updater': '7.0.38',
    }, APPNAME)
    
    // Check that both dependencies show up in the compatibility table with remote versions
    await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '7.0.0', '7.0.0', '✅')
    await assertCompatibilityTableColumns(APPNAME, '@capgo/capacitor-updater', '7.0.38', '7.0.38', '✅')
  })
})
