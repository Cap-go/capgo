#!/usr/bin/env node
/**
 * Unit tests for Android service-account JSON validation.
 * Keeps coverage focused on local parsing/guardrails; live Google validation is
 * covered by manual onboarding tests.
 */

import { Buffer } from 'node:buffer'

console.log('🧪 Testing Android service-account validation helpers...\n')

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

async function importValidation() {
  return await import('../src/build/onboarding/android/service-account-validation.ts')
}

function serviceAccountJson(overrides = {}) {
  return Buffer.from(JSON.stringify({
    type: 'service_account',
    client_email: 'capgo-build@example-project.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nnot-used-by-these-tests\n-----END PRIVATE KEY-----\n',
    project_id: 'example-project',
    token_uri: 'https://oauth2.googleapis.com/token',
    ...overrides,
  }))
}

await test('parseServiceAccountKey accepts Google OAuth token endpoint', async () => {
  const { parseServiceAccountKey } = await importValidation()
  const key = parseServiceAccountKey(serviceAccountJson())
  assertEquals(key.token_uri, 'https://oauth2.googleapis.com/token')
  assertEquals(key.client_email, 'capgo-build@example-project.iam.gserviceaccount.com')
})

await test('validateServiceAccountJson rejects non-Google token_uri before network calls', async () => {
  const { validateServiceAccountJson } = await importValidation()
  let fetchCalled = false
  const result = await validateServiceAccountJson({
    jsonBytes: serviceAccountJson({ token_uri: 'https://example.test/token' }),
    packageName: 'com.example.app',
    fetchImpl: async () => {
      fetchCalled = true
      throw new Error('fetch should not be called')
    },
  })

  assertEquals(fetchCalled, false, 'fetch should not be called for rejected token_uri')
  assertEquals(result.ok, false)
  assertEquals(result.kind, 'shape-error')
  assert(result.message.includes('unsupported token_uri'), `unexpected error: ${result.message}`)
})

console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
