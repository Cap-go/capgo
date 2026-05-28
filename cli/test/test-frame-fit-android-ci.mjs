#!/usr/bin/env node
// Frame-fit tests for the Android CI-secrets + save sub-flow onboarding steps
// (Phase 6). Renders each step component × each meaningful state variant via
// the shared harness and asserts it fits the 16-row contract's body budget
// (13 rows) at every reference width (80 and 60 cols). Shape copied from
// test-frame-fit-android-sa-gcp.mjs. Worst-case variants exercise the list-
// bearing steps with realistic large inputs (6+ providers / existing keys) so
// a regression that drops the capping logic is caught.
import React from 'react'
import {
  AskBuildStep,
  AskCiSecretsStep,
  CheckingCiSecretsStep,
  CiSecretsFailedStep,
  CiSecretsSetupStep,
  CiSecretsTargetSelectStep,
  ConfirmCiSecretOverwriteStep,
  DetectingCiSecretsStep,
  SavingCredentialsStep,
  UploadingCiSecretsStep,
} from '../src/build/onboarding/ui/steps/android-ci.tsx'
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

const GITHUB_TARGET = { provider: 'github', label: 'GitHub Actions repository secrets', cli: 'gh' }
const GITLAB_TARGET = { provider: 'gitlab', label: 'GitLab CI/CD variables', cli: 'glab' }

// ── saving-credentials (spinner) ──────────────────────────────────────────────
test(`saving-credentials fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(SavingCredentialsStep), 'saving-credentials')
})

// ── detecting-ci-secrets (spinner) ────────────────────────────────────────────
test(`detecting-ci-secrets fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(DetectingCiSecretsStep), 'detecting-ci-secrets')
})

// ── ci-secrets-setup — single, both providers, worst-case advice ──────────────
// The "not-installed" reason yields a 2-command advice (install URL + auth);
// two providers each with that advice is the realistic worst case.
function setupAdvice(count) {
  const providers = [
    {
      target: GITHUB_TARGET,
      reason: 'not-installed',
      message: 'GitHub CLI (gh) is not installed or not authenticated.',
      commands: ['Install GitHub CLI: https://cli.github.com/', 'gh auth login'],
    },
    {
      target: GITLAB_TARGET,
      reason: 'not-installed',
      message: 'GitLab CLI (glab) is not installed or not authenticated.',
      commands: ['Install GitLab CLI: https://gitlab.com/gitlab-org/cli#installation', 'glab auth login'],
    },
  ]
  return providers.slice(0, count)
}
test(`ci-secrets-setup [1 provider] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(CiSecretsSetupStep, { advice: setupAdvice(1), onChoose: noop }), 'ci-secrets-setup-1')
})
test(`ci-secrets-setup [2 providers] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(CiSecretsSetupStep, { advice: setupAdvice(2), onChoose: noop }), 'ci-secrets-setup-2')
})
test(`ci-secrets-setup [empty advice] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(CiSecretsSetupStep, { advice: [], onChoose: noop }), 'ci-secrets-setup-empty')
})

// ── ci-secrets-target-select — realistic & padded option lists ────────────────
function targetOptions(count) {
  const base = [
    { label: 'GitHub Actions repository secrets', value: 'github' },
    { label: 'GitLab CI/CD variables', value: 'gitlab' },
  ]
  const extra = Array.from({ length: Math.max(0, count - 2) }, (_, i) => ({
    label: `Other CI provider ${i + 1} variables`,
    value: `other-${i + 1}`,
  }))
  return [...base.slice(0, count), ...extra, { label: 'Skip', value: 'skip' }]
}
test(`ci-secrets-target-select [github only] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(CiSecretsTargetSelectStep, { options: targetOptions(1), onChange: noop }), 'ci-secrets-target-select-1')
})
test(`ci-secrets-target-select [both providers] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(CiSecretsTargetSelectStep, { options: targetOptions(2), onChange: noop }), 'ci-secrets-target-select-2')
})
test(`ci-secrets-target-select [8 providers, capped] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(CiSecretsTargetSelectStep, { options: targetOptions(8), onChange: noop }), 'ci-secrets-target-select-8')
})

// ── ask-ci-secrets — singular, plural, large count, long target label ─────────
test(`ask-ci-secrets [1 var, github] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AskCiSecretsStep, { entryCount: 1, targetLabel: GITHUB_TARGET.label, cli: 'gh', onChoose: noop }),
    'ask-ci-secrets-1',
  )
})
test(`ask-ci-secrets [12 vars, gitlab] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AskCiSecretsStep, { entryCount: 12, targetLabel: GITLAB_TARGET.label, cli: 'glab', onChoose: noop }),
    'ask-ci-secrets-12',
  )
})

// ── checking-ci-secrets (spinner) — short + long label ────────────────────────
test(`checking-ci-secrets [github] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(CheckingCiSecretsStep, { targetLabel: GITHUB_TARGET.label }), 'checking-ci-secrets-github')
})
test(`checking-ci-secrets [fallback label] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(CheckingCiSecretsStep, { targetLabel: 'your git hosting platform' }), 'checking-ci-secrets-fallback')
})

// ── confirm-ci-secret-overwrite — realistic & worst-case key lists ────────────
function existingKeys(count) {
  return Array.from({ length: count }, (_, i) => `CAPGO_BUILD_ENV_VARIABLE_NAME_${i + 1}`)
}
test(`confirm-ci-secret-overwrite [1 key] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(ConfirmCiSecretOverwriteStep, { existingKeys: existingKeys(1), onChoose: noop }), 'confirm-ci-secret-overwrite-1')
})
test(`confirm-ci-secret-overwrite [6 keys] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(ConfirmCiSecretOverwriteStep, { existingKeys: existingKeys(6), onChoose: noop }), 'confirm-ci-secret-overwrite-6')
})
test(`confirm-ci-secret-overwrite [20 keys, capped] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(ConfirmCiSecretOverwriteStep, { existingKeys: existingKeys(20), onChoose: noop }), 'confirm-ci-secret-overwrite-20')
})

// ── uploading-ci-secrets (spinner) ────────────────────────────────────────────
test(`uploading-ci-secrets fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(UploadingCiSecretsStep, { targetLabel: GITLAB_TARGET.label }), 'uploading-ci-secrets')
})

// ── ci-secrets-failed (error) — null, short, long stderr ──────────────────────
test(`ci-secrets-failed [null error] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(CiSecretsFailedStep, { error: null, onChoose: noop }), 'ci-secrets-failed-null')
})
test(`ci-secrets-failed [short error] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(CiSecretsFailedStep, { error: 'gh: not authenticated.', onChoose: noop }), 'ci-secrets-failed-short')
})
test(`ci-secrets-failed [long error] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  const error
    = 'glab variable set failed: HTTP 403 Forbidden — the token does not have '
    + 'the api scope required to write CI/CD variables on this project. Re-run '
    + 'glab auth login with the api scope, then retry the upload from this wizard.'
  assertFitsBudget(h(CiSecretsFailedStep, { error, onChoose: noop }), 'ci-secrets-failed-long')
})

// ── ask-build ─────────────────────────────────────────────────────────────────
test(`ask-build fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(AskBuildStep, { onChoose: noop }), 'ask-build')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
