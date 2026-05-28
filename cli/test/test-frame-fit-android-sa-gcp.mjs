#!/usr/bin/env node
// Frame-fit tests for the Android service-account / Google sign-in / GCP /
// Play-developer onboarding steps (Phase 2–5). Renders each step component ×
// each meaningful state variant via the shared harness and asserts it fits the
// 16-row contract's body budget (13 rows) at every reference width (80 and 60
// cols). Shape copied from test-frame-fit-android-keystore.mjs.
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
test(`service-account-method-select fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(ServiceAccountMethodSelectStep, { onChoose: noop }), 'service-account-method-select')
})

// ── sa-json-existing-path — chooser + manual variants ─────────────────────────
test(`sa-json-existing-path [chooser] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(SaJsonExistingPathStep, {
      showChooser: true,
      onChoosePicker: noop,
      onChooseManual: noop,
      onSubmitPath: noop,
    }),
    'sa-json-existing-path-chooser',
  )
})
test(`sa-json-existing-path [manual] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(SaJsonExistingPathStep, {
      showChooser: false,
      onChoosePicker: noop,
      onChooseManual: noop,
      onSubmitPath: noop,
    }),
    'sa-json-existing-path-manual',
  )
})

// ── sa-json-existing-picker (spinner) ─────────────────────────────────────────
test(`sa-json-existing-picker fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(SaJsonExistingPickerStep), 'sa-json-existing-picker')
})

// ── sa-json-validating (spinner) ──────────────────────────────────────────────
test(`sa-json-validating fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(SaJsonValidatingStep), 'sa-json-validating')
})

// ── sa-json-validation-failed — short + long (worst-case) messages ────────────
test(`sa-json-validation-failed [short msg] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(SaJsonValidationFailedStep, { message: 'Invalid JSON: missing private_key.', onChoose: noop }),
    'sa-json-validation-failed-short',
  )
})
test(`sa-json-validation-failed [long msg] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  const message
    = 'The service account is valid but has no access to this app in the Play Console. '
    + 'Invite capgo-native-build@your-project.iam.gserviceaccount.com under Users and permissions, '
    + 'grant release access, then retry. (HTTP 403 from androidpublisher.edits.insert)'
  assertFitsBudget(
    h(SaJsonValidationFailedStep, { message, onChoose: noop }),
    'sa-json-validation-failed-long',
  )
})

// ── google-sign-in — pre-consent instructions (verbose) ───────────────────────
test(`google-sign-in fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GoogleSignInStep, { onChoose: noop }), 'google-sign-in')
})

// ── google-sign-in — learn-more (the historical worst offender) ───────────────
test(`google-sign-in [learn-more] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GoogleSignInLearnMoreStep, { onBack: noop }), 'google-sign-in-learn-more')
})

// ── google-sign-in-running — no status, few lines, many lines ─────────────────
test(`google-sign-in-running [no status] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GoogleSignInRunningStep, { statusMessages: [] }), 'google-sign-in-running-empty')
})
test(`google-sign-in-running [3 lines] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(GoogleSignInRunningStep, {
      statusMessages: ['Opening browser…', 'Waiting for consent…', 'Exchanging code…'],
    }),
    'google-sign-in-running-3',
  )
})
test(`google-sign-in-running [10 lines, tailed] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  const statusMessages = Array.from({ length: 10 }, (_, i) => `Step ${i + 1}: provisioning a long-ish status line here`)
  assertFitsBudget(
    h(GoogleSignInRunningStep, { statusMessages }),
    'google-sign-in-running-10',
  )
})

// ── play-developer-id-input — actions (verbose) + input variants ──────────────
test(`play-developer-id-input [actions] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(PlayDeveloperIdActionsStep, { playDeveloperUrl: PLAY_DEVELOPERS_URL, onChoose: noop }),
    'play-developer-id-actions',
  )
})
test(`play-developer-id-input [input] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(PlayDeveloperIdInputStep, { onSubmit: noop }), 'play-developer-id-input')
})

// ── gcp-projects-loading (spinner) ────────────────────────────────────────────
test(`gcp-projects-loading fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GcpProjectsLoadingStep), 'gcp-projects-loading')
})

// ── gcp-projects-select — realistic & worst-case project counts ───────────────
function gcpOptions(count) {
  return [
    { label: '🆕  Create a new project', value: '__new__' },
    ...Array.from({ length: count }, (_, i) => ({
      label: `My Production Project ${i + 1} (my-production-project-${i + 1})`,
      value: `my-production-project-${i + 1}`,
    })),
  ]
}
test(`gcp-projects-select [2 projects] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GcpProjectsSelectStep, { options: gcpOptions(2), onChange: noop }), 'gcp-projects-select-2')
})
test(`gcp-projects-select [12 projects] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GcpProjectsSelectStep, { options: gcpOptions(12), onChange: noop }), 'gcp-projects-select-12')
})
test(`gcp-projects-select [30 projects, long names] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GcpProjectsSelectStep, { options: gcpOptions(30), onChange: noop }), 'gcp-projects-select-30')
})

// ── gcp-project-create-name — short + long default placeholder ────────────────
test(`gcp-project-create-name [short default] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(GcpProjectCreateNameStep, { defaultDisplayName: 'Capgo App', onSubmit: noop }),
    'gcp-project-create-name-short',
  )
})
test(`gcp-project-create-name [long default] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(GcpProjectCreateNameStep, { defaultDisplayName: 'Capgo Native Build com.companyname.product', onSubmit: noop }),
    'gcp-project-create-name-long',
  )
})

// ── android-package-select — chooser (realistic & worst-case) + manual ────────
function packageOptions(count) {
  return [
    ...Array.from({ length: count }, (_, i) => ({
      label: `📦  com.companyname.product.flavor.variant${i + 1}`,
      value: `com.companyname.product.flavor.variant${i + 1}`,
    })),
    { label: '✍️   Type a different package name', value: '__manual__' },
  ]
}
test(`android-package-select [chooser, 2 detected] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AndroidPackageSelectStep, {
      showChooser: true,
      detectedOptions: packageOptions(2),
      detectedCount: 2,
      onChooseDetected: noop,
      onSubmitManual: noop,
    }),
    'android-package-select-chooser-2',
  )
})
test(`android-package-select [chooser, 12 detected] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AndroidPackageSelectStep, {
      showChooser: true,
      detectedOptions: packageOptions(12),
      detectedCount: 12,
      onChooseDetected: noop,
      onSubmitManual: noop,
    }),
    'android-package-select-chooser-12',
  )
})
test(`android-package-select [manual] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AndroidPackageSelectStep, {
      showChooser: false,
      detectedOptions: [],
      detectedCount: 0,
      onChooseDetected: noop,
      onSubmitManual: noop,
    }),
    'android-package-select-manual',
  )
})

// ── gcp-setup-running — no status, few lines, many lines ──────────────────────
test(`gcp-setup-running [no status] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(GcpSetupRunningStep, { statusMessages: [] }), 'gcp-setup-running-empty')
})
test(`gcp-setup-running [10 lines, tailed] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  const statusMessages = Array.from({ length: 10 }, (_, i) => `Provisioning step ${i + 1}: enabling API / creating SA / inviting…`)
  assertFitsBudget(h(GcpSetupRunningStep, { statusMessages }), 'gcp-setup-running-10')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
