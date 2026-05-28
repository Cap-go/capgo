#!/usr/bin/env node
// Frame-fit tests for the Android service-account / Google sign-in / GCP /
// Play-developer onboarding steps (Phase 2–5). Renders each step component ×
// each meaningful state variant via the shared harness and asserts it fits the
// 16-row contract's body budget (13 rows) at every reference width (80 and 60
// cols).
//
// Adaptive spacing: each body renders its COMFORTABLE form by default (boxed
// Alert banners + blank-line spacing + full copy + un-capped lists) and
// collapses to a terse, budget-fitting DENSE form when the parent passes
// `dense`. The 13-row budget is the floor we must survive on short terminals —
// it bounds the DENSE form only. The comfortable form is allowed to exceed it
// (the parent renders it only after measuring that it fits the viewport), so
// EVERY assertion below passes `dense: true` and asserts the dense form against
// the budget. The prop-less spinner steps (existing-picker / validating /
// projects-loading) have no spacing to collapse, so they render identically in
// both modes. Shape copied from test-frame-fit-android-keystore.mjs.
import React from 'react'
import {
  AndroidPackageSelectStep,
  GcpProjectCreateNameStep,
  GcpProjectsLoadingStep,
  GcpProjectsSelectStep,
  GcpSetupRunningStep,
  GoogleSignInLearnMoreStep,
  GoogleSignInRunningStep,
  GoogleSignInStep,
  PlayDeveloperIdActionsStep,
  PlayDeveloperIdInputStep,
  SaJsonExistingPathStep,
  SaJsonExistingPickerStep,
  SaJsonValidatingStep,
  SaJsonValidationFailedStep,
  ServiceAccountMethodSelectStep,
} from '../src/build/onboarding/ui/steps/android-sa-gcp.tsx'
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

const PLAY_DEVELOPERS_URL = 'https://play.google.com/console/u/0/developers/'

// ── service-account-method-select ────────────────────────────────────────────
test(`service-account-method-select [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(ServiceAccountMethodSelectStep, { onChoose: noop, dense: true }), 'service-account-method-select-dense')
})

// ── sa-json-existing-path — chooser + manual variants ─────────────────────────
test(`sa-json-existing-path [dense, chooser] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(SaJsonExistingPathStep, {
      showChooser: true,
      onChoosePicker: noop,
      onChooseManual: noop,
      onSubmitPath: noop,
      dense: true,
    }),
    'sa-json-existing-path-dense-chooser',
  )
})
test(`sa-json-existing-path [dense, manual] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(SaJsonExistingPathStep, {
      showChooser: false,
      onChoosePicker: noop,
      onChooseManual: noop,
      onSubmitPath: noop,
      dense: true,
    }),
    'sa-json-existing-path-dense-manual',
  )
})

// ── sa-json-existing-picker (spinner) ─────────────────────────────────────────
test(`sa-json-existing-picker [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(SaJsonExistingPickerStep), 'sa-json-existing-picker-dense')
})

// ── sa-json-validating (spinner) ──────────────────────────────────────────────
test(`sa-json-validating [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(SaJsonValidatingStep), 'sa-json-validating-dense')
})

// ── sa-json-validation-failed — short + long (worst-case) messages ────────────
// In dense mode the failure is one red line + a 3-row-capped Select, so even a
// long backend message can't push the recovery control off-screen.
test(`sa-json-validation-failed [dense, short msg] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(SaJsonValidationFailedStep, { message: 'Invalid JSON: missing private_key.', onChoose: noop, dense: true }),
    'sa-json-validation-failed-dense-short',
  )
})
test(`sa-json-validation-failed [dense, long msg] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  const message
    = 'The service account is valid but has no access to this app in the Play Console. '
    + 'Invite capgo-native-build@your-project.iam.gserviceaccount.com under Users and permissions, '
    + 'grant release access, then retry. (HTTP 403 from androidpublisher.edits.insert)'
  assertFitsBudget(
    h(SaJsonValidationFailedStep, { message, onChoose: noop, dense: true }),
    'sa-json-validation-failed-dense-long',
  )
})

// ── google-sign-in — pre-consent instructions (verbose) ───────────────────────
test(`google-sign-in [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GoogleSignInStep, { onChoose: noop, dense: true }), 'google-sign-in-dense')
})

// ── google-sign-in — learn-more (the historical worst offender) ───────────────
test(`google-sign-in [dense, learn-more] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GoogleSignInLearnMoreStep, { onBack: noop, dense: true }), 'google-sign-in-learn-more-dense')
})

// ── google-sign-in-running — no status, few lines, many lines ─────────────────
// In dense mode the status stream is tailed, so a long stream stays in budget.
test(`google-sign-in-running [dense, no status] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GoogleSignInRunningStep, { statusMessages: [], dense: true }), 'google-sign-in-running-dense-empty')
})
test(`google-sign-in-running [dense, 3 lines] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(GoogleSignInRunningStep, {
      statusMessages: ['Opening browser…', 'Waiting for consent…', 'Exchanging code…'],
      dense: true,
    }),
    'google-sign-in-running-dense-3',
  )
})
test(`google-sign-in-running [dense, 10 lines, tailed] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  const statusMessages = Array.from({ length: 10 }, (_, i) => `Step ${i + 1}: provisioning a long-ish status line here`)
  assertFitsBudget(
    h(GoogleSignInRunningStep, { statusMessages, dense: true }),
    'google-sign-in-running-dense-10',
  )
})

// ── play-developer-id-input — actions (verbose) + input variants ──────────────
test(`play-developer-id-input [dense, actions] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(PlayDeveloperIdActionsStep, { playDeveloperUrl: PLAY_DEVELOPERS_URL, onChoose: noop, dense: true }),
    'play-developer-id-actions-dense',
  )
})
test(`play-developer-id-input [dense, input] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(PlayDeveloperIdInputStep, { onSubmit: noop, dense: true }), 'play-developer-id-input-dense')
})

// ── gcp-projects-loading (spinner) ────────────────────────────────────────────
test(`gcp-projects-loading [dense] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GcpProjectsLoadingStep), 'gcp-projects-loading-dense')
})

// ── gcp-projects-select — realistic & worst-case project counts ───────────────
// In dense mode the Select caps to LIST_VISIBLE_COUNT rows + a "+N more" hint,
// so even many projects with long names stay within budget.
function gcpOptions(count) {
  return [
    { label: '🆕  Create a new project', value: '__new__' },
    ...Array.from({ length: count }, (_, i) => ({
      label: `My Production Project ${i + 1} (my-production-project-${i + 1})`,
      value: `my-production-project-${i + 1}`,
    })),
  ]
}
test(`gcp-projects-select [dense, 2 projects] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GcpProjectsSelectStep, { options: gcpOptions(2), onChange: noop, dense: true }), 'gcp-projects-select-dense-2')
})
test(`gcp-projects-select [dense, 12 projects] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GcpProjectsSelectStep, { options: gcpOptions(12), onChange: noop, dense: true }), 'gcp-projects-select-dense-12')
})
test(`gcp-projects-select [dense, 30 projects, long names] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GcpProjectsSelectStep, { options: gcpOptions(30), onChange: noop, dense: true }), 'gcp-projects-select-dense-30')
})

// ── gcp-project-create-name — short + long default placeholder ────────────────
test(`gcp-project-create-name [dense, short default] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(GcpProjectCreateNameStep, { defaultDisplayName: 'Capgo App', onSubmit: noop, dense: true }),
    'gcp-project-create-name-dense-short',
  )
})
test(`gcp-project-create-name [dense, long default] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(GcpProjectCreateNameStep, { defaultDisplayName: 'Capgo Native Build com.companyname.product', onSubmit: noop, dense: true }),
    'gcp-project-create-name-dense-long',
  )
})

// ── android-package-select — chooser (realistic & worst-case) + manual ────────
// In dense mode the detected list caps to LIST_VISIBLE_COUNT rows + a "+N more"
// hint, so many long package names stay within budget.
function packageOptions(count) {
  return [
    ...Array.from({ length: count }, (_, i) => ({
      label: `📦  com.companyname.product.flavor.variant${i + 1}`,
      value: `com.companyname.product.flavor.variant${i + 1}`,
    })),
    { label: '✍️   Type a different package name', value: '__manual__' },
  ]
}
test(`android-package-select [dense, chooser, 2 detected] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AndroidPackageSelectStep, {
      showChooser: true,
      detectedOptions: packageOptions(2),
      detectedCount: 2,
      androidDir: 'android',
      onChooseDetected: noop,
      onSubmitManual: noop,
      dense: true,
    }),
    'android-package-select-dense-chooser-2',
  )
})
test(`android-package-select [dense, chooser, 12 detected] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AndroidPackageSelectStep, {
      showChooser: true,
      detectedOptions: packageOptions(12),
      detectedCount: 12,
      androidDir: 'android',
      onChooseDetected: noop,
      onSubmitManual: noop,
      dense: true,
    }),
    'android-package-select-dense-chooser-12',
  )
})
test(`android-package-select [dense, manual] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AndroidPackageSelectStep, {
      showChooser: false,
      detectedOptions: [],
      detectedCount: 0,
      androidDir: 'android',
      onChooseDetected: noop,
      onSubmitManual: noop,
      dense: true,
    }),
    'android-package-select-dense-manual',
  )
})

// ── gcp-setup-running — no status, few lines, many lines ──────────────────────
// In dense mode the provisioning stream is tailed, so a long stream stays in
// budget.
test(`gcp-setup-running [dense, no status] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GcpSetupRunningStep, { statusMessages: [], dense: true }), 'gcp-setup-running-dense-empty')
})
test(`gcp-setup-running [dense, 10 lines, tailed] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  const statusMessages = Array.from({ length: 10 }, (_, i) => `Provisioning step ${i + 1}: enabling API / creating SA / inviting…`)
  assertFitsBudget(h(GcpSetupRunningStep, { statusMessages, dense: true }), 'gcp-setup-running-dense-10')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
