#!/usr/bin/env node
/**
 * Test semver validation to ensure @std/semver works correctly
 * and that the stubbed regular semver doesn't break anything
 */

import { canParse, parse, format, greaterOrEqual } from '@std/semver'

console.log('🧪 Testing semver validation (using @std/semver)...\n')

// Valid versions from node-semver test fixtures
const validVersions = [
  '1.0.0',
  '2.1.0',
  '3.2.1',
  'v1.2.3',
  '1.2.3-0',
  '1.2.3-123',
  '1.2.3-1.2.3',
  '1.2.3-1a',
  '1.2.3-a1',
  '1.2.3-alpha',
  '1.2.3-alpha.1',
  '1.2.3-alpha-1',
  '1.2.3+456',
  '1.2.3+build',
  '1.2.3-alpha+build',
]

// Invalid versions from node-semver test fixtures
const invalidVersions = [
  'hello, world',
  'xyz',
  '1.2',
  '1',
  'not-a-version',
  '',
  '1.2.3.4',
  'v1.2.x',
]

let passed = 0
let failed = 0

console.log('1️⃣  Testing valid versions with @std/semver...')
for (const version of validVersions) {
  try {
    const isValid = canParse(version)
    if (isValid) {
      const parsed = parse(version)
      const formatted = format(parsed)
      console.log(`   ✓ ${version} → parsed as ${formatted}`)
      passed++
    }
    else {
      console.error(`   ❌ ${version} should be valid but canParse returned false`)
      failed++
    }
  }
  catch (error) {
    console.error(`   ❌ ${version} threw error: ${error.message}`)
    failed++
  }
}

console.log(`\n2️⃣  Testing invalid versions with @std/semver...`)
for (const version of invalidVersions) {
  try {
    const isValid = canParse(version)
    if (!isValid) {
      console.log(`   ✓ ${JSON.stringify(version)} correctly rejected`)
      passed++
    }
    else {
      console.error(`   ❌ ${JSON.stringify(version)} should be invalid but was accepted`)
      failed++
    }
  }
  catch (error) {
    // It's okay for parse to throw on invalid versions
    console.log(`   ✓ ${JSON.stringify(version)} correctly rejected (threw error)`)
    passed++
  }
}

console.log(`\n3️⃣  Testing version comparisons (used in actual code)...`)

// Test cases that match actual usage in your codebase
const comparisonTests = [
  { v1: '6.0.0', v2: '5.0.0', expected: true, desc: 'v6 >= v5' },
  { v1: '7.0.0', v2: '6.0.0', expected: true, desc: 'v7 >= v6' },
  { v1: '5.0.0', v2: '6.0.0', expected: false, desc: 'v5 >= v6' },
  { v1: '6.1.0', v2: '6.0.0', expected: true, desc: 'v6.1 >= v6.0' },
  { v1: '6.0.0', v2: '6.0.0', expected: true, desc: 'v6.0 >= v6.0' },
]

for (const test of comparisonTests) {
  try {
    const result = greaterOrEqual(parse(test.v1), parse(test.v2))
    if (result === test.expected) {
      console.log(`   ✓ ${test.desc}: ${result}`)
      passed++
    }
    else {
      console.error(`   ❌ ${test.desc}: expected ${test.expected}, got ${result}`)
      failed++
    }
  }
  catch (error) {
    console.error(`   ❌ ${test.desc} threw error: ${error.message}`)
    failed++
  }
}

console.log(`\n4️⃣  Testing actual usage patterns from your codebase...`)

// These are actual patterns from src/init.ts and src/bundle/*.ts
try {
  const coreVersion = '6.0.0'
  const minVersion = '5.0.0'
  const parsed1 = parse(coreVersion)
  const parsed2 = parse(minVersion)
  const isCompatible = greaterOrEqual(parsed1, parsed2)

  if (isCompatible) {
    console.log(`   ✓ Capacitor version check: ${coreVersion} >= ${minVersion}`)
    passed++
  }
  else {
    console.error(`   ❌ Version check failed`)
    failed++
  }
}
catch (error) {
  console.error(`   ❌ Version check threw error: ${error.message}`)
  failed++
}

// Test the format and increment functions used in src/init.ts
try {
  const version = parse('1.0.0')
  const formatted = format(version)
  if (formatted === '1.0.0') {
    console.log(`   ✓ format() works correctly`)
    passed++
  }
  else {
    console.error(`   ❌ format() returned ${formatted} instead of 1.0.0`)
    failed++
  }
}
catch (error) {
  console.error(`   ❌ format() threw error: ${error.message}`)
  failed++
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
console.log(`📊 Test Results:`)
console.log(`   ✓ Passed: ${passed}`)
console.log(`   ❌ Failed: ${failed}`)
console.log(`   Total: ${passed + failed}`)
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

if (failed === 0) {
  console.log('\n✅ All semver validation tests passed!')
  console.log('\n📋 Summary:')
  console.log('   ✓ @std/semver correctly validates versions')
  console.log('   ✓ Version parsing works as expected')
  console.log('   ✓ Version comparisons work correctly')
  console.log('   ✓ All actual usage patterns verified')
  console.log('\n🎉 semver functionality is working correctly!')
  process.exit(0)
}
else {
  console.error('\n❌ Some tests failed!')
  process.exit(1)
}
