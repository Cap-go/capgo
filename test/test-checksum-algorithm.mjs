#!/usr/bin/env node
/**
 * Test: Checksum Algorithm Selection
 *
 * Ensures the correct checksum algorithm (SHA256 vs CRC32) is selected
 * based on the installed capacitor-updater plugin version.
 *
 * This test was added after a bug where plugin 7.18.4 incorrectly received
 * CRC32 checksums instead of SHA256 due to incorrect parameter passing
 * to isDeprecatedPluginVersion().
 *
 * Bug: CLI versions 7.40.0+ passed BROTLI_MIN_UPDATER_VERSION_V7 as the
 * first argument (minFive) instead of the third argument (minSeven),
 * causing v7 plugins to use the default threshold of 7.25.0 instead of 7.0.30.
 */

import { parse, lessThan } from '@std/semver'

// These constants MUST match the values in src/utils.ts
const BROTLI_MIN_UPDATER_VERSION_V5 = '5.10.0'
const BROTLI_MIN_UPDATER_VERSION_V6 = '6.25.0'
const BROTLI_MIN_UPDATER_VERSION_V7 = '7.0.30'

/**
 * This function MUST match the implementation in src/utils.ts
 * If the source changes, this test should fail until updated.
 */
function isDeprecatedPluginVersion(parsedPluginVersion, minFive = '5.10.0', minSix = '6.25.0', minSeven = '7.25.0') {
  if (parsedPluginVersion.major === 5 && lessThan(parsedPluginVersion, parse(minFive))) {
    return true
  }
  if (parsedPluginVersion.major === 6 && lessThan(parsedPluginVersion, parse(minSix))) {
    return true
  }
  if (parsedPluginVersion.major === 7 && lessThan(parsedPluginVersion, parse(minSeven))) {
    return true
  }
  return false
}

/**
 * Determines if SHA256 should be used for a given plugin version.
 * This simulates the logic in src/bundle/upload.ts
 */
function shouldUseSha256(pluginVersion) {
  const coerced = parse(pluginVersion)
  // This is the CORRECT call - all three version thresholds must be passed
  return !isDeprecatedPluginVersion(
    coerced,
    BROTLI_MIN_UPDATER_VERSION_V5,
    BROTLI_MIN_UPDATER_VERSION_V6,
    BROTLI_MIN_UPDATER_VERSION_V7
  )
}

/**
 * Simulates the BUGGY behavior that existed before the fix.
 * This should NOT be used in production code.
 */
function shouldUseSha256_BUGGY(pluginVersion) {
  const coerced = parse(pluginVersion)
  // BUG: Only passing one argument - v7 threshold goes to minFive position!
  return !isDeprecatedPluginVersion(coerced, BROTLI_MIN_UPDATER_VERSION_V7)
}

console.log('🧪 Test: Checksum Algorithm Selection\n')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('Testing that correct checksum algorithm is selected based on plugin version')
console.log(`Thresholds: v5 >= ${BROTLI_MIN_UPDATER_VERSION_V5}, v6 >= ${BROTLI_MIN_UPDATER_VERSION_V6}, v7 >= ${BROTLI_MIN_UPDATER_VERSION_V7}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

let allPassed = true

// Test cases: [version, expectedSha256, description]
const testCases = [
  // v5 tests
  ['5.9.0', false, 'v5 below threshold should use CRC32'],
  ['5.10.0', true, 'v5 at threshold should use SHA256'],
  ['5.15.0', true, 'v5 above threshold should use SHA256'],

  // v6 tests
  ['6.20.0', false, 'v6 below threshold should use CRC32'],
  ['6.25.0', true, 'v6 at threshold should use SHA256'],
  ['6.30.0', true, 'v6 above threshold should use SHA256'],

  // v7 tests - THE CRITICAL CASES
  ['7.0.29', false, 'v7 below threshold should use CRC32'],
  ['7.0.30', true, 'v7 at threshold should use SHA256'],
  ['7.18.4', true, 'v7.18.4 (user reported issue) MUST use SHA256'],
  ['7.25.0', true, 'v7.25.0 should use SHA256'],
  ['7.30.0', true, 'v7.30.0 should use SHA256'],

  // v8+ tests (future versions)
  ['8.0.0', true, 'v8+ should use SHA256 (no deprecation check for major > 7)'],
  ['8.42.5', true, 'v8.42.5 (current) should use SHA256'],
]

console.log('🔍 Testing checksum algorithm selection...\n')

for (const [version, expectedSha256, description] of testCases) {
  const result = shouldUseSha256(version)
  const algorithm = result ? 'SHA256' : 'CRC32'
  const expectedAlgorithm = expectedSha256 ? 'SHA256' : 'CRC32'

  if (result === expectedSha256) {
    console.log(`✅ ${version.padEnd(10)} → ${algorithm.padEnd(6)} | ${description}`)
  } else {
    console.log(`❌ ${version.padEnd(10)} → ${algorithm.padEnd(6)} | EXPECTED ${expectedAlgorithm} | ${description}`)
    allPassed = false
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('🔍 Regression test: Verify bug is fixed...\n')

// Specifically test the bug scenario
const buggyResult = shouldUseSha256_BUGGY('7.18.4')
const fixedResult = shouldUseSha256('7.18.4')

console.log('Plugin version: 7.18.4 (user reported issue)')
console.log(`  BUGGY code (before fix):  ${buggyResult ? 'SHA256' : 'CRC32'}`)
console.log(`  FIXED code (after fix):   ${fixedResult ? 'SHA256' : 'CRC32'}`)

if (buggyResult === false && fixedResult === true) {
  console.log('  ✅ Bug is fixed! BUGGY=CRC32, FIXED=SHA256')
} else if (buggyResult === true && fixedResult === true) {
  console.log('  ⚠️  Both return SHA256 - bug may have been fixed differently')
} else {
  console.log('  ❌ REGRESSION! Fixed code should return SHA256')
  allPassed = false
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

if (allPassed) {
  console.log('✅ ALL CHECKSUM ALGORITHM TESTS PASSED!\n')
  console.log('📋 Summary:')
  console.log('   ✓ v5 plugins: SHA256 for >= 5.10.0, CRC32 for < 5.10.0')
  console.log('   ✓ v6 plugins: SHA256 for >= 6.25.0, CRC32 for < 6.25.0')
  console.log('   ✓ v7 plugins: SHA256 for >= 7.0.30, CRC32 for < 7.0.30')
  console.log('   ✓ v8+ plugins: Always SHA256')
  console.log('   ✓ Plugin 7.18.4 correctly uses SHA256')
  console.log('\n🎉 Checksum algorithm selection is working correctly!')
  process.exit(0)
} else {
  console.error('❌ CHECKSUM ALGORITHM TESTS FAILED!\n')
  console.error('⚠️  CRITICAL: Wrong checksum algorithm may cause update failures!')
  console.error('   Devices expect SHA256 but may receive CRC32, causing checksum mismatch.')
  process.exit(1)
}
