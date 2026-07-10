#!/usr/bin/env node
/**
 * Unit tests for Play Developer API helpers.
 * Covers the URL/ID normalizer (no network round-trip).
 */

console.log('🧪 Testing Play API helpers...\n')

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

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed') }
function assertEquals(a, b, msg) { if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`) }

async function importPlay() {
  return await import('../src/build/onboarding/android/play-api.ts')
}

await test('extractDeveloperId accepts a raw numeric ID', async () => {
  const { extractDeveloperId } = await importPlay()
  assertEquals(extractDeveloperId('1234567890123456789'), '1234567890123456789')
  assertEquals(extractDeveloperId('  1234567890123456789  '), '1234567890123456789')
})

await test('extractDeveloperId pulls the ID out of a full Play Console URL', async () => {
  const { extractDeveloperId } = await importPlay()
  const urls = [
    'https://play.google.com/console/u/0/developers/1234567890123456789/api-access',
    'https://play.google.com/console/u/0/developers/1234567890123456789/app-list',
    'https://play.google.com/console/u/0/developers/1234567890123456789',
    'https://play.google.com/console/developers/1234567890123456789/api-access',
    'http://play.google.com/console/u/0/developers/1234567890123456789/',
  ]
  for (const u of urls)
    assertEquals(extractDeveloperId(u), '1234567890123456789', `failed on ${u}`)
})

await test('extractDeveloperId strips wrapping quotes', async () => {
  const { extractDeveloperId } = await importPlay()
  assertEquals(extractDeveloperId('"1234567890123456789"'), '1234567890123456789')
  assertEquals(extractDeveloperId('\'1234567890123456789\''), '1234567890123456789')
  assertEquals(
    extractDeveloperId('"https://play.google.com/console/u/0/developers/1234567890123456789/api-access"'),
    '1234567890123456789',
  )
})

await test('extractDeveloperId returns null on garbage input', async () => {
  const { extractDeveloperId } = await importPlay()
  assertEquals(extractDeveloperId(''), null)
  assertEquals(extractDeveloperId('nope'), null)
  assertEquals(extractDeveloperId('12345'), null) // too short
  assertEquals(extractDeveloperId('https://play.google.com/console/u/0/'), null) // no developers segment
})

await test('extractDeveloperId recovers an ID from a messy paste with other numbers', async () => {
  const { extractDeveloperId } = await importPlay()
  // Path match wins over loose match
  const url = 'https://play.google.com/console/u/0/developers/1234567890123456789/api-access?v=2'
  assertEquals(extractDeveloperId(url), '1234567890123456789')
})

await test('isLikelyDeveloperId matches 10–25 digit numbers', async () => {
  const { isLikelyDeveloperId } = await importPlay()
  assert(isLikelyDeveloperId('1234567890'), '10 digits — min length')
  assert(isLikelyDeveloperId('1234567890123456789'), '19 digits')
  assert(!isLikelyDeveloperId('123456789'), 'too short')
  assert(!isLikelyDeveloperId('12345678901234567890123456'), 'too long')
  assert(!isLikelyDeveloperId('abc1234567890'), 'has letters')
})

console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
