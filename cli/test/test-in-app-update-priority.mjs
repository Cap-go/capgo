#!/usr/bin/env node
/**
 * Tests for --in-app-update-priority parsing and schema validation.
 *
 * Validates:
 *  - parseInAppUpdatePriority accepts integers in [0, 5]
 *  - parseInAppUpdatePriority rejects out-of-range / non-integer / non-numeric input
 *  - buildCredentialsSchema accepts PLAY_STORE_IN_APP_UPDATE_PRIORITY as string
 *  - buildRequestOptionsSchema coerces inAppUpdatePriority correctly and enforces 0..5 int
 *
 * Imports source .ts files directly — Bun runs them natively.
 */

import { parseInAppUpdatePriority } from '../src/build/credentials.ts'
import { buildCredentialsSchema, buildRequestOptionsSchema } from '../src/schemas/build.ts'

console.log('🧪 Testing --in-app-update-priority parsing and schema validation...\n')

let testsPassed = 0
let testsFailed = 0

async function test(name, fn) {
  try {
    console.log(`\n🔍 ${name}`)
    await fn()
    console.log(`✅ PASSED: ${name}`)
    testsPassed++
  }
  catch (error) {
    console.error(`❌ FAILED: ${name}`)
    console.error(`   Error: ${error.message}`)
    testsFailed++
  }
}

function assert(condition, message) {
  if (!condition)
    throw new Error(message || 'Assertion failed')
}

function assertThrows(fn, expectedFragment) {
  let caught = null
  try { fn() }
  catch (e) { caught = e }
  if (!caught)
    throw new Error('Expected function to throw, but it did not')
  if (expectedFragment && !caught.message.includes(expectedFragment))
    throw new Error(`Expected error message to include "${expectedFragment}", got: ${caught.message}`)
}

await test('parseInAppUpdatePriority accepts each value in 0..5 (number)', () => {
  for (let i = 0; i <= 5; i++)
    assert(parseInAppUpdatePriority(i) === i, `expected ${i}`)
})

await test('parseInAppUpdatePriority accepts string inputs 0..5', () => {
  for (let i = 0; i <= 5; i++)
    assert(parseInAppUpdatePriority(String(i)) === i, `expected ${i} from string`)
})

await test('parseInAppUpdatePriority trims whitespace', () => {
  assert(parseInAppUpdatePriority('  3  ') === 3)
})

await test('parseInAppUpdatePriority rejects -1', () => {
  assertThrows(() => parseInAppUpdatePriority(-1), 'between 0 and 5')
})

await test('parseInAppUpdatePriority rejects 6', () => {
  assertThrows(() => parseInAppUpdatePriority(6), 'between 0 and 5')
})

await test('parseInAppUpdatePriority rejects non-integer 2.5', () => {
  assertThrows(() => parseInAppUpdatePriority(2.5), 'integer')
})

await test('parseInAppUpdatePriority rejects non-numeric strings', () => {
  assertThrows(() => parseInAppUpdatePriority('high'), 'integer')
  assertThrows(() => parseInAppUpdatePriority('3.5'), 'integer')
  assertThrows(() => parseInAppUpdatePriority('abc'), 'integer')
})

await test('buildCredentialsSchema accepts PLAY_STORE_IN_APP_UPDATE_PRIORITY as string', () => {
  const parsed = buildCredentialsSchema.parse({ PLAY_STORE_IN_APP_UPDATE_PRIORITY: '4' })
  assert(parsed.PLAY_STORE_IN_APP_UPDATE_PRIORITY === '4', 'value should round-trip as string')
})

await test('buildCredentialsSchema accepts omission of PLAY_STORE_IN_APP_UPDATE_PRIORITY', () => {
  const parsed = buildCredentialsSchema.parse({})
  assert(parsed.PLAY_STORE_IN_APP_UPDATE_PRIORITY === undefined)
})

await test('buildRequestOptionsSchema coerces inAppUpdatePriority string → integer', () => {
  const ok = buildRequestOptionsSchema.parse({ apikey: 'test', inAppUpdatePriority: '3' })
  assert(ok.inAppUpdatePriority === 3, 'expected coerced number 3')
})

await test('buildRequestOptionsSchema accepts numeric inAppUpdatePriority at boundaries', () => {
  assert(buildRequestOptionsSchema.parse({ apikey: 'test', inAppUpdatePriority: 0 }).inAppUpdatePriority === 0)
  assert(buildRequestOptionsSchema.parse({ apikey: 'test', inAppUpdatePriority: 5 }).inAppUpdatePriority === 5)
})

await test('buildRequestOptionsSchema rejects out-of-range inAppUpdatePriority', () => {
  assertThrows(() => buildRequestOptionsSchema.parse({ apikey: 'test', inAppUpdatePriority: 6 }))
  assertThrows(() => buildRequestOptionsSchema.parse({ apikey: 'test', inAppUpdatePriority: -1 }))
})

await test('buildRequestOptionsSchema rejects non-integer inAppUpdatePriority', () => {
  assertThrows(() => buildRequestOptionsSchema.parse({ apikey: 'test', inAppUpdatePriority: 2.5 }))
})

await test('omitting inAppUpdatePriority is valid', () => {
  const parsed = buildRequestOptionsSchema.parse({ apikey: 'test' })
  assert(parsed.inAppUpdatePriority === undefined)
})

console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed\n`)
if (testsFailed > 0)
  process.exit(1)
