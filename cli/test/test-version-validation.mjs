#!/usr/bin/env node
/**
 * Test that version validation works correctly for edge cases
 * Specifically test that "1.5.00" and similar malformed versions are rejected
 */

import { canParse, parse } from '@std/semver'

console.log('🧪 Testing version validation edge cases...\n')

// Test cases that should FAIL validation
const shouldFail = [
  '1.5.00',    // Leading zero in patch
  '1.05.0',    // Leading zero in minor
  '01.5.0',    // Leading zero in major
  '1.5.00-alpha', // Leading zero in patch with prerelease
  '1.00.00',   // Multiple leading zeros
  '1.5.0.0',   // Too many version parts
  '1.5',       // Too few version parts
  '1',         // Only major version
]

// Test cases that should PASS validation
const shouldPass = [
  '1.5.0',     // Normal version
  '1.0.0',     // Zeros are OK when not leading
  '0.0.0',     // All zeros is OK
  '1.5.10',    // 10 is OK (not a leading zero)
  '1.5.0-alpha', // Prerelease is OK
  '1.5.0+build', // Build metadata is OK
]

let passed = 0
let failed = 0

console.log('1️⃣  Testing versions that SHOULD FAIL...')
for (const version of shouldFail) {
  const isValid = canParse(version)
  if (!isValid) {
    console.log(`   ✓ "${version}" correctly rejected`)
    passed++
  } else {
    console.error(`   ❌ "${version}" should be INVALID but was accepted`)
    try {
      const parsed = parse(version)
      console.error(`      Parsed as: ${JSON.stringify(parsed)}`)
    } catch (e) {
      // ignore
    }
    failed++
  }
}

console.log('\n2️⃣  Testing versions that SHOULD PASS...')
for (const version of shouldPass) {
  const isValid = canParse(version)
  if (isValid) {
    const parsed = parse(version)
    console.log(`   ✓ "${version}" correctly accepted (parsed as ${parsed.major}.${parsed.minor}.${parsed.patch})`)
    passed++
  } else {
    console.error(`   ❌ "${version}" should be VALID but was rejected`)
    failed++
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`📊 Test Results:`)
console.log(`   ✓ Passed: ${passed}`)
console.log(`   ❌ Failed: ${failed}`)
console.log(`   Total: ${passed + failed}`)
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

if (failed === 0) {
  console.log('\n✅ All version validation tests passed!')
  console.log('\n📋 Summary:')
  console.log('   ✓ Malformed versions (like "1.5.00") are correctly rejected')
  console.log('   ✓ Valid versions are correctly accepted')
  console.log('   ✓ Version parsing follows semver spec')
  process.exit(0)
} else {
  console.error('\n❌ Some tests failed!')
  console.error('   Version validation is not working correctly')
  process.exit(1)
}
