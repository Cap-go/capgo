#!/usr/bin/env node
// Frame-fit tests for the iOS "import existing credentials" sub-flow step
// components (src/build/onboarding/ui/steps/ios-import.tsx). Renders each step
// body × each meaningful state variant through the shared harness and asserts
// it fits the 16-row contract's body budget (13 rows) at every reference width
// (80 + 60 cols). The list/picker steps are exercised at realistic worst cases
// (10+ rows, long names) since their `Select` is what most threatens the budget.
// Shape copied from test-frame-fit-ios-credentials.mjs (the batch exemplar).
import React from 'react'
import {
  ImportCompilingHelperStep,
  ImportCreateProfileOnlyStep,
  ImportDistributionModeStep,
  ImportExportWarningStep,
  ImportExportingStep,
  ImportFetchingProfileStep,
  ImportNoMatchRecoveryStep,
  ImportPickIdentityStep,
  ImportPickProfileStep,
  ImportScanningStep,
} from '../src/build/onboarding/ui/steps/ios-import.tsx'
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

// A realistic worst-case identity name (long team name + Team ID) so option
// rows are as wide as they get, and a long bundle id so the pick-profile rows
// wrap hardest at 60 cols.
const LONG_IDENTITY = 'Apple Distribution: Acme Enterprise Holdings International Inc. (A1B2C3D4E5)'
const LONG_BUNDLE = 'com.acme.enterprise.internal.mobile.companion.app'

// Builds the EXACT identity option rows app.tsx produces: one row per identity
// (with the "no matching profiles" long variant when count===0) + a cancel row.
function makeIdentityOptions(count, { noMatch = false } = {}) {
  const opts = []
  for (let i = 0; i < count; i++) {
    const matchCount = noMatch ? 0 : i + 1
    const label = matchCount > 0
      ? `🔑  ${LONG_IDENTITY} · ${matchCount} matching profile${matchCount === 1 ? '' : 's'}`
      : `🔑  ${LONG_IDENTITY} · ⚠ no matching profiles on this Mac (recovery available)`
    opts.push({ label, value: `sha1-${i}` })
  }
  opts.push({ label: '↩️   Cancel and use Create new instead', value: '__cancel__' })
  return opts
}

// Builds the EXACT profile option rows app.tsx produces + the back row.
function makeProfileOptions(count) {
  const opts = []
  for (let i = 0; i < count; i++) {
    opts.push({
      label: `📜  Acme App Store Profile ${i + 1} · bundle ${LONG_BUNDLE} · app_store · expires 2027-01-15`,
      value: `uuid-${i}`,
    })
  }
  opts.push({ label: '↩️   Back to identity selection', value: '__back__' })
  return opts
}

// Builds the EXACT recovery option rows app.tsx produces (the longest, no-ASC
// label variants + create row, which only appears when create is allowed).
function makeRecoveryOptions({ withCreate = true } = {}) {
  return [
    { label: `🌐  Open Apple Developer Portal (download manually, then re-scan)`, value: 'browser' },
    { label: `🔍  Provide ASC API key, then fetch profile from Apple`, value: 'fetch' },
    ...(withCreate
      ? [{ label: `✨  Provide ASC API key, then create a new App Store profile for this cert`, value: 'create' }]
      : []),
    { label: '↩️   Back to identity selection', value: 'back' },
  ]
}

// ── Static spinner steps (each must trivially fit, but assert anyway so a
//    future copy change can't silently blow the budget). ────────────────────
const spinnerSteps = [
  ['import-scanning', h(ImportScanningStep)],
  ['import-fetching-profile', h(ImportFetchingProfileStep)],
  ['import-create-profile-only', h(ImportCreateProfileOnlyStep)],
  ['import-compiling-helper', h(ImportCompilingHelperStep)],
  ['import-exporting', h(ImportExportingStep)],
]
for (const [label, el] of spinnerSteps) {
  test(`${label} fits ${BODY_BUDGET_ROWS}-row body budget`, () => {
    assertFitsBudget(el, label)
  })
}

// ── import-distribution-mode ──────────────────────────────────────────────────
test(`import-distribution-mode fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(ImportDistributionModeStep, { onChange: noop }), 'import-distribution-mode')
})

// ── import-pick-identity — realistic & worst-case identity counts ─────────────
test('import-pick-identity [1 identity] fits budget', () => {
  assertFitsBudget(
    h(ImportPickIdentityStep, { identityCount: 1, options: makeIdentityOptions(1), onChange: noop }),
    'import-pick-identity-1',
  )
})
test('import-pick-identity [12 identities, long names] fits budget', () => {
  assertFitsBudget(
    h(ImportPickIdentityStep, { identityCount: 12, options: makeIdentityOptions(12), onChange: noop }),
    'import-pick-identity-12',
  )
})
test('import-pick-identity [12 identities, all no-match long labels] fits budget', () => {
  assertFitsBudget(
    h(ImportPickIdentityStep, {
      identityCount: 12,
      options: makeIdentityOptions(12, { noMatch: true }),
      onChange: noop,
    }),
    'import-pick-identity-12-nomatch',
  )
})

// ── import-pick-profile — small, worst-case, and with dropped hint ────────────
test('import-pick-profile [2 profiles, no dropped] fits budget', () => {
  assertFitsBudget(
    h(ImportPickProfileStep, {
      matchedCount: 2,
      droppedCount: 0,
      distribution: 'app_store',
      options: makeProfileOptions(2),
      onChange: noop,
    }),
    'import-pick-profile-2',
  )
})
test('import-pick-profile [12 profiles + dropped hint, ad_hoc] fits budget', () => {
  assertFitsBudget(
    h(ImportPickProfileStep, {
      matchedCount: 12,
      droppedCount: 7,
      distribution: 'ad_hoc',
      options: makeProfileOptions(12),
      onChange: noop,
    }),
    'import-pick-profile-12',
  )
})
test('import-pick-profile [no distribution known] fits budget', () => {
  assertFitsBudget(
    h(ImportPickProfileStep, {
      matchedCount: 1,
      droppedCount: 0,
      distribution: null,
      options: makeProfileOptions(1),
      onChange: noop,
    }),
    'import-pick-profile-null-dist',
  )
})

// ── import-no-match-recovery — long identity name + all option variants ───────
test('import-no-match-recovery [4 options, long labels] fits budget', () => {
  assertFitsBudget(
    h(ImportNoMatchRecoveryStep, {
      identityName: LONG_IDENTITY,
      options: makeRecoveryOptions({ withCreate: true }),
      onChange: noop,
    }),
    'import-no-match-recovery-create',
  )
})
test('import-no-match-recovery [ad_hoc: no create option] fits budget', () => {
  assertFitsBudget(
    h(ImportNoMatchRecoveryStep, {
      identityName: LONG_IDENTITY,
      options: makeRecoveryOptions({ withCreate: false }),
      onChange: noop,
    }),
    'import-no-match-recovery-no-create',
  )
})

// ── import-export-warning — short and long identity names ─────────────────────
test('import-export-warning [short identity] fits budget', () => {
  assertFitsBudget(
    h(ImportExportWarningStep, { identityName: 'Apple Distribution: X (Y)', onChange: noop }),
    'import-export-warning-short',
  )
})
test('import-export-warning [long identity] fits budget', () => {
  assertFitsBudget(
    h(ImportExportWarningStep, { identityName: LONG_IDENTITY, onChange: noop }),
    'import-export-warning-long',
  )
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
