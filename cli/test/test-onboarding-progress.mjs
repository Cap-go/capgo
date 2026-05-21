import assert from 'node:assert/strict'
import { getImportEntryStep, getResumeStep } from '../src/build/onboarding/progress.ts'

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
