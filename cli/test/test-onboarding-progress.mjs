import assert from 'node:assert/strict'
import { extractKeyIdFromP8Path, getImportEntryStep, getResumeStep } from '../src/build/onboarding/progress.ts'

function t(name, fn) {
  try {
    fn()
    process.stdout.write(`✓ ${name}\n`)
  }
  catch (e) {
    process.stderr.write(`✗ ${name}\n`)
    throw e
  }
}

function makeProgress(overrides = {}) {
  return {
    platform: 'ios',
    appId: 'com.example.app',
    startedAt: '2026-05-21T06:06:23.826Z',
    completedSteps: {},
    ...overrides,
  }
}

// ─── getImportEntryStep ───────────────────────────────────────────────

t('returns import-distribution-mode when no progress at all', () => {
  assert.equal(getImportEntryStep(null), 'import-distribution-mode')
})

t('returns import-distribution-mode when importDistribution is unset', () => {
  const progress = makeProgress({ setupMethod: 'import-existing' })
  assert.equal(getImportEntryStep(progress), 'import-distribution-mode')
})

t('ad_hoc routes straight to import-pick-identity', () => {
  const progress = makeProgress({ setupMethod: 'import-existing', importDistribution: 'ad_hoc' })
  assert.equal(getImportEntryStep(progress), 'import-pick-identity')
})

t('ad_hoc skips identity selection regardless of partial .p8 state', () => {
  // ad_hoc never asks for .p8 in the main flow; partial p8Path is irrelevant.
  const progress = makeProgress({
    setupMethod: 'import-existing',
    importDistribution: 'ad_hoc',
    p8Path: '/tmp/AuthKey_XXX.p8',
  })
  assert.equal(getImportEntryStep(progress), 'import-pick-identity')
})

t('app_store with apiKeyVerified + full inputs → verifying-key (re-verifies on resume)', () => {
  // We deliberately don't short-circuit on apiKeyVerified: re-verifying
  // catches both moved/deleted .p8 files and Apple-side key revocation
  // that a saved verification flag can't detect.
  const progress = makeProgress({
    setupMethod: 'import-existing',
    importDistribution: 'app_store',
    p8Path: '/tmp/AuthKey_XXX.p8',
    keyId: 'XXX',
    issuerId: 'issuer-uuid',
    completedSteps: {
      apiKeyVerified: { keyId: 'XXX', issuerId: 'issuer-uuid' },
    },
  })
  assert.equal(getImportEntryStep(progress), 'verifying-key')
})

t('app_store with full inputs (no verify yet) → verifying-key', () => {
  const progress = makeProgress({
    setupMethod: 'import-existing',
    importDistribution: 'app_store',
    p8Path: '/tmp/AuthKey_XXX.p8',
    keyId: 'XXX',
    issuerId: 'issuer-uuid',
  })
  assert.equal(getImportEntryStep(progress), 'verifying-key')
})

t('app_store with .p8 + keyId, missing issuerId → input-issuer-id', () => {
  const progress = makeProgress({
    setupMethod: 'import-existing',
    importDistribution: 'app_store',
    p8Path: '/tmp/AuthKey_XXX.p8',
    keyId: 'XXX',
  })
  assert.equal(getImportEntryStep(progress), 'input-issuer-id')
})

t('app_store with .p8 only → input-key-id', () => {
  const progress = makeProgress({
    setupMethod: 'import-existing',
    importDistribution: 'app_store',
    p8Path: '/tmp/AuthKey_XXX.p8',
  })
  assert.equal(getImportEntryStep(progress), 'input-key-id')
})

t('app_store with nothing yet → api-key-instructions', () => {
  const progress = makeProgress({
    setupMethod: 'import-existing',
    importDistribution: 'app_store',
  })
  assert.equal(getImportEntryStep(progress), 'api-key-instructions')
})

t('app_store fix matches the real-world bug report shape', () => {
  // From a real onboarding-progress file: user has verified API key + picked
  // app_store. Was being re-asked for .p8 file. Should land at verifying-key
  // (which re-validates against Apple, then routes to import-pick-identity
  // on success) — NOT the .p8 file picker.
  const progress = makeProgress({
    appId: 'ee.forgr.capacitor_go',
    setupMethod: 'import-existing',
    importDistribution: 'app_store',
    p8Path: '/path/to/AuthKey_66FGQZB566.p8',
    keyId: '66FGQZB566',
    issuerId: '0cd4db4a-5598-45b8-9d32-75cdf127d005',
    completedSteps: {
      apiKeyVerified: { keyId: '66FGQZB566', issuerId: '0cd4db4a-5598-45b8-9d32-75cdf127d005' },
    },
  })
  assert.equal(getImportEntryStep(progress), 'verifying-key')
})

// ─── getResumeStep regression — should not be affected ────────────────

t('getResumeStep still returns welcome for null progress', () => {
  assert.equal(getResumeStep(null), 'welcome')
})

t('getResumeStep still returns import-scanning for verified import flow', () => {
  const progress = makeProgress({
    setupMethod: 'import-existing',
    completedSteps: { apiKeyVerified: { keyId: 'X', issuerId: 'Y' } },
  })
  assert.equal(getResumeStep(progress), 'import-scanning')
})

// Regression: ad_hoc resume must not bounce back to setup-method-select
// just because the user hasn't entered a .p8 (ad_hoc never asks for one).
// Reported by the resume-prompt screen where the user picked Continue
// after picking Import + Ad Hoc and got dropped on "How do you want to
// set up iOS credentials?" — re-asking a fork they already chose.
t('getResumeStep returns import-scanning for ad_hoc import without apiKey', () => {
  const progress = makeProgress({
    setupMethod: 'import-existing',
    importDistribution: 'ad_hoc',
  })
  assert.equal(getResumeStep(progress), 'import-scanning')
})

// app_store + import + no .p8 yet should start the ASC API key flow, not
// bounce the user back to the setup-method fork.
t('getResumeStep returns api-key-instructions for app_store import with no inputs', () => {
  const progress = makeProgress({
    setupMethod: 'import-existing',
    importDistribution: 'app_store',
  })
  assert.equal(getResumeStep(progress), 'api-key-instructions')
})

// User picked Import but quit before picking distribution mode — re-ask
// just the distribution-mode question, not the upstream setup fork.
t('getResumeStep returns import-distribution-mode when importDistribution is unset', () => {
  const progress = makeProgress({
    setupMethod: 'import-existing',
  })
  assert.equal(getResumeStep(progress), 'import-distribution-mode')
})

// Create-new resume must route through verify-app (the remote App Store
// Connect gate), not straight to creating-certificate. Create-new is always
// app_store; a user who quit while blocked on the App Store app check would
// otherwise have the gate skipped on resume and proceed to cert/profile
// creation for an unverified bundle id — defeating the invariant.
t('getResumeStep returns verify-app for create-new with verified key, no cert', () => {
  const progress = makeProgress({
    setupMethod: 'create-new',
    completedSteps: { apiKeyVerified: { keyId: 'X', issuerId: 'Y' } },
  })
  assert.equal(getResumeStep(progress), 'verify-app')
})

// Legacy progress files predate the setupMethod field; they default to the
// create-new path and must also route through the verify-app gate on resume.
t('getResumeStep returns verify-app for legacy (no setupMethod) verified key, no cert', () => {
  const progress = makeProgress({
    completedSteps: { apiKeyVerified: { keyId: 'X', issuerId: 'Y' } },
  })
  assert.equal(getResumeStep(progress), 'verify-app')
})

// Once the certificate exists the bundle id was already committed, so resume
// moves on to profile creation rather than re-running verify-app.
t('getResumeStep returns creating-profile for create-new with cert, no profile', () => {
  const progress = makeProgress({
    setupMethod: 'create-new',
    completedSteps: {
      apiKeyVerified: { keyId: 'X', issuerId: 'Y' },
      certificateCreated: { certificateId: 'C', expirationDate: '2027-01-01', teamId: 'T', p12Base64: 'AA==' },
    },
  })
  assert.equal(getResumeStep(progress), 'creating-profile')
})

// A user who chose the guided macOS helper (p8CreateMethod=automated) and quit
// before it captured a key must resume ON the helper, not the manual .p8 picker.
t('getResumeStep returns asc-key-generating for create-new automated with no inputs', () => {
  const progress = makeProgress({ setupMethod: 'create-new', p8CreateMethod: 'automated' })
  assert.equal(getResumeStep(progress), 'asc-key-generating')
})

// ...but only when the helper is actually available — else the manual path, so
// resume doesn't land on a step that immediately fails with HELPER_NOT_FOUND.
t('getResumeStep returns api-key-instructions for automated when helper unavailable', () => {
  const progress = makeProgress({ setupMethod: 'create-new', p8CreateMethod: 'automated' })
  assert.equal(getResumeStep(progress, false), 'api-key-instructions')
})

// Manual choosers (and legacy/undefined) still resume on the .p8 instructions.
t('getResumeStep returns api-key-instructions for create-new manual with no inputs', () => {
  const progress = makeProgress({ setupMethod: 'create-new', p8CreateMethod: 'manual' })
  assert.equal(getResumeStep(progress), 'api-key-instructions')
})
t('getResumeStep returns api-key-instructions for create-new with no p8CreateMethod', () => {
  const progress = makeProgress({ setupMethod: 'create-new' })
  assert.equal(getResumeStep(progress), 'api-key-instructions')
})

// Once the helper captured the key (all three inputs persisted), resume goes to
// verifying-key — the partial-input branch wins over the automated re-launch, so
// the helper is NOT re-run for work already done.
t('getResumeStep returns verifying-key for create-new automated once inputs are saved', () => {
  const progress = makeProgress({
    setupMethod: 'create-new',
    p8CreateMethod: 'automated',
    keyId: 'K',
    issuerId: 'I',
    p8Path: '/Users/x/.appstoreconnect/private_keys/AuthKey_K.p8',
  })
  assert.equal(getResumeStep(progress), 'verifying-key')
})

// Partial .p8 inputs (the original branches) keep working — these resume
// at the furthest input step, regardless of distribution mode.
t('getResumeStep resumes at verifying-key when import has full .p8 inputs', () => {
  const progress = makeProgress({
    setupMethod: 'import-existing',
    importDistribution: 'app_store',
    p8Path: '/tmp/AuthKey_ABC1234567.p8',
    keyId: 'ABC1234567',
    issuerId: '550e8400-e29b-41d4-a716-446655440000',
  })
  assert.equal(getResumeStep(progress), 'verifying-key')
})

t('getResumeStep resumes at input-issuer-id when import has .p8 + keyId only', () => {
  const progress = makeProgress({
    setupMethod: 'import-existing',
    importDistribution: 'app_store',
    p8Path: '/tmp/AuthKey_ABC1234567.p8',
    keyId: 'ABC1234567',
  })
  assert.equal(getResumeStep(progress), 'input-issuer-id')
})

t('getResumeStep resumes at input-key-id when import has .p8 only', () => {
  const progress = makeProgress({
    setupMethod: 'import-existing',
    importDistribution: 'app_store',
    p8Path: '/tmp/AuthKey_ABC1234567.p8',
  })
  assert.equal(getResumeStep(progress), 'input-key-id')
})

// ─── extractKeyIdFromP8Path — Key ID recovered from the .p8 filename ──────────
// Regression: a session that picked the .p8 but quit before confirming the Key
// ID step used to come back with an empty field (the "ABC123DEF" placeholder).
// The Key ID is now re-derived from the saved p8Path filename on resume.

t('extracts the Key ID from an AuthKey_<id>.p8 filename', () => {
  assert.equal(extractKeyIdFromP8Path('/Users/me/AuthKey_66FGQZB566.p8'), '66FGQZB566')
})

t('extracts from the legacy ApiKey_ prefix too', () => {
  assert.equal(extractKeyIdFromP8Path('~/Downloads/ApiKey_ABC123DEF.p8'), 'ABC123DEF')
})

t('matches the prefix case-insensitively', () => {
  assert.equal(extractKeyIdFromP8Path('/x/authkey_9Z9ZZZ9Z9Z.p8'), '9Z9ZZZ9Z9Z')
})

t('returns empty for a renamed / non-matching filename', () => {
  assert.equal(extractKeyIdFromP8Path('/Users/me/my-apple-key.p8'), '')
  assert.equal(extractKeyIdFromP8Path('/Users/me/AuthKey_66FGQZB566.pem'), '')
  assert.equal(extractKeyIdFromP8Path(''), '')
})

t('only matches the key id at the end of the path (not a mid-path token)', () => {
  assert.equal(extractKeyIdFromP8Path('/AuthKey_NOPE/actual-file.p8'), '')
})
