#!/usr/bin/env node
/**
 * Focused resume-routing tests for Android onboarding progress.
 */

console.log('🧪 Testing Android onboarding progress routing...\n')

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

function assertEquals(a, b, msg) { if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`) }

async function importProgress() {
  return await import('../src/build/onboarding/android/progress.ts')
}

function keystoreReadyProgress(overrides = {}) {
  return {
    platform: 'android',
    appId: 'com.example.app',
    startedAt: '2026-05-22T00:00:00.000Z',
    keystoreMethod: 'generate',
    keystoreAlias: 'release',
    keystoreStorePassword: 'store-pass',
    _keystoreBase64: 'keystore-base64',
    completedSteps: {
      keystoreReady: {
        keystorePath: 'android/app/release.p12',
        alias: 'release',
        isGenerated: true,
      },
    },
    ...overrides,
  }
}

await test('fresh runs return to service-account method select if quit before choosing', async () => {
  const { getAndroidResumeStep } = await importProgress()
  assertEquals(
    getAndroidResumeStep(keystoreReadyProgress({ serviceAccountForkSeen: true })),
    'service-account-method-select',
  )
})

await test('legacy progress without fork marker still resumes OAuth path', async () => {
  const { getAndroidResumeStep } = await importProgress()
  assertEquals(getAndroidResumeStep(keystoreReadyProgress()), 'google-sign-in')
})

await test('existing service-account path resumes package selection before package is known', async () => {
  const { getAndroidResumeStep } = await importProgress()
  assertEquals(
    getAndroidResumeStep(keystoreReadyProgress({
      serviceAccountForkSeen: true,
      serviceAccountMethod: 'existing',
    })),
    'android-package-select',
  )
})

await test('existing service-account path resumes validation after JSON path is saved', async () => {
  const { getAndroidResumeStep } = await importProgress()
  assertEquals(
    getAndroidResumeStep(keystoreReadyProgress({
      serviceAccountForkSeen: true,
      serviceAccountMethod: 'existing',
      serviceAccountJsonPath: '/tmp/service-account.json',
      completedSteps: {
        ...keystoreReadyProgress().completedSteps,
        androidPackageChosen: {
          packageName: 'com.example.app',
          source: 'user-input',
        },
      },
    })),
    'sa-json-validating',
  )
})

console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
