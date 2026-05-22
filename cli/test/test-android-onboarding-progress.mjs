#!/usr/bin/env node
/**
 * Focused resume-routing tests for Android onboarding progress.
 */
import process from 'node:process'

console.log('🧪 Testing Android onboarding progress routing...\n')

const { getAndroidResumeStep, hasAnyOAuthProgress } = await import('../src/build/onboarding/android/progress.ts')

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

function assertEquals(a, b, msg) {
  if (a !== b)
    throw new Error(msg || `Expected ${b}, got ${a}`)
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
  assertEquals(
    getAndroidResumeStep(keystoreReadyProgress({ serviceAccountForkSeen: true })),
    'service-account-method-select',
  )
})

await test('legacy progress without fork marker still resumes OAuth path', async () => {
  assertEquals(getAndroidResumeStep(keystoreReadyProgress()), 'google-sign-in')
})

await test('generate service-account path resumes OAuth sign-in', async () => {
  assertEquals(
    getAndroidResumeStep(keystoreReadyProgress({
      serviceAccountForkSeen: true,
      serviceAccountMethod: 'generate',
    })),
    'google-sign-in',
  )
})

await test('existing service-account path resumes package selection before package is known', async () => {
  assertEquals(
    getAndroidResumeStep(keystoreReadyProgress({
      serviceAccountForkSeen: true,
      serviceAccountMethod: 'existing',
    })),
    'android-package-select',
  )
})

await test('existing service-account path resumes validation after JSON path is saved', async () => {
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

await test('existing service-account path resumes saving credentials after JSON is accepted', async () => {
  assertEquals(
    getAndroidResumeStep(keystoreReadyProgress({
      serviceAccountForkSeen: true,
      serviceAccountMethod: 'existing',
      _serviceAccountKeyBase64: 'service-account-json-base64',
    })),
    'saving-credentials',
  )
})

for (const { label, patch } of [
  {
    label: 'google sign-in marker',
    patch: { completedSteps: { ...keystoreReadyProgress().completedSteps, googleSignInComplete: { email: 'user@example.com' } } },
  },
  {
    label: 'Play account marker',
    patch: { completedSteps: { ...keystoreReadyProgress().completedSteps, playAccountChosen: { accountId: '123456789' } } },
  },
  {
    label: 'GCP project marker',
    patch: { completedSteps: { ...keystoreReadyProgress().completedSteps, gcpProjectChosen: { projectId: 'capgo-test' } } },
  },
  {
    label: 'Android package marker',
    patch: {
      completedSteps: {
        ...keystoreReadyProgress().completedSteps,
        androidPackageChosen: { packageName: 'com.example.app', source: 'user-input' },
      },
    },
  },
  {
    label: 'OAuth refresh token',
    patch: { _oauthRefreshToken: 'refresh-token' },
  },
]) {
  await test(`fresh fork marker with ${label} keeps legacy OAuth resume`, async () => {
    const progress = keystoreReadyProgress({
      serviceAccountForkSeen: true,
      ...patch,
    })
    assertEquals(hasAnyOAuthProgress(progress), true)
    assertEquals(getAndroidResumeStep(progress), 'google-sign-in')
  })
}

console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
