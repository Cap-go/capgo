#!/usr/bin/env node
// Frame-fit tests for the iOS credential sub-flow step components
// (src/build/onboarding/ui/steps/ios-credentials.tsx). Renders each step body
// × each meaningful state variant through the shared harness and asserts its
// DENSE form fits the 16-row contract's body budget at every reference width
// (80 + 60). The dense form is the budget-fitting fallback the parent flips on
// when the comfortable (default) form can't fit — so EVERY assertion here
// passes `dense: true`. The comfortable form is intentionally NOT
// budget-asserted (it only renders when the parent measured that it fits).
// Spinner-only steps take no `dense` prop (identical in both forms).
// Shape copied from test-frame-fit-ai.mjs (the batch exemplar).
import React from 'react'
import {
  ApiKeyInstructionsStep,
  BackingUpStep,
  CertLimitPromptStep,
  CreatingCertificateStep,
  CreatingProfileStep,
  CredentialsExistStep,
  DeletingDuplicateProfilesStep,
  DuplicateProfilePromptStep,
  InputIssuerIdStep,
  InputKeyIdStep,
  InputP8PathStep,
  P8MethodSelectStep,
  RevokingCertificateStep,
  SavingCredentialsStep,
  SetupMethodSelectStep,
  VerifyingKeyStep,
} from '../src/build/onboarding/ui/steps/ios-credentials.tsx'
import { assertFitsBudget, BODY_BUDGET_ROWS } from './helpers/frame-fit.mjs'

let passed = 0
let failed = 0
function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`✔ ${name}`)
  }
  catch (error) {
    failed++
    console.error(`✖ ${name}\n  ${error.message}`)
  }
}

const h = React.createElement
const noop = () => {}

// A realistic worst-case bundle id (reverse-DNS, fairly long) so the
// credentials-exist heading wraps at 60 cols if the copy is too verbose.
const LONG_APP_ID = 'com.acme.enterprise.internal.mobile.companion.app'

// ── Static spinner steps (each must trivially fit, but assert anyway so a
//    future copy change can't silently blow the budget). ────────────────────
const spinnerSteps = [
  ['backing-up', h(BackingUpStep)],
  ['p8-method-select', h(P8MethodSelectStep)],
  ['verifying-key', h(VerifyingKeyStep)],
  ['creating-certificate', h(CreatingCertificateStep)],
  ['revoking-certificate', h(RevokingCertificateStep)],
  ['saving-credentials', h(SavingCredentialsStep)],
]
for (const [label, el] of spinnerSteps) {
  test(`${label} fits ${BODY_BUDGET_ROWS}-row body budget`, () => {
    assertFitsBudget(el, label)
  })
}

// ── credentials-exist ────────────────────────────────────────────────────────
test('credentials-exist (short appId, dense) fits budget', () => {
  assertFitsBudget(h(CredentialsExistStep, { appId: 'com.app', dense: true, onChange: noop }), 'credentials-exist-short')
})
test('credentials-exist (long appId, dense) fits budget', () => {
  assertFitsBudget(h(CredentialsExistStep, { appId: LONG_APP_ID, dense: true, onChange: noop }), 'credentials-exist-long')
})

// ── setup-method-select ──────────────────────────────────────────────────────
test('setup-method-select (dense) fits budget', () => {
  assertFitsBudget(h(SetupMethodSelectStep, { dense: true, onChange: noop }), 'setup-method-select')
})

// ── api-key-instructions (both control variants) ─────────────────────────────
test('api-key-instructions (file picker available, dense) fits budget', () => {
  assertFitsBudget(
    h(ApiKeyInstructionsStep, { canUseFilePicker: true, dense: true, onMethodChange: noop, onPathSubmit: noop }),
    'api-key-instructions-picker',
  )
})
test('api-key-instructions (no file picker → text input, dense) fits budget', () => {
  assertFitsBudget(
    h(ApiKeyInstructionsStep, { canUseFilePicker: false, dense: true, onMethodChange: noop, onPathSubmit: noop }),
    'api-key-instructions-manual',
  )
})

// ── input-p8-path ──────────────────────────────────────────────────────────────
test('input-p8-path fits budget', () => {
  assertFitsBudget(h(InputP8PathStep, { onSubmit: noop }), 'input-p8-path')
})

// ── input-key-id (detected vs not detected) ──────────────────────────────────
test('input-key-id (detected from filename, dense) fits budget', () => {
  assertFitsBudget(h(InputKeyIdStep, { keyId: 'ABC123DEF', dense: true, onSubmit: noop }), 'input-key-id-detected')
})
test('input-key-id (empty — manual entry, dense) fits budget', () => {
  assertFitsBudget(h(InputKeyIdStep, { keyId: '', dense: true, onSubmit: noop }), 'input-key-id-empty')
})

// ── input-issuer-id ──────────────────────────────────────────────────────────
test('input-issuer-id (dense) fits budget', () => {
  assertFitsBudget(h(InputIssuerIdStep, { dense: true, onSubmit: noop }), 'input-issuer-id')
})

// ── cert-limit-prompt ─────────────────────────────────────────────────────────
// Apple caps distribution certs at 3 — so the realistic worst case is 3 cert
// rows (one flagged as Capgo-created, with a long name) + the exit row.
function makeCertOptions(count, ours = false) {
  const opts = []
  for (let i = 0; i < count; i++) {
    const creator = ours && i === 0 ? ' · 🔧 Created by Capgo' : ''
    opts.push({
      label: `🗑️   iOS Distribution: Acme Corporation Inc. · expires 2027-01-15${creator}`,
      value: `cert-${i}`,
    })
  }
  opts.push({ label: '✖  Exit onboarding', value: '__exit__' })
  return opts
}
test('cert-limit-prompt (3 certs, worst case, dense) fits budget', () => {
  assertFitsBudget(
    h(CertLimitPromptStep, { existingCount: 3, options: makeCertOptions(3, true), dense: true, onChange: noop }),
    'cert-limit-prompt-3',
  )
})
test('cert-limit-prompt (1 cert, dense) fits budget', () => {
  assertFitsBudget(
    h(CertLimitPromptStep, { existingCount: 1, options: makeCertOptions(1), dense: true, onChange: noop }),
    'cert-limit-prompt-1',
  )
})

// ── creating-profile ──────────────────────────────────────────────────────────
test('creating-profile (long appId, dense) fits budget', () => {
  assertFitsBudget(h(CreatingProfileStep, { appId: LONG_APP_ID, dense: true }), 'creating-profile')
})

// ── duplicate-profile-prompt ─────────────────────────────────────────────────
test('duplicate-profile-prompt (dense) fits budget', () => {
  assertFitsBudget(h(DuplicateProfilePromptStep, { duplicateCount: 4, dense: true, onChange: noop }), 'duplicate-profile-prompt')
})

// ── deleting-duplicate-profiles ──────────────────────────────────────────────
test('deleting-duplicate-profiles fits budget', () => {
  assertFitsBudget(h(DeletingDuplicateProfilesStep, { duplicateCount: 4 }), 'deleting-duplicate-profiles')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
