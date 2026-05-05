#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

console.log('🧪 Testing bundle integrity...\n')

// Helper to check bundle content
const bundlePath = './dist/index.js'
const sdkPath = './dist/src/sdk.js'

if (!existsSync(bundlePath)) {
  console.error('❌ dist/index.js not found. Run build first.')
  process.exit(1)
}

const bundleContent = readFileSync(bundlePath, 'utf-8')
const sdkContent = existsSync(sdkPath) ? readFileSync(sdkPath, 'utf-8') : null
const metaPath = './meta.json'
const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf-8')) : null

// Test 1: Check if semver package is excluded from bundle (check for semver-specific exports)
console.log('1️⃣  Checking if semver package is excluded from bundle...')
// The full semver package has characteristic exports like SEMVER_SPEC_VERSION
// Our stub doesn't have this - checking that the real semver package isn't bundled
if (bundleContent.includes('SEMVER_SPEC_VERSION') || bundleContent.includes('node_modules/semver')) {
  console.error('❌ Found semver package content in bundle')
  process.exit(1)
}
else {
  console.log('✅ semver package successfully excluded from bundle')
}

// Test 2: Check bundle size
console.log('\n2️⃣  Checking bundle sizes...')
const cliSize = meta?.outputs?.['dist/index.js']?.bytes ?? statSync(bundlePath).size
const sdkSize = existsSync(sdkPath) ? (meta?.outputs?.['dist/src/sdk.js']?.bytes ?? statSync(sdkPath).size) : 0
console.log(`   CLI bundle: ${(cliSize / 1024).toFixed(2)} KB`)
if (sdkSize > 0) {
  console.log(`   SDK bundle: ${(sdkSize / 1024).toFixed(2)} KB`)
  console.log(`   Total: ${((cliSize + sdkSize) / 1024).toFixed(2)} KB`)
}
else {
  console.log(`   Total: ${(cliSize / 1024).toFixed(2)} KB`)
}
console.log('✅ Bundle sizes calculated')

// Test 3: Check if @capacitor/cli is in bundle (by checking for capacitor-specific code)
console.log('\n3️⃣  Checking if @capacitor/cli dependencies are present...')
// Check for capacitor config reading functionality which is core to @capacitor/cli
if (bundleContent.includes('@capacitor/cli') || bundleContent.includes('capacitor.config')) {
  console.log('✅ @capacitor/cli functionality found in bundle')
}
else {
  console.error('❌ @capacitor/cli not found in bundle - this might break functionality')
  process.exit(1)
}

// Test 4: Verify stub-semver namespace is used
console.log('\n4️⃣  Verifying semver stub is in place...')
if (bundleContent.includes('Stub for semver package')) {
  console.log('✅ semver stub found in bundle')
}
else {
  console.warn('⚠️  semver stub comment not found - this is expected if minified')
}

// Test 5: Check for @std/semver (which we DO use)
console.log('\n5️⃣  Checking if @std/semver is present (we use this)...')
// @std/semver has specific function implementations we can check for
if (bundleContent.includes('parseRange') || bundleContent.includes('satisfies')) {
  console.log('✅ @std/semver functionality found in bundle')
}
else {
  console.error('❌ @std/semver not found - this will break version parsing!')
  process.exit(1)
}

// Test 6: Verify only type definitions in dist/src (except sdk.js)
console.log('\n6️⃣  Checking dist/src structure...')
function getJsFiles(dir) {
  const files = []
  if (!existsSync(dir)) return files
  for (const item of readdirSync(dir)) {
    const fullPath = join(dir, item)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...getJsFiles(fullPath))
    }
    else if (item.endsWith('.js') && !item.endsWith('sdk.js')) {
      files.push(fullPath)
    }
  }
  return files
}
const jsFiles = getJsFiles('./dist/src')
if (jsFiles.length > 0) {
  console.warn(`⚠️  Found ${jsFiles.length} unexpected JS files in dist/src:`)
  jsFiles.slice(0, 3).forEach(f => console.warn(`   - ${f}`))
}
else {
  console.log('✅ No unexpected compiled JS files in dist/src')
}

// Test 7: CRITICAL - Check for hardcoded CI build paths (bun/esbuild __dirname issue)
// See: https://github.com/oven-sh/bun/issues/4216
console.log('\n7️⃣  Checking for hardcoded CI build paths (CRITICAL)...')
const ciPathPatterns = [
  /\/home\/runner\/work\//g, // GitHub Actions Linux
  /\/Users\/runner\//g, // GitHub Actions macOS
  /C:\\\\actions-runner\\\\/g, // GitHub Actions Windows
  /\/opt\/actions-runner\//g, // Self-hosted runners
  /\/github\/workspace\//g, // GitHub container actions
]

const checkHardcodedPaths = (label, content) => {
  let found = false
  for (const pattern of ciPathPatterns) {
    const matches = content.match(pattern)
    if (matches) {
      console.error(`❌ CRITICAL: Found hardcoded CI path in ${label}: ${matches[0]}`)
      console.error('   This will cause "ENOENT: no such file or directory" errors for users!')
      console.error('   The __dirname fix in build.mjs is not working correctly.')
      found = true
    }
  }
  return found
}

let foundHardcodedPaths = false
foundHardcodedPaths = checkHardcodedPaths('CLI bundle', bundleContent) || foundHardcodedPaths
if (sdkContent) {
  foundHardcodedPaths = checkHardcodedPaths('SDK bundle', sdkContent) || foundHardcodedPaths
}

if (foundHardcodedPaths) {
  process.exit(1)
}
else {
  console.log('✅ No hardcoded CI paths found in bundles')
}

// Test 8: Verify import.meta.url is used for runtime path resolution
console.log('\n8️⃣  Checking for runtime path resolution (import.meta.url)...')
if (bundleContent.includes('import.meta.url')) {
  console.log('✅ import.meta.url found - paths will be resolved at runtime')
}
else {
  console.error('❌ import.meta.url not found - path resolution may fail')
  console.error('   The fixCapacitorCliDirname plugin should inject this.')
  process.exit(1)
}

console.log('\n✅ All bundle integrity tests passed!')
console.log('\n📊 Summary:')
console.log(`   - semver package: excluded ✓`)
console.log(`   - @std/semver: included ✓`)
console.log(`   - @capacitor/cli: included ✓`)
console.log(`   - Hardcoded paths: none ✓`)
console.log(`   - Runtime resolution: enabled ✓`)
console.log(`   - Bundle size: ${((cliSize + sdkSize) / 1024).toFixed(0)} KB`)
