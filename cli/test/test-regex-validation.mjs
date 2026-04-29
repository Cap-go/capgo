#!/usr/bin/env node
/**
 * Test the regexSemver used in upload.ts to check if it properly rejects malformed versions
 */

const regexSemver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*))*))?(?:\+([0-9a-z-]+(?:\.[0-9a-z-]+)*))?$/i

console.log('🧪 Testing regexSemver used in upload.ts...\n')

// Test cases that should FAIL
const shouldFail = [
  '1.5.00',    // Leading zero in patch - MUST FAIL
  '1.05.0',    // Leading zero in minor - MUST FAIL
  '01.5.0',    // Leading zero in major - MUST FAIL
  '1.5.00-alpha', // Leading zero in patch with prerelease - MUST FAIL
  '1.00.00',   // Multiple leading zeros - MUST FAIL
  '1.5.0.0',   // Too many version parts
  '1.5',       // Too few version parts
  '1',         // Only major version
]

// Test cases that should PASS
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

console.log('1️⃣  Testing versions that SHOULD FAIL with regexSemver...')
for (const version of shouldFail) {
  const isValid = regexSemver.test(version)
  if (!isValid) {
    console.log(`   ✓ "${version}" correctly rejected`)
    passed++
  } else {
    console.error(`   ❌ "${version}" should be INVALID but REGEX ACCEPTS IT!`)
    failed++
  }
}

console.log('\n2️⃣  Testing versions that SHOULD PASS with regexSemver...')
for (const version of shouldPass) {
  const isValid = regexSemver.test(version)
  if (isValid) {
    console.log(`   ✓ "${version}" correctly accepted`)
    passed++
  } else {
    console.error(`   ❌ "${version}" should be VALID but regex rejects it`)
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
  console.log('\n✅ regexSemver properly validates versions!')
  process.exit(0)
} else {
  console.error('\n❌ regexSemver HAS BUGS - it allows malformed versions!')
  console.error('\n⚠️  CRITICAL: The upload validation is NOT working correctly!')
  console.error('    Malformed versions like "1.5.00" can be uploaded!')
  process.exit(1)
}
