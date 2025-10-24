import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_PACKAGE_JSON, cleanupCli, getSemver, prepareCli, runCli, setDependencies, tempFileFolder } from './cli-utils'
import { resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils'

async function assertCompatibilityTableColumns(appId: string, column1: string, column2: string, column3: string, column4: string, customPackageJsonPath?: string) {
  // Use custom package.json if provided, otherwise use temp app's package.json
  const tempPackageJson = customPackageJsonPath || join(process.cwd(), 'temp_cli_test', appId, 'package.json')
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

async function createCustomPackageJson(appId: string, testName: string, dependencies: Record<string, string>): Promise<string> {
  const customPath = join(tempFileFolder(appId), `package-${testName}.json`)
  const packageContent = BASE_PACKAGE_JSON
    .replace('%APPID%', appId)
    .replace('%DEPENDENCIES%', JSON.stringify(dependencies, null, 2))
  await writeFile(customPath, packageContent)
  return customPath
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

  // All tests now run concurrently, each with its own package.json file
  // They all reference the same uploaded baseline for compatibility comparison
  describe.concurrent('version compatibility tests', () => {
    it.concurrent('should handle matching versions', async () => {
      const customPkgPath = await createCustomPackageJson(APPNAME, 'matching', { '@capacitor/android': '7.0.0' })
      // With matching versions, should be compatible
      await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '7.0.0', '7.0.0', '✅', customPkgPath)
    })

    it.concurrent('should handle semver caret ranges', async () => {
      const customPkgPath = await createCustomPackageJson(APPNAME, 'caret', { '@capacitor/android': '^7.0.0' })
      // CLI resolves semver ranges and should be compatible with 7.0.0
      await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '7.0.0', '7.0.0', '✅', customPkgPath)
    })

    it.concurrent('should handle semver tilde ranges', async () => {
      const customPkgPath = await createCustomPackageJson(APPNAME, 'tilde', { '@capacitor/android': '~7.0.0' })
      // CLI resolves semver ranges and should be compatible with 7.0.0
      await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '7.0.0', '7.0.0', '✅', customPkgPath)
    })

    it.concurrent('should handle version mismatches as incompatible', async () => {
      const customPkgPath = await createCustomPackageJson(APPNAME, 'mismatch', { '@capacitor/android': '6.0.0' })
      // Different major version should be incompatible
      await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '6.0.0', '7.0.0', '❌', customPkgPath)
    })

    it.concurrent('should handle registry prefixes as incompatible', async () => {
      const customPkgPath = await createCustomPackageJson(APPNAME, 'registry', {
        '@capacitor/android': 'npm:@capacitor/android@7.0.0',
      })
      // Non-standard version formats should be incompatible even with matching remote version
      await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', 'npm:@capacitor/android@7.0.0', '7.0.0', '❌', customPkgPath)
    })

    it.concurrent('should handle file references as incompatible', async () => {
      const customPkgPath = await createCustomPackageJson(APPNAME, 'file', {
        '@capacitor/android': 'file:../capacitor-android',
      })
      // File references should be incompatible
      await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', 'file:../capacitor-android', '7.0.0', '❌', customPkgPath)
    })

    it.concurrent('should handle git references as incompatible', async () => {
      const customPkgPath = await createCustomPackageJson(APPNAME, 'git', {
        '@capacitor/android': 'github:capacitorjs/capacitor#main',
      })
      // Git references should be incompatible
      await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', 'github:capacitorjs/capacitor#main', '7.0.0', '❌', customPkgPath)
    })

    it.concurrent('should handle additional local plugins', async () => {
      const customPkgPath = await createCustomPackageJson(APPNAME, 'plugins', {
        '@capacitor/android': '7.0.0',
        '@capgo/capacitor-updater': '7.0.38',
      })
      // Check that both dependencies show up in the compatibility table with remote versions
      await assertCompatibilityTableColumns(APPNAME, '@capacitor/android', '7.0.0', '7.0.0', '✅', customPkgPath)
      await assertCompatibilityTableColumns(APPNAME, '@capgo/capacitor-updater', '7.0.38', '7.0.38', '✅', customPkgPath)
    })
  })
})
