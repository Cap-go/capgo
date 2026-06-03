#!/usr/bin/env node
/**
 * Focused resume-routing tests for the TOTAL iOS resume function
 * (getIosResumeStep). Mirrors the style of test-android-onboarding-progress.mjs.
 *
 * Asserts that every persisted-state shape maps to the correct step:
 *   - null → welcome
 *   - the _credentialsExistGate front gate ('pending' / 'backup' / pass-through)
 *   - the confirm-app-id front gate (pendingAppIdNext + !appIdConfirmed)
 *   - the create-new partial .p8-input chain
 *   - the import app_store .p8 chain INCLUDING the intentional verifying-key
 *     round-trip on full inputs (risk #4 in the audit)
 *   - cert / profile markers → saving-credentials
 * and that the ephemeral-only picker steps (import-pick-identity /
 * import-pick-profile / import-checking-apple-cert / import-validating-all-certs
 * / import-no-match-recovery …) are NEVER returned by resume.
 */
import process from 'node:process'

console.log('🧪 Testing iOS onboarding resume routing (getIosResumeStep)...\n')

const { getIosResumeStep } = await import('../src/build/onboarding/ios/progress.ts')
const { getResumeStep } = await import('../src/build/onboarding/progress.ts')

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

function makeProgress(overrides = {}) {
  return {
    platform: 'ios',
    appId: 'com.example.app',
    startedAt: '2026-06-03T00:00:00.000Z',
    completedSteps: {},
    ...overrides,
  }
}

// The ephemeral picker steps that resume must NEVER land on (they depend on
// transient selections re-derived by re-running import-scanning).
const EPHEMERAL_PICKER_STEPS = new Set([
  'import-pick-identity',
  'import-pick-profile',
  'import-checking-apple-cert',
  'import-validating-all-certs',
  'import-no-match-recovery',
  'import-portal-explanation',
  'import-provide-profile-path',
  'import-create-profile-only',
  'import-export-warning',
  'import-compiling-helper',
  'import-exporting',
  'cert-limit-prompt',
  'revoking-certificate',
  'duplicate-profile-prompt',
  'deleting-duplicate-profiles',
])

// ─── null → welcome ───────────────────────────────────────────────────────────

await test('null progress → welcome', async () => {
  assertEquals(getIosResumeStep(null), 'welcome')
})

// ─── Phase 0 — _credentialsExistGate front gate ───────────────────────────────

await test('_credentialsExistGate "pending" → credentials-exist', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({ _credentialsExistGate: 'pending' })),
    'credentials-exist',
  )
})

await test('_credentialsExistGate "backup" → backing-up', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({ _credentialsExistGate: 'backup' })),
    'backing-up',
  )
})

await test('_credentialsExistGate "done" falls through to normal routing', async () => {
  // 'done' must NOT park on a gate — a fresh create-new file lands on
  // api-key-instructions (same as no gate at all).
  assertEquals(
    getIosResumeStep(makeProgress({ _credentialsExistGate: 'done' })),
    'api-key-instructions',
  )
})

await test('_credentialsExistGate "cancel" falls through to normal routing', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({ _credentialsExistGate: 'cancel' })),
    'api-key-instructions',
  )
})

await test('absent _credentialsExistGate falls through (legacy file) → api-key-instructions', async () => {
  assertEquals(getIosResumeStep(makeProgress()), 'api-key-instructions')
})

await test('Phase 0 gate takes priority over a pending app-id mismatch', async () => {
  // The data-safety gate fires before the confirm-app-id gate.
  assertEquals(
    getIosResumeStep(makeProgress({
      _credentialsExistGate: 'pending',
      pendingAppIdNext: 'import-pick-identity',
    })),
    'credentials-exist',
  )
})

// ─── Phase 1 — confirm-app-id front gate ──────────────────────────────────────

await test('pendingAppIdNext set + not confirmed → confirm-app-id', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({ pendingAppIdNext: 'import-pick-identity' })),
    'confirm-app-id',
  )
})

await test('pendingAppIdNext set + appIdConfirmed → routes FORWARD to pendingAppIdNext (BATCH 4 post-confirm, no re-ask)', async () => {
  // Once confirmed the gate must NOT re-ask. Until the driver clears
  // pendingAppIdNext (on the next applyInput — setPendingAppIdNext(null),
  // app.tsx:3085) resume routes FORWARD to the recorded target, mirroring the
  // TUI's setStep(pendingAppIdNext ?? 'import-pick-identity') (app.tsx:3084).
  // This is the documented one-shot post-confirm hop (graph doc L243) — the only
  // case where resume may hand back an ephemeral picker target.
  assertEquals(
    getIosResumeStep(makeProgress({
      pendingAppIdNext: 'import-pick-identity',
      appIdConfirmed: true,
    })),
    'import-pick-identity',
  )
})

await test('appIdConfirmed but pendingAppIdNext CLEARED → gate fully behind us (normal routing)', async () => {
  // After the driver clears pendingAppIdNext the post-confirm branch is dormant;
  // a bare create-new file lands on api-key-instructions exactly as a no-gate file.
  assertEquals(
    getIosResumeStep(makeProgress({ appIdConfirmed: true })),
    'api-key-instructions',
  )
})

await test('no pendingAppIdNext → confirm-app-id never shown (even if appIdConfirmed unset)', async () => {
  assertEquals(getIosResumeStep(makeProgress()), 'api-key-instructions')
})

await test('confirm-app-id gate does not block a later cert/profile resume once confirmed (pendingAppIdNext cleared by driver)', async () => {
  // A later cert/profile resume is the steady state AFTER the driver cleared
  // pendingAppIdNext (the post-confirm one-shot hop already happened). With the
  // mismatch fully behind us, an apiKeyVerified file routes straight to the next
  // create-new effect — the confirmed gate never re-asks or blocks.
  assertEquals(
    getIosResumeStep(makeProgress({
      appIdConfirmed: true,
      completedSteps: {
        apiKeyVerified: { keyId: 'X', issuerId: 'Y' },
      },
    })),
    'creating-certificate',
  )
})

// ─── Create-new partial-input chain (delegated verbatim to getResumeStep) ─────

await test('create-new with no inputs → api-key-instructions', async () => {
  assertEquals(getIosResumeStep(makeProgress()), 'api-key-instructions')
})

await test('create-new with .p8 only → input-key-id', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({ p8Path: '/tmp/AuthKey_ABC1234567.p8' })),
    'input-key-id',
  )
})

await test('create-new with .p8 + keyId → input-issuer-id', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({
      p8Path: '/tmp/AuthKey_ABC1234567.p8',
      keyId: 'ABC1234567',
    })),
    'input-issuer-id',
  )
})

await test('create-new with full .p8 inputs → verifying-key', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({
      p8Path: '/tmp/AuthKey_ABC1234567.p8',
      keyId: 'ABC1234567',
      issuerId: '550e8400-e29b-41d4-a716-446655440000',
    })),
    'verifying-key',
  )
})

await test('create-new with apiKeyVerified, no cert → creating-certificate', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({
      completedSteps: { apiKeyVerified: { keyId: 'X', issuerId: 'Y' } },
    })),
    'creating-certificate',
  )
})

await test('create-new with cert created, no profile → creating-profile', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({
      completedSteps: {
        apiKeyVerified: { keyId: 'X', issuerId: 'Y' },
        certificateCreated: { certificateId: 'C', expirationDate: 'D', teamId: 'T', p12Base64: 'P' },
      },
    })),
    'creating-profile',
  )
})

await test('create-new with cert + profile → saving-credentials (terminal in BATCH 0)', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({
      completedSteps: {
        apiKeyVerified: { keyId: 'X', issuerId: 'Y' },
        certificateCreated: { certificateId: 'C', expirationDate: 'D', teamId: 'T', p12Base64: 'P' },
        profileCreated: { profileId: 'PR', profileName: 'N', profileBase64: 'B' },
      },
    })),
    'saving-credentials',
  )
})

// ─── Import app_store .p8 chain (incl the intentional verifying-key round-trip) ──

await test('import app_store, no distribution → import-distribution-mode', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({ setupMethod: 'import-existing' })),
    'import-distribution-mode',
  )
})

await test('import app_store, no .p8 yet → api-key-instructions', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({
      setupMethod: 'import-existing',
      importDistribution: 'app_store',
    })),
    'api-key-instructions',
  )
})

await test('import app_store, .p8 only → input-key-id', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({
      setupMethod: 'import-existing',
      importDistribution: 'app_store',
      p8Path: '/tmp/AuthKey_ABC1234567.p8',
    })),
    'input-key-id',
  )
})

await test('import app_store, .p8 + keyId → input-issuer-id', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({
      setupMethod: 'import-existing',
      importDistribution: 'app_store',
      p8Path: '/tmp/AuthKey_ABC1234567.p8',
      keyId: 'ABC1234567',
    })),
    'input-issuer-id',
  )
})

await test('import app_store, full .p8 inputs (no verify) → verifying-key', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({
      setupMethod: 'import-existing',
      importDistribution: 'app_store',
      p8Path: '/tmp/AuthKey_ABC1234567.p8',
      keyId: 'ABC1234567',
      issuerId: '550e8400-e29b-41d4-a716-446655440000',
    })),
    'verifying-key',
  )
})

await test('import app_store, full .p8 inputs + apiKeyVerified → import-scanning (round-trip preserved downstream)', async () => {
  // Risk #4: the intentional verifying-key round-trip on import app_store resume
  // is NOT short-circuited away. getResumeStep (which getIosResumeStep delegates
  // to verbatim) routes a VERIFIED import file to import-scanning; the scan
  // effect's redirectIfMismatch(getImportEntryStep(progress)) is what re-issues
  // verifying-key (it returns verifying-key while all three .p8 inputs are
  // present, never short-circuiting on apiKeyVerified — see
  // test-onboarding-progress.mjs). So the round-trip lives one hop downstream,
  // and delegating verbatim is exactly what preserves it.
  assertEquals(
    getIosResumeStep(makeProgress({
      setupMethod: 'import-existing',
      importDistribution: 'app_store',
      p8Path: '/tmp/AuthKey_66FGQZB566.p8',
      keyId: '66FGQZB566',
      issuerId: '0cd4db4a-5598-45b8-9d32-75cdf127d005',
      completedSteps: {
        apiKeyVerified: { keyId: '66FGQZB566', issuerId: '0cd4db4a-5598-45b8-9d32-75cdf127d005' },
      },
    })),
    'import-scanning',
  )
})

await test('import app_store, full .p8 inputs BEFORE verify → verifying-key (round-trip on first pass)', async () => {
  // The pre-verify full-inputs case DOES land directly on verifying-key — the
  // round-trip that catches a moved/deleted .p8 or a revoked key before any
  // cert/profile work. This is the import-existing !apiKeyVerified branch of
  // getResumeStep, preserved verbatim by getIosResumeStep.
  assertEquals(
    getIosResumeStep(makeProgress({
      setupMethod: 'import-existing',
      importDistribution: 'app_store',
      p8Path: '/tmp/AuthKey_66FGQZB566.p8',
      keyId: '66FGQZB566',
      issuerId: '0cd4db4a-5598-45b8-9d32-75cdf127d005',
    })),
    'verifying-key',
  )
})

// ─── Import ad_hoc + import-verified → import-scanning (re-run silent inventory) ──

await test('import ad_hoc, no apiKey → import-scanning (re-run inventory; never a picker)', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({
      setupMethod: 'import-existing',
      importDistribution: 'ad_hoc',
    })),
    'import-scanning',
  )
})

await test('import-existing with apiKeyVerified → import-scanning (re-run inventory; never a picker)', async () => {
  assertEquals(
    getIosResumeStep(makeProgress({
      setupMethod: 'import-existing',
      completedSteps: { apiKeyVerified: { keyId: 'X', issuerId: 'Y' } },
    })),
    'import-scanning',
  )
})

// ─── Ephemeral picker steps are NEVER resume targets ──────────────────────────

await test('resume NEVER returns an ephemeral picker step across many persisted shapes', async () => {
  const shapes = [
    makeProgress(),
    makeProgress({ _credentialsExistGate: 'pending' }),
    makeProgress({ _credentialsExistGate: 'backup' }),
    makeProgress({ _credentialsExistGate: 'done' }),
    makeProgress({ pendingAppIdNext: 'import-pick-identity' }),
    // NOTE: the CONFIRMED post-confirm hop ({ pendingAppIdNext, appIdConfirmed:true })
    // is intentionally EXCLUDED here — it is the one documented case (graph doc L243,
    // app.tsx:3084) where resume legitimately hands back the ephemeral pendingAppIdNext
    // target as a one-shot before the driver clears it. It is asserted explicitly in
    // the BATCH 4 post-confirm test above + in test-ios-confirm-app-id.mjs.
    makeProgress({ p8Path: '/tmp/AuthKey_ABC1234567.p8' }),
    makeProgress({ p8Path: '/tmp/AuthKey_ABC1234567.p8', keyId: 'ABC1234567' }),
    makeProgress({ setupMethod: 'import-existing' }),
    makeProgress({ setupMethod: 'import-existing', importDistribution: 'ad_hoc' }),
    makeProgress({ setupMethod: 'import-existing', importDistribution: 'app_store' }),
    makeProgress({
      setupMethod: 'import-existing',
      importDistribution: 'app_store',
      p8Path: '/tmp/AuthKey_ABC1234567.p8',
      keyId: 'ABC1234567',
      issuerId: '550e8400-e29b-41d4-a716-446655440000',
    }),
    makeProgress({
      setupMethod: 'import-existing',
      completedSteps: { apiKeyVerified: { keyId: 'X', issuerId: 'Y' } },
    }),
    // Even with recovery markers persisted, resume must not land on a picker.
    makeProgress({
      setupMethod: 'import-existing',
      importDistribution: 'ad_hoc',
      duplicateProfileOrigin: 'import-create-profile-only',
      pendingRecoveryAction: 'create-profile-only',
    }),
    makeProgress({
      completedSteps: {
        apiKeyVerified: { keyId: 'X', issuerId: 'Y' },
        certificateCreated: { certificateId: 'C', expirationDate: 'D', teamId: 'T', p12Base64: 'P' },
      },
      duplicateProfileOrigin: 'creating-profile',
    }),
  ]
  for (const shape of shapes) {
    const step = getIosResumeStep(shape)
    if (EPHEMERAL_PICKER_STEPS.has(step))
      throw new Error(`resume landed on ephemeral picker step "${step}" for ${JSON.stringify(shape)}`)
  }
})

// ─── Parity: AFTER the gates, getIosResumeStep === getResumeStep ──────────────

await test('post-gate parity: getIosResumeStep matches getResumeStep when no front gate is pending', async () => {
  const shapes = [
    makeProgress(),
    makeProgress({ p8Path: '/tmp/AuthKey_ABC1234567.p8' }),
    makeProgress({ p8Path: '/tmp/AuthKey_ABC1234567.p8', keyId: 'ABC1234567' }),
    makeProgress({
      p8Path: '/tmp/AuthKey_ABC1234567.p8',
      keyId: 'ABC1234567',
      issuerId: '550e8400-e29b-41d4-a716-446655440000',
    }),
    makeProgress({ setupMethod: 'import-existing' }),
    makeProgress({ setupMethod: 'import-existing', importDistribution: 'ad_hoc' }),
    makeProgress({ setupMethod: 'import-existing', importDistribution: 'app_store' }),
    makeProgress({
      setupMethod: 'import-existing',
      importDistribution: 'app_store',
      p8Path: '/tmp/AuthKey_66FGQZB566.p8',
      keyId: '66FGQZB566',
      issuerId: '0cd4db4a-5598-45b8-9d32-75cdf127d005',
      completedSteps: { apiKeyVerified: { keyId: '66FGQZB566', issuerId: '0cd4db4a-5598-45b8-9d32-75cdf127d005' } },
    }),
    makeProgress({
      completedSteps: {
        apiKeyVerified: { keyId: 'X', issuerId: 'Y' },
        certificateCreated: { certificateId: 'C', expirationDate: 'D', teamId: 'T', p12Base64: 'P' },
        profileCreated: { profileId: 'PR', profileName: 'N', profileBase64: 'B' },
      },
    }),
    // A 'done' gate + confirmed app-id must behave exactly like a bare file.
    makeProgress({ _credentialsExistGate: 'done', appIdConfirmed: true }),
  ]
  for (const shape of shapes)
    assertEquals(getIosResumeStep(shape), getResumeStep(shape), `parity mismatch for ${JSON.stringify(shape)}`)
})

console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
