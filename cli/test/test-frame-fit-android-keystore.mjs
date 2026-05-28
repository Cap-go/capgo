#!/usr/bin/env node
// Frame-fit tests for the Android keystore onboarding steps (Phase 1).
// Renders each step component × each meaningful state variant via the shared
// harness and asserts it fits the 16-row contract's body budget (13 rows) at
// every reference width (80 and 60 cols).
//
// Adaptive spacing: each body renders its COMFORTABLE form by default (boxed
// Alert banners + blank-line spacing + full copy + un-capped lists) and
// collapses to a terse, budget-fitting DENSE form when the parent passes
// `dense`. The 13-row budget is the floor we must survive on short terminals —
// it bounds the DENSE form only. The comfortable form is allowed to exceed it
// (the parent renders it only after measuring that it fits the viewport), so
// EVERY assertion below passes `dense: true` and asserts the dense form against
// the budget. The prop-less spinner steps (existing-picker / detecting-alias /
// generating) have no spacing to collapse, so they render identically in both
// modes.
import React from 'react'
import {
  KeystoreExistingAliasSelectStep,
  KeystoreExistingAliasStep,
  KeystoreExistingDetectingAliasStep,
  KeystoreExistingKeyPasswordStep,
  KeystoreExistingPathStep,
  KeystoreExistingPickerStep,
  KeystoreExistingStorePasswordStep,
  KeystoreExplainerStep,
  KeystoreGeneratingStep,
  KeystoreMethodSelectStep,
  KeystoreNewAliasStep,
  KeystoreNewCommonNameStep,
  KeystoreNewKeyPasswordStep,
  KeystoreNewPasswordMethodStep,
  KeystoreNewStorePasswordStep,
} from '../src/build/onboarding/ui/steps/android-keystore.tsx'
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

// ── keystore-method-select ──────────────────────────────────────────────────
test(`keystore-method-select [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreMethodSelectStep, { onChoose: noop, dense: true }), 'keystore-method-select-dense')
})

// ── keystore-explainer (full text — the historical worst offender) ───────────
test(`keystore-explainer [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreExplainerStep, { onBack: noop, dense: true }), 'keystore-explainer-dense')
})

// ── keystore-existing-path — chooser variant ─────────────────────────────────
test(`keystore-existing-path [dense, chooser] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreExistingPathStep, {
      showChooser: true,
      onChoosePicker: noop,
      onChooseManual: noop,
      onSubmitPath: noop,
      dense: true,
    }),
    'keystore-existing-path-dense-chooser',
  )
})

// ── keystore-existing-path — manual text-input variant ───────────────────────
test(`keystore-existing-path [dense, manual] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreExistingPathStep, {
      showChooser: false,
      onChoosePicker: noop,
      onChooseManual: noop,
      onSubmitPath: noop,
      dense: true,
    }),
    'keystore-existing-path-dense-manual',
  )
})

// ── keystore-existing-picker (spinner) ───────────────────────────────────────
test(`keystore-existing-picker [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreExistingPickerStep), 'keystore-existing-picker-dense')
})

// ── keystore-existing-store-password ─────────────────────────────────────────
test(`keystore-existing-store-password [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreExistingStorePasswordStep, { onSubmit: noop, dense: true }),
    'keystore-existing-store-password-dense',
  )
})

// ── keystore-existing-detecting-alias (spinner) ──────────────────────────────
test(`keystore-existing-detecting-alias [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreExistingDetectingAliasStep), 'keystore-existing-detecting-alias-dense')
})

// ── keystore-existing-alias-select — realistic & worst-case alias counts ─────
// In dense mode the Select caps to ALIAS_VISIBLE_COUNT rows + a "+N more" hint,
// so even a long list of long alias names stays within budget.
test(`keystore-existing-alias-select [dense, 2 aliases] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreExistingAliasSelectStep, { aliases: ['release', 'upload'], onSelect: noop, dense: true }),
    'keystore-existing-alias-select-dense-2',
  )
})
test(`keystore-existing-alias-select [dense, 8 aliases] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  const aliases = ['release', 'upload', 'debug', 'staging', 'beta', 'androiddebugkey', 'legacy-2019', 'ci-signing']
  assertFitsBudget(
    h(KeystoreExistingAliasSelectStep, { aliases, onSelect: noop, dense: true }),
    'keystore-existing-alias-select-dense-8',
  )
})
test(`keystore-existing-alias-select [dense, 15 aliases, long names] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  const aliases = Array.from({ length: 15 }, (_, i) => `my-very-long-keystore-alias-name-number-${i + 1}`)
  assertFitsBudget(
    h(KeystoreExistingAliasSelectStep, { aliases, onSelect: noop, dense: true }),
    'keystore-existing-alias-select-dense-15',
  )
})

// ── keystore-existing-alias (manual entry) ───────────────────────────────────
test(`keystore-existing-alias [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreExistingAliasStep, { onSubmit: noop, dense: true }), 'keystore-existing-alias-dense')
})

// ── keystore-existing-key-password — probing (spinner) + prompt variants ─────
test(`keystore-existing-key-password [dense, probing] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreExistingKeyPasswordStep, { mode: 'probing', onSubmit: noop, dense: true }),
    'keystore-existing-key-password-dense-probing',
  )
})
test(`keystore-existing-key-password [dense, prompt] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreExistingKeyPasswordStep, { mode: 'prompt', onSubmit: noop, dense: true }),
    'keystore-existing-key-password-dense-prompt',
  )
})

// ── keystore-new-alias ───────────────────────────────────────────────────────
test(`keystore-new-alias [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreNewAliasStep, { onSubmit: noop, dense: true }), 'keystore-new-alias-dense')
})

// ── keystore-new-password-method ─────────────────────────────────────────────
test(`keystore-new-password-method [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreNewPasswordMethodStep, { onChoose: noop, dense: true }),
    'keystore-new-password-method-dense',
  )
})

// ── keystore-new-store-password ──────────────────────────────────────────────
test(`keystore-new-store-password [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreNewStorePasswordStep, { onSubmit: noop, dense: true }),
    'keystore-new-store-password-dense',
  )
})

// ── keystore-new-key-password ────────────────────────────────────────────────
test(`keystore-new-key-password [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreNewKeyPasswordStep, { onSubmit: noop, dense: true }), 'keystore-new-key-password-dense')
})

// ── keystore-new-cn — short and long app ids (placeholder width) ─────────────
test(`keystore-new-cn [dense, short appId] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreNewCommonNameStep, { appId: 'com.x.y', onSubmit: noop, dense: true }),
    'keystore-new-cn-dense-short',
  )
})
test(`keystore-new-cn [dense, long appId] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreNewCommonNameStep, {
      appId: 'com.companyname.product.flavor.staging.internal',
      onSubmit: noop,
      dense: true,
    }),
    'keystore-new-cn-dense-long',
  )
})

// ── keystore-generating (spinner) ────────────────────────────────────────────
test(`keystore-generating [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreGeneratingStep), 'keystore-generating-dense')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
