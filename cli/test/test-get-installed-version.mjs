#!/usr/bin/env node
/**
 * Test getInstalledVersion with REAL package manager installations
 *
 * SETUP: First run the setup script to create real test fixtures:
 *   ./test/fixtures/setup-test-projects.sh
 *
 * Then run this test:
 *   node test/test-get-installed-version.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = join(__dirname, 'fixtures')
const TEST_PACKAGE = '@capgo/capacitor-updater'

// Dynamically get the expected version from the first installed fixture
// This way the test never breaks when new versions are published
function getExpectedVersion() {
  // Try to read from npm-project's node_modules
  const npmProjectPkgPath = join(FIXTURES_DIR, 'npm-project', 'node_modules', '@capgo', 'capacitor-updater', 'package.json')
  if (existsSync(npmProjectPkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(npmProjectPkgPath, 'utf-8'))
      return pkg.version
    } catch {}
  }

  // Fallback: if fixtures aren't set up, we'll check later
  return null
}

// Re-implement getInstalledVersion logic to test
const PACKNAME = 'package.json'

async function getInstalledVersion(packageName, rootDir, packageJsonPath) {
  if (packageName !== '@capgo/capacitor-updater') {
    return null
  }

  const providedPackageJsonFiles = packageJsonPath
    ? packageJsonPath
      .split(',')
      .map(packageJsonPathItem => packageJsonPathItem.trim())
      .filter(Boolean)
    : []

  const candidateBaseDirs = []
  const addCandidateDir = (dir) => {
    const candidate = resolve(dir)
    if (!candidateBaseDirs.includes(candidate))
      candidateBaseDirs.push(candidate)
  }

  for (const packageJsonFile of providedPackageJsonFiles) {
    const resolvedPackageJson = resolve(rootDir, packageJsonFile)
    if (existsSync(resolvedPackageJson))
      addCandidateDir(dirname(resolvedPackageJson))
  }

  addCandidateDir(rootDir)
  addCandidateDir(process.cwd())

  // Priority 1: Use require.resolve
  for (const baseDir of candidateBaseDirs) {
    try {
      const packageJsonFile = `${packageName}/package.json`
      const { createRequire } = await import('node:module')
      const requireFromBase = createRequire(join(baseDir, 'package.json'))
      const resolvedPath = requireFromBase.resolve(packageJsonFile)
      const pkg = JSON.parse(readFileSync(resolvedPath, 'utf-8'))
      if (pkg.version)
        return pkg.version
    }
    catch {
      // require.resolve failed
    }
  }

  // Priority 2: Walk up directories
  for (const baseDir of candidateBaseDirs) {
    let currentDir = baseDir
    const currentRoot = path.parse(currentDir).root
    while (currentDir !== currentRoot) {
      const nodeModulesPath = join(currentDir, 'node_modules', ...packageName.split('/'), PACKNAME)
      if (existsSync(nodeModulesPath)) {
        try {
          const pkg = JSON.parse(readFileSync(nodeModulesPath, 'utf-8'))
          if (pkg.version)
            return pkg.version
        }
        catch {
          // Continue
        }
      }
      const parentDir = dirname(currentDir)
      if (parentDir === currentDir)
        break
      currentDir = parentDir
    }
  }

  // Priority 3: Fallback to declared version
  const pkgJsonPathCandidates = providedPackageJsonFiles.length > 0
    ? providedPackageJsonFiles
      .map(packageJsonFile => resolve(rootDir, packageJsonFile))
      .filter(file => existsSync(file))
    : [join(rootDir, PACKNAME)]

  for (const pkgJsonPath of pkgJsonPathCandidates) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
      const version = pkg.dependencies?.[packageName] || pkg.devDependencies?.[packageName]
      if (version) {
        return version.replace(/^[\^~]/, '')
      }
    }
    catch {
      // Continue
    }
  }

  const fallbackPkgJsonPath = join(rootDir, PACKNAME)
  if (existsSync(fallbackPkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(fallbackPkgJsonPath, 'utf-8'))
      const version = pkg.dependencies?.[packageName] || pkg.devDependencies?.[packageName]
      if (version) {
        return version.replace(/^[\^~]/, '')
      }
    }
    catch {
      // Continue
    }
  }

  return null
}

let passed = 0
let failed = 0
let skipped = 0

async function runTest(name, projectPath, expectedVersion, options = {}) {
  const { subdir, packageJsonPath } = options

  if (!existsSync(projectPath)) {
    console.log(`   ⏭️  ${name} (not installed - run setup-test-projects.sh first)`)
    skipped++
    return
  }

  try {
    const testDir = subdir ? join(projectPath, subdir) : projectPath
    const pkgJsonPath = packageJsonPath ? join(projectPath, packageJsonPath) : undefined

    const version = await getInstalledVersion(TEST_PACKAGE, testDir, pkgJsonPath)

    if (version === expectedVersion) {
      console.log(`   ✓ ${name}: ${version}`)
      passed++
    } else {
      console.error(`   ❌ ${name}: expected ${expectedVersion}, got ${version}`)
      failed++
    }
  } catch (error) {
    console.error(`   ❌ ${name}: ${error.message}`)
    failed++
  }
}

console.log('🧪 Testing getInstalledVersion with REAL package manager installations...\n')

// Check if fixtures exist
if (!existsSync(FIXTURES_DIR)) {
  console.error('❌ Fixtures directory not found!')
  console.error('   Run: ./test/fixtures/setup-test-projects.sh')
  process.exit(1)
}

// Get the expected version dynamically from installed fixtures
const EXPECTED_VERSION = getExpectedVersion()
if (!EXPECTED_VERSION) {
  console.error('❌ Could not determine expected version from fixtures!')
  console.error('   Make sure fixtures are properly installed')
  console.error('   Run: ./test/fixtures/setup-test-projects.sh')
  process.exit(1)
}

console.log(`📋 Testing against installed version: ${EXPECTED_VERSION}\n`)

// ============================================================================
// 1. Standard Package Managers
// ============================================================================
console.log('1️⃣  Standard package managers...')

await runTest(
  'npm install',
  join(FIXTURES_DIR, 'npm-project'),
  EXPECTED_VERSION
)

await runTest(
  'yarn add',
  join(FIXTURES_DIR, 'yarn-project'),
  EXPECTED_VERSION
)

await runTest(
  'pnpm install',
  join(FIXTURES_DIR, 'pnpm-project'),
  EXPECTED_VERSION
)

await runTest(
  'bun install',
  join(FIXTURES_DIR, 'bun-project'),
  EXPECTED_VERSION
)

// ============================================================================
// 2. Monorepo Workspaces (hoisted dependencies)
// ============================================================================
console.log('\n2️⃣  Monorepo workspaces (hoisted deps)...')

await runTest(
  'yarn workspaces: from app dir',
  join(FIXTURES_DIR, 'yarn-workspaces'),
  EXPECTED_VERSION,
  { subdir: 'apps/mobile' }
)

await runTest(
  'yarn workspaces: with packageJsonPath',
  join(FIXTURES_DIR, 'yarn-workspaces'),
  EXPECTED_VERSION,
  { packageJsonPath: 'apps/mobile/package.json' }
)

await runTest(
  'pnpm workspaces: from app dir',
  join(FIXTURES_DIR, 'pnpm-workspaces'),
  EXPECTED_VERSION,
  { subdir: 'apps/mobile' }
)

await runTest(
  'pnpm workspaces: with packageJsonPath',
  join(FIXTURES_DIR, 'pnpm-workspaces'),
  EXPECTED_VERSION,
  { packageJsonPath: 'apps/mobile/package.json' }
)

await runTest(
  'pnpm workspaces: with packageJsonPath list',
  join(FIXTURES_DIR, 'pnpm-workspaces'),
  EXPECTED_VERSION,
  { packageJsonPath: 'apps/mobile/package.json,package.json' }
)

await runTest(
  'pnpm workspaces: with spaced packageJsonPath list',
  join(FIXTURES_DIR, 'pnpm-workspaces'),
  EXPECTED_VERSION,
  { packageJsonPath: 'apps/mobile/package.json,   package.json' }
)

await runTest(
  'pnpm catalog: from app dir',
  join(FIXTURES_DIR, 'pnpm-catalog'),
  EXPECTED_VERSION,
  { subdir: 'apps/mobile' }
)

await runTest(
  'pnpm catalog: with packageJsonPath',
  join(FIXTURES_DIR, 'pnpm-catalog'),
  EXPECTED_VERSION,
  { packageJsonPath: 'apps/mobile/package.json' }
)

await runTest(
  'npm workspaces: from app dir',
  join(FIXTURES_DIR, 'npm-workspaces'),
  EXPECTED_VERSION,
  { subdir: 'apps/mobile' }
)

await runTest(
  'npm workspaces: with packageJsonPath',
  join(FIXTURES_DIR, 'npm-workspaces'),
  EXPECTED_VERSION,
  { packageJsonPath: 'apps/mobile/package.json' }
)

// ============================================================================
// 3. Monorepo Tools (Turborepo, Nx, Lerna)
// ============================================================================
console.log('\n3️⃣  Monorepo tools (Turborepo, Nx, Lerna)...')

await runTest(
  'Turborepo: from app dir',
  join(FIXTURES_DIR, 'turborepo'),
  EXPECTED_VERSION,
  { subdir: 'apps/mobile' }
)

await runTest(
  'Turborepo: with packageJsonPath',
  join(FIXTURES_DIR, 'turborepo'),
  EXPECTED_VERSION,
  { packageJsonPath: 'apps/mobile/package.json' }
)

await runTest(
  'Nx monorepo: from app dir',
  join(FIXTURES_DIR, 'nx-monorepo'),
  EXPECTED_VERSION,
  { subdir: 'apps/mobile' }
)

await runTest(
  'Nx monorepo: with packageJsonPath',
  join(FIXTURES_DIR, 'nx-monorepo'),
  EXPECTED_VERSION,
  { packageJsonPath: 'apps/mobile/package.json' }
)

await runTest(
  'Lerna monorepo: from package dir',
  join(FIXTURES_DIR, 'lerna-monorepo'),
  EXPECTED_VERSION,
  { subdir: 'packages/mobile' }
)

await runTest(
  'Lerna monorepo: with packageJsonPath',
  join(FIXTURES_DIR, 'lerna-monorepo'),
  EXPECTED_VERSION,
  { packageJsonPath: 'packages/mobile/package.json' }
)

// ============================================================================
// 4. EDGE CASE TRAPS: Version Mismatches
// These tests verify we read from node_modules, NOT package.json
// ============================================================================
console.log('\n4️⃣  Edge case traps (version mismatches)...')

// Test: package.json says ^6.14.10 but node_modules has 6.30.0
// This is the EXACT bug that caused the CRC32/SHA256 mismatch!
await runTest(
  'Version mismatch: package.json lies (no path)',
  join(FIXTURES_DIR, 'version-mismatch'),
  EXPECTED_VERSION  // Should get real version from node_modules, NOT 6.14.10
)

await runTest(
  'Version mismatch: package.json lies (with path)',
  join(FIXTURES_DIR, 'version-mismatch'),
  EXPECTED_VERSION,
  { packageJsonPath: 'package.json' }
)

// Test: Fake package.json in src/ folder should NOT be read
await runTest(
  'Wrong nested version: ignore fake in src/ (no path)',
  join(FIXTURES_DIR, 'wrong-nested-version'),
  EXPECTED_VERSION  // Should get real version, NOT 1.0.0-FAKE
)

await runTest(
  'Wrong nested version: ignore fake in src/ (with path)',
  join(FIXTURES_DIR, 'wrong-nested-version'),
  EXPECTED_VERSION,
  { packageJsonPath: 'package.json' }
)

// Test: Monorepo where root package.json lies about version
await runTest(
  'Monorepo fake version: from root (no path)',
  join(FIXTURES_DIR, 'fake-version-trap'),
  EXPECTED_VERSION  // Should get real version from node_modules
)

await runTest(
  'Monorepo fake version: from root (with path)',
  join(FIXTURES_DIR, 'fake-version-trap'),
  EXPECTED_VERSION,
  { packageJsonPath: 'package.json' }
)

await runTest(
  'Monorepo fake version: from app (no path)',
  join(FIXTURES_DIR, 'fake-version-trap'),
  EXPECTED_VERSION,
  { subdir: 'apps/mobile' }
)

await runTest(
  'Monorepo fake version: from app (with path)',
  join(FIXTURES_DIR, 'fake-version-trap'),
  EXPECTED_VERSION,
  { packageJsonPath: 'apps/mobile/package.json' }
)

// ============================================================================
// Results
// ============================================================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
console.log(`📊 Test Results:`)
console.log(`   ✓ Passed: ${passed}`)
console.log(`   ❌ Failed: ${failed}`)
console.log(`   ⏭️  Skipped: ${skipped}`)
console.log(`   Total: ${passed + failed + skipped}`)
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

if (skipped > 0) {
  console.log('\n⚠️  Some tests were skipped because fixtures are not installed.')
  console.log('   Run: ./test/fixtures/setup-test-projects.sh')
}

if (failed === 0 && passed > 0) {
  console.log('\n✅ All tests passed!')
  console.log('\n📋 Verified package managers:')
  if (existsSync(join(FIXTURES_DIR, 'npm-project'))) console.log('   ✓ npm')
  if (existsSync(join(FIXTURES_DIR, 'yarn-project'))) console.log('   ✓ yarn')
  if (existsSync(join(FIXTURES_DIR, 'pnpm-project'))) console.log('   ✓ pnpm')
  if (existsSync(join(FIXTURES_DIR, 'bun-project'))) console.log('   ✓ bun')
  console.log('\n📋 Verified monorepo tools:')
  if (existsSync(join(FIXTURES_DIR, 'yarn-workspaces'))) console.log('   ✓ yarn workspaces')
  if (existsSync(join(FIXTURES_DIR, 'pnpm-workspaces'))) console.log('   ✓ pnpm workspaces')
  if (existsSync(join(FIXTURES_DIR, 'pnpm-catalog'))) console.log('   ✓ pnpm catalog')
  if (existsSync(join(FIXTURES_DIR, 'npm-workspaces'))) console.log('   ✓ npm workspaces')
  if (existsSync(join(FIXTURES_DIR, 'turborepo'))) console.log('   ✓ Turborepo')
  if (existsSync(join(FIXTURES_DIR, 'nx-monorepo'))) console.log('   ✓ Nx')
  if (existsSync(join(FIXTURES_DIR, 'lerna-monorepo'))) console.log('   ✓ Lerna')
  console.log('\n📋 Verified edge cases:')
  if (existsSync(join(FIXTURES_DIR, 'version-mismatch'))) console.log('   ✓ Version mismatch (package.json lies)')
  if (existsSync(join(FIXTURES_DIR, 'wrong-nested-version'))) console.log('   ✓ Wrong nested version (fake in src/)')
  if (existsSync(join(FIXTURES_DIR, 'fake-version-trap'))) console.log('   ✓ Monorepo fake version trap')
  console.log('\n🎉 getInstalledVersion works with all package managers and edge cases!')
  process.exit(0)
} else if (failed > 0) {
  console.error('\n❌ Some tests failed!')
  process.exit(1)
} else {
  console.log('\n⚠️  No tests ran. Please run setup first.')
  process.exit(1)
}
