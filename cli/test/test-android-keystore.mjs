#!/usr/bin/env node
/**
 * Test suite for Android keystore generation (node-forge PKCS#12).
 * Covers: round-trip verify, wrong-password rejection, validity dates,
 * random password generation, required-field validation.
 */

console.log('🧪 Testing Android keystore generation...\n')

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

function assertEquals(actual, expected, message) {
  if (actual !== expected)
    throw new Error(message || `Expected ${expected}, got ${actual}`)
}

async function importKeystore() {
  return await import('../src/build/onboarding/android/keystore.ts')
}

await test('generateKeystore returns base64 + bytes + alias', async () => {
  const { generateKeystore } = await importKeystore()
  const result = generateKeystore({
    alias: 'release',
    storePassword: 'storepass123',
    keyPassword: 'storepass123',
    dname: { commonName: 'com.example.app', organizationName: 'Capgo' },
    keySize: 2048,
  })
  assert(result.p12Base64.length > 0, 'p12Base64 should not be empty')
  assert(result.p12Bytes.length > 0, 'p12Bytes should not be empty')
  assertEquals(result.alias, 'release')
  // Round-trip is covered by the `tryUnlockPrivateKey` and `listKeystoreAliases` tests below.
})

await test('validity defaults to 27 years', async () => {
  const { generateKeystore } = await importKeystore()
  const before = new Date()
  const result = generateKeystore({
    alias: 'release',
    storePassword: 'pw',
    keyPassword: 'pw',
    dname: { commonName: 'com.example.app' },
  })
  const after = new Date()
  const expectedMin = new Date(before)
  expectedMin.setFullYear(before.getFullYear() + 27)
  const expectedMax = new Date(after)
  expectedMax.setFullYear(after.getFullYear() + 27)
  expectedMax.setSeconds(expectedMax.getSeconds() + 5)
  assert(
    result.notAfter >= expectedMin && result.notAfter <= expectedMax,
    `notAfter out of range: got ${result.notAfter.toISOString()}, expected ~${expectedMin.toISOString()}`,
  )
})

await test('validityYears override works', async () => {
  const { generateKeystore } = await importKeystore()
  const result = generateKeystore({
    alias: 'release',
    storePassword: 'pw',
    keyPassword: 'pw',
    dname: { commonName: 'com.example.app' },
    validityYears: 1,
  })
  const oneYearFromNow = new Date()
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1)
  const diffMs = Math.abs(result.notAfter.getTime() - oneYearFromNow.getTime())
  assert(diffMs < 10_000, `expected ~1 year validity, got diff ${diffMs}ms`)
})

await test('generateRandomPassword returns 32-char base64url', async () => {
  const { generateRandomPassword } = await importKeystore()
  const pw1 = generateRandomPassword()
  const pw2 = generateRandomPassword()
  assertEquals(pw1.length, 32, `expected length 32, got ${pw1.length}`)
  assert(/^[\w-]+$/.test(pw1), 'must be base64url (alphanumeric + - _)')
  assert(pw1 !== pw2, 'two random passwords must differ')
})

await test('missing alias throws', async () => {
  const { generateKeystore } = await importKeystore()
  let threw = false
  try {
    generateKeystore({
      alias: '',
      storePassword: 'pw',
      keyPassword: 'pw',
      dname: { commonName: 'com.example.app' },
    })
  }
  catch (err) {
    threw = true
    assert(err.message.includes('alias'), `expected alias error, got: ${err.message}`)
  }
  assert(threw, 'expected missing alias to throw')
})

await test('missing store password throws', async () => {
  const { generateKeystore } = await importKeystore()
  let threw = false
  try {
    generateKeystore({
      alias: 'release',
      storePassword: '',
      keyPassword: 'pw',
      dname: { commonName: 'com.example.app' },
    })
  }
  catch (err) {
    threw = true
    assert(err.message.toLowerCase().includes('store password'), `expected store password error, got: ${err.message}`)
  }
  assert(threw, 'expected missing store password to throw')
})

await test('missing common name throws', async () => {
  const { generateKeystore } = await importKeystore()
  let threw = false
  try {
    generateKeystore({
      alias: 'release',
      storePassword: 'pw',
      keyPassword: 'pw',
      dname: { commonName: '' },
    })
  }
  catch (err) {
    threw = true
    assert(err.message.toLowerCase().includes('common name'), `expected CN error, got: ${err.message}`)
  }
  assert(threw, 'expected missing common name to throw')
})

await test('listKeystoreAliases returns the alias we wrote', async () => {
  const { generateKeystore, listKeystoreAliases } = await importKeystore()
  const result = generateKeystore({
    alias: 'release',
    storePassword: 'pw',
    keyPassword: 'pw',
    dname: { commonName: 'com.example.app' },
  })
  const listed = listKeystoreAliases(result.p12Bytes, 'pw')
  assert(listed.ok === true, `expected ok, got: ${JSON.stringify(listed)}`)
  assert(listed.aliases.includes('release'), `expected "release" in ${JSON.stringify(listed.aliases)}`)
})

await test('listKeystoreAliases reports wrong-password cleanly', async () => {
  const { generateKeystore, listKeystoreAliases } = await importKeystore()
  const result = generateKeystore({
    alias: 'release',
    storePassword: 'correct',
    keyPassword: 'correct',
    dname: { commonName: 'com.example.app' },
  })
  const listed = listKeystoreAliases(result.p12Bytes, 'wrong')
  assert(listed.ok === false, 'wrong password should not be ok')
  assertEquals(listed.reason, 'wrong-password', `expected wrong-password reason, got ${listed.reason}`)
})

await test('tryUnlockPrivateKey returns ok when same password unlocks both MAC and private key', async () => {
  const { generateKeystore, tryUnlockPrivateKey } = await importKeystore()
  const result = generateKeystore({
    alias: 'release',
    storePassword: 'matching-pw',
    keyPassword: 'matching-pw',
    dname: { commonName: 'com.example.app' },
  })
  const probe = tryUnlockPrivateKey(result.p12Bytes, 'matching-pw')
  assert(probe.ok === true, `expected ok, got: ${JSON.stringify(probe)}`)
})

await test('tryUnlockPrivateKey reports wrong-password when MAC fails', async () => {
  const { generateKeystore, tryUnlockPrivateKey } = await importKeystore()
  const result = generateKeystore({
    alias: 'release',
    storePassword: 'correct',
    keyPassword: 'correct',
    dname: { commonName: 'com.example.app' },
  })
  const probe = tryUnlockPrivateKey(result.p12Bytes, 'wrong')
  assert(probe.ok === false, 'wrong password should fail')
  assertEquals(probe.reason, 'wrong-password')
})

await test('tryUnlockPrivateKey reports unsupported-format for non-PKCS12 bytes', async () => {
  const { tryUnlockPrivateKey } = await importKeystore()
  const probe = tryUnlockPrivateKey(Buffer.from('definitely not a p12'), 'anything')
  assert(probe.ok === false, 'garbage input should fail')
  assert(
    probe.reason === 'unsupported-format' || probe.reason === 'parse-error',
    `expected unsupported-format or parse-error, got ${probe.reason}`,
  )
})

await test('listKeystoreAliases reports unsupported-format for non-PKCS12 input', async () => {
  const { listKeystoreAliases } = await importKeystore()
  const garbage = Buffer.from('this is not a keystore, just text')
  const listed = listKeystoreAliases(garbage, 'anything')
  assert(listed.ok === false, 'garbage should not parse')
  assert(
    listed.reason === 'unsupported-format' || listed.reason === 'parse-error',
    `expected unsupported-format or parse-error, got ${listed.reason}`,
  )
})

await test('two generated keystores are distinct', async () => {
  const { generateKeystore } = await importKeystore()
  const opts = {
    alias: 'release',
    storePassword: 'pw',
    keyPassword: 'pw',
    dname: { commonName: 'com.example.app' },
  }
  const a = generateKeystore(opts)
  const b = generateKeystore(opts)
  assert(a.p12Base64 !== b.p12Base64, 'different invocations must yield different keystores (new key pair each time)')
})

// ─── sanitizeKeystoreAlias (path-traversal guard for the on-disk filename) ───
// The alias originates from user input (keystoreNewAlias). It is used verbatim
// for the keystore crypto + KEYSTORE_KEY_ALIAS, but the ON-DISK filename
// (android/app/<alias>.p12) must be sanitized so a value like "../../evil" or
// "/etc/x" cannot escape android/app/.

await test('sanitizeKeystoreAlias: normal alias passes through unchanged', async () => {
  const { sanitizeKeystoreAlias } = await importKeystore()
  assertEquals(sanitizeKeystoreAlias('release'), 'release')
  assertEquals(sanitizeKeystoreAlias('my_app-key.v2'), 'my_app-key.v2')
})

await test('sanitizeKeystoreAlias: ../../etc/passwd → no slashes, no ..', async () => {
  const { sanitizeKeystoreAlias } = await importKeystore()
  const out = sanitizeKeystoreAlias('../../etc/passwd')
  assert(!out.includes('/'), `must not contain "/": got ${out}`)
  assert(!out.includes('\\'), `must not contain "\\": got ${out}`)
  assert(!out.includes('..'), `must not contain "..": got ${out}`)
  // basename of the path is "passwd"
  assertEquals(out, 'passwd')
})

await test('sanitizeKeystoreAlias: a/b → basename only', async () => {
  const { sanitizeKeystoreAlias } = await importKeystore()
  assertEquals(sanitizeKeystoreAlias('a/b'), 'b')
})

await test('sanitizeKeystoreAlias: backslash path → basename only', async () => {
  const { sanitizeKeystoreAlias } = await importKeystore()
  const out = sanitizeKeystoreAlias('a\\b\\c')
  assert(!out.includes('\\'), `must not contain "\\": got ${out}`)
  assert(!out.includes('/'), `must not contain "/": got ${out}`)
  assertEquals(out, 'c')
})

await test('sanitizeKeystoreAlias: empty / . / .. → safe default', async () => {
  const { sanitizeKeystoreAlias } = await importKeystore()
  assertEquals(sanitizeKeystoreAlias(''), 'keystore')
  assertEquals(sanitizeKeystoreAlias('.'), 'keystore')
  assertEquals(sanitizeKeystoreAlias('..'), 'keystore')
  // a path whose basename is a dot-only segment also normalizes to the default
  assertEquals(sanitizeKeystoreAlias('foo/..'), 'keystore')
})

await test('sanitizeKeystoreAlias: weird chars → underscored', async () => {
  const { sanitizeKeystoreAlias } = await importKeystore()
  assertEquals(sanitizeKeystoreAlias('a b$c'), 'a_b_c')
  assertEquals(sanitizeKeystoreAlias('key@home!'), 'key_home_')
  // result never contains separators or traversal sequences
  const out = sanitizeKeystoreAlias('..\\..\\weird name')
  assert(!out.includes('/') && !out.includes('\\') && !out.includes('..'), `unsafe chars leaked: ${out}`)
})

console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
