#!/usr/bin/env node
// Frame-fit tests for the Android keystore onboarding steps (Phase 1).
// Renders each step component × each meaningful state variant via the shared
// harness and asserts it fits the 16-row contract's body budget (13 rows) at
// every reference width (80 and 60 cols). Shape copied from
// test-frame-fit-ai.mjs (the batch exemplar).
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
test(`keystore-method-select fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreMethodSelectStep, { onChoose: noop }), 'keystore-method-select')
})

// ── keystore-explainer (full text — the historical worst offender) ───────────
test(`keystore-explainer fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreExplainerStep, { onBack: noop }), 'keystore-explainer')
})

// ── keystore-existing-path — chooser variant ─────────────────────────────────
test(`keystore-existing-path [chooser] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreExistingPathStep, {
      showChooser: true,
      onChoosePicker: noop,
      onChooseManual: noop,
      onSubmitPath: noop,
    }),
    'keystore-existing-path-chooser',
  )
})

// ── keystore-existing-path — manual text-input variant ───────────────────────
test(`keystore-existing-path [manual] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreExistingPathStep, {
      showChooser: false,
      onChoosePicker: noop,
      onChooseManual: noop,
      onSubmitPath: noop,
    }),
    'keystore-existing-path-manual',
  )
})

// ── keystore-existing-picker (spinner) ───────────────────────────────────────
test(`keystore-existing-picker fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreExistingPickerStep), 'keystore-existing-picker')
})

// ── keystore-existing-store-password ─────────────────────────────────────────
test(`keystore-existing-store-password fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreExistingStorePasswordStep, { onSubmit: noop }), 'keystore-existing-store-password')
})

// ── keystore-existing-detecting-alias (spinner) ──────────────────────────────
test(`keystore-existing-detecting-alias fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreExistingDetectingAliasStep), 'keystore-existing-detecting-alias')
})

// ── keystore-existing-alias-select — realistic & worst-case alias counts ─────
test(`keystore-existing-alias-select [2 aliases] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreExistingAliasSelectStep, { aliases: ['release', 'upload'], onSelect: noop }),
    'keystore-existing-alias-select-2',
  )
})
test(`keystore-existing-alias-select [8 aliases] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  const aliases = ['release', 'upload', 'debug', 'staging', 'beta', 'androiddebugkey', 'legacy-2019', 'ci-signing']
  assertFitsBudget(
    h(KeystoreExistingAliasSelectStep, { aliases, onSelect: noop }),
    'keystore-existing-alias-select-8',
  )
})
test(`keystore-existing-alias-select [15 aliases, long names] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  const aliases = Array.from({ length: 15 }, (_, i) => `my-very-long-keystore-alias-name-number-${i + 1}`)
  assertFitsBudget(
    h(KeystoreExistingAliasSelectStep, { aliases, onSelect: noop }),
    'keystore-existing-alias-select-15',
  )
})

// ── keystore-existing-alias (manual entry) ───────────────────────────────────
test(`keystore-existing-alias fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreExistingAliasStep, { onSubmit: noop }), 'keystore-existing-alias')
})

// ── keystore-existing-key-password — probing (spinner) + prompt variants ─────
test(`keystore-existing-key-password [probing] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreExistingKeyPasswordStep, { mode: 'probing', onSubmit: noop }),
    'keystore-existing-key-password-probing',
  )
})
test(`keystore-existing-key-password [prompt] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreExistingKeyPasswordStep, { mode: 'prompt', onSubmit: noop }),
    'keystore-existing-key-password-prompt',
  )
})

// ── keystore-new-alias ───────────────────────────────────────────────────────
test(`keystore-new-alias fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreNewAliasStep, { onSubmit: noop }), 'keystore-new-alias')
})

// ── keystore-new-password-method ─────────────────────────────────────────────
test(`keystore-new-password-method fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreNewPasswordMethodStep, { onChoose: noop }), 'keystore-new-password-method')
})

// ── keystore-new-store-password ──────────────────────────────────────────────
test(`keystore-new-store-password fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreNewStorePasswordStep, { onSubmit: noop }), 'keystore-new-store-password')
})

// ── keystore-new-key-password ────────────────────────────────────────────────
test(`keystore-new-key-password fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreNewKeyPasswordStep, { onSubmit: noop }), 'keystore-new-key-password')
})

// ── keystore-new-cn — short and long app ids (placeholder width) ─────────────
test(`keystore-new-cn [short appId] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreNewCommonNameStep, { appId: 'com.x.y', onSubmit: noop }), 'keystore-new-cn-short')
})
test(`keystore-new-cn [long appId] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(KeystoreNewCommonNameStep, { appId: 'com.companyname.product.flavor.staging.internal', onSubmit: noop }),
    'keystore-new-cn-long',
  )
})

// ── keystore-generating (spinner) ────────────────────────────────────────────
test(`keystore-generating fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(KeystoreGeneratingStep), 'keystore-generating')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
