#!/usr/bin/env node
/**
 * confirm-app-id REMOVAL spec (PR #2397).
 *
 * The confirm-app-id step no longer exists: the driver silently adopts the
 * authoritative Release PRODUCT_BUNDLE_IDENTIFIER (redirectIfMismatch in
 * ui/app.tsx) and the remote verify-app step — an App Store Connect check that
 * an app exists for the Release build id — now owns the bundle-id invariant
 * (progress.ts getResumeStep, !certificateCreated branch).
 *
 * Progress files written by OLDER CLIs can still carry the engine-era
 * `pendingAppIdNext` / `appIdConfirmed` fields. This suite pins the
 * tolerance contract for those stale files:
 *
 *   1. getIosResumeStep IGNORES the stale fields — resume falls through to the
 *      normal routing instead of parking the user on a step that no longer
 *      renders (which would freeze the wizard).
 *   2. The replacement gate: an apiKeyVerified create-new file resumes on
 *      verify-app (NOT straight to creating-certificate), so the invariant is
 *      re-checked before any cert/profile work.
 *   3. applyIosInput treats a legacy 'confirm-app-id' input as a no-op
 *      (progress returned unchanged, never a throw).
 */
import process from 'node:process'

const {
  applyIosInput,
} = await import('../src/build/onboarding/ios/flow.ts')

const {
  getIosResumeStep,
} = await import('../src/build/onboarding/ios/progress.ts')

console.log('🧪 iOS — confirm-app-id removal: stale gate fields are ignored\n')

let testsPassed = 0
let testsFailed = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`✅ ${name}`)
    testsPassed++
  }
  catch (err) {
    console.error(`❌ ${name}`)
    console.error(`   ${err instanceof Error ? err.message : String(err)}`)
    testsFailed++
  }
}

function assert(condition, message) {
  if (!condition)
    throw new Error(message || 'Assertion failed')
}

function assertEquals(actual, expected, message) {
  if (actual !== expected)
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const APP_ID = 'com.example.app'

function iosProgress(overrides = {}) {
  const { completedSteps: completedOverrides, ...rest } = overrides
  return {
    platform: 'ios',
    appId: APP_ID,
    startedAt: '2026-06-03T00:00:00.000Z',
    ...rest,
    completedSteps: {
      ...completedOverrides,
    },
  }
}

// ─── 1) Stale gate fields are IGNORED by resume ─────────────────────────────────

await test('stale pendingAppIdNext (!appIdConfirmed) is ignored → normal create-new routing', async () => {
  const p = iosProgress({ setupMethod: 'create-new', pendingAppIdNext: 'import-pick-identity' })
  assertEquals(getIosResumeStep(p), 'api-key-instructions', 'the removed gate must not park resume; falls through to the .p8 chain entry')
})

await test('stale pendingAppIdNext + appIdConfirmed is ignored (no post-confirm forward hop)', async () => {
  // The engine-era Phase 1b forward hop (route to the recorded target) is gone
  // too — the recorded target may be an ephemeral picker that resume must never
  // hand back.
  const p = iosProgress({ setupMethod: 'create-new', pendingAppIdNext: 'import-pick-identity', appIdConfirmed: true })
  assertEquals(getIosResumeStep(p), 'api-key-instructions', 'no forward hop to the stale recorded target')
})

await test('stale gate fields never outrank the partial .p8 chain', async () => {
  const p = iosProgress({
    setupMethod: 'create-new',
    pendingAppIdNext: 'import-pick-identity',
    p8Path: '/tmp/AuthKey_ABC1234567.p8',
  })
  assertEquals(getIosResumeStep(p), 'input-key-id', 'the .p8 chain routing is unaffected by stale fields')
})

await test('stale gate fields on an import file fall through to the import routing', async () => {
  const p = iosProgress({
    setupMethod: 'import-existing',
    importDistribution: 'ad_hoc',
    pendingAppIdNext: 'import-pick-identity',
  })
  assertEquals(getIosResumeStep(p), 'import-scanning', 'import resume re-runs the silent inventory, never the dead gate')
})

// ─── 2) verify-app is the replacement bundle-id gate ────────────────────────────

await test('apiKeyVerified + no cert → verify-app (remote App Store gate), even with stale fields', async () => {
  const p = iosProgress({
    pendingAppIdNext: 'creating-certificate',
    appIdConfirmed: true,
    completedSteps: { apiKeyVerified: { keyId: 'X', issuerId: 'Y' } },
  })
  assertEquals(getIosResumeStep(p), 'verify-app', 'the bundle-id invariant is re-checked remotely before cert creation')
})

await test('cert already created → verify-app is behind us (creating-profile)', async () => {
  const p = iosProgress({
    completedSteps: {
      apiKeyVerified: { keyId: 'X', issuerId: 'Y' },
      certificateCreated: { certificateId: 'C', expirationDate: 'D', teamId: 'T', p12Base64: 'P' },
    },
  })
  assertEquals(getIosResumeStep(p), 'creating-profile', 'verify-app never re-gates once the cert exists')
})

// ─── 3) Legacy 'confirm-app-id' inputs are tolerated as no-ops ──────────────────

await test("applyIosInput with a legacy 'confirm-app-id' input returns progress unchanged", async () => {
  const before = iosProgress({ setupMethod: 'create-new', pendingAppIdNext: 'input-key-id' })
  const after = applyIosInput('confirm-app-id', before, { step: 'confirm-app-id', value: 'com.example.app.Build' })
  assertEquals(JSON.stringify(after), JSON.stringify(before), 'removed vocabulary → reducer default no-op (and no throw)')
  assert(after.iosBundleIdOverride === undefined, 'the legacy input must NOT persist an override anymore')
})

console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
