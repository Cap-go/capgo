#!/usr/bin/env node
// Frame-fit tests for the iOS CI-secrets sub-flow step components
// (src/build/onboarding/ui/steps/ios-ci.tsx). Renders each step body × each
// meaningful state variant through the shared harness and asserts it fits the
// 16-row contract's body budget (13 rows) at every reference width (80 + 60).
// Shape copied from test-frame-fit-ios-credentials.mjs (the batch exemplar).
//
// The list-bearing / error steps get realistic worst cases: the setup step with
// BOTH providers needing install (the longest, wrapping command lines), the
// overwrite confirmation listing the full ~12-key credential set, and the
// failed step with a long multi-line backend error.
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
  UploadingCiSecretsStep,
} from '../src/build/onboarding/ui/steps/ios-ci.tsx'
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

// A realistic worst-case destination label — GitLab's is the longer of the two
// real targets; we also exercise the generic fallback ("your git hosting
// platform") which the parent passes when no target is known.
const GITHUB_TARGET = { provider: 'github', label: 'GitHub Actions repository secrets', cli: 'gh' }
const GITLAB_TARGET = { provider: 'gitlab', label: 'GitLab CI/CD variables', cli: 'glab' }
const GITHUB_LABEL = GITHUB_TARGET.label
const GITLAB_LABEL = GITLAB_TARGET.label

// Mirrors createSetupAdvice() in ci-secrets.ts — `not-installed` carries the
// longer two-line command list (the GitLab install URL wraps at 60 cols), so
// it's the budget worst case for ci-secrets-setup.
const GH_ADVICE_NOT_INSTALLED = {
  target: GITHUB_TARGET,
  reason: 'not-installed',
  message: 'GitHub CLI is needed to upload GitHub Actions secrets.',
  commands: ['Install GitHub CLI: https://cli.github.com/', 'gh auth login'],
}
const GL_ADVICE_NOT_INSTALLED = {
  target: GITLAB_TARGET,
  reason: 'not-installed',
  message: 'GitLab CLI is needed to upload GitLab CI/CD variables.',
  commands: ['Install GitLab CLI: https://gitlab.com/gitlab-org/cli#installation', 'glab auth login'],
}
const GH_ADVICE_NOT_AUTHED = {
  target: GITHUB_TARGET,
  reason: 'not-authenticated',
  message: 'GitHub CLI is installed but not logged in.',
  commands: ['gh auth login'],
}

// ── Static spinner steps ──────────────────────────────────────────────────────
test(`detecting-ci-secrets fits ${BODY_BUDGET_ROWS}-row body budget`, () => {
  assertFitsBudget(h(DetectingCiSecretsStep), 'detecting-ci-secrets')
})
test(`checking-ci-secrets fits ${BODY_BUDGET_ROWS}-row body budget`, () => {
  assertFitsBudget(h(CheckingCiSecretsStep, { targetLabel: GITLAB_LABEL }), 'checking-ci-secrets')
})
test(`uploading-ci-secrets fits ${BODY_BUDGET_ROWS}-row body budget`, () => {
  assertFitsBudget(h(UploadingCiSecretsStep, { targetLabel: GITLAB_LABEL }), 'uploading-ci-secrets')
})

// ── ci-secrets-setup — single + both providers, worst-case (not-installed) ────
test(`ci-secrets-setup [1 provider, not-authed] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(CiSecretsSetupStep, { advice: [GH_ADVICE_NOT_AUTHED], onChange: noop }),
    'ci-secrets-setup-1',
  )
})
test(`ci-secrets-setup [both providers, not-installed — worst case] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(CiSecretsSetupStep, { advice: [GH_ADVICE_NOT_INSTALLED, GL_ADVICE_NOT_INSTALLED], onChange: noop }),
    'ci-secrets-setup-both',
  )
})

// ── ci-secrets-target-select — both real targets + skip ───────────────────────
test(`ci-secrets-target-select [both targets] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(CiSecretsTargetSelectStep, {
      options: [
        { label: GITHUB_LABEL, value: 'github' },
        { label: GITLAB_LABEL, value: 'gitlab' },
        { label: 'Skip', value: 'skip' },
      ],
      onChange: noop,
    }),
    'ci-secrets-target-select',
  )
})

// ── ask-ci-secrets — singular + plural counts, long label ─────────────────────
test(`ask-ci-secrets [1 var] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AskCiSecretsStep, { entryCount: 1, target: GITHUB_TARGET, targetLabel: GITHUB_LABEL, onChange: noop }),
    'ask-ci-secrets-1',
  )
})
test(`ask-ci-secrets [12 vars, long label] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AskCiSecretsStep, { entryCount: 12, target: GITLAB_TARGET, targetLabel: GITLAB_LABEL, onChange: noop }),
    'ask-ci-secrets-12',
  )
})

// ── confirm-ci-secret-overwrite — few keys + full ~12-key credential set ──────
const ALL_CREDENTIAL_KEYS = [
  'P12_PASSWORD',
  'APPLE_KEY_CONTENT',
  'BUILD_CERTIFICATE_BASE64',
  'BUILD_PROVISION_PROFILE_BASE64',
  'CAPGO_IOS_PROVISIONING_MAP_BASE64',
  'KEYSTORE_KEY_PASSWORD',
  'KEYSTORE_STORE_PASSWORD',
  'ANDROID_KEYSTORE_FILE',
  'PLAY_CONFIG_JSON',
  'APP_STORE_CONNECT_KEY_ID',
  'APP_STORE_CONNECT_ISSUER_ID',
  'TEAM_ID',
]
test(`confirm-ci-secret-overwrite [2 keys] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(ConfirmCiSecretOverwriteStep, { existingKeys: ['P12_PASSWORD', 'TEAM_ID'], onChange: noop }),
    'confirm-ci-secret-overwrite-2',
  )
})
test(`confirm-ci-secret-overwrite [12 keys — worst case] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(ConfirmCiSecretOverwriteStep, { existingKeys: ALL_CREDENTIAL_KEYS, onChange: noop }),
    'confirm-ci-secret-overwrite-12',
  )
})

// ── ci-secrets-failed — null/short error + long multi-line backend error ──────
test(`ci-secrets-failed [no error] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(CiSecretsFailedStep, { error: null, onChange: noop }), 'ci-secrets-failed-null')
})
test(`ci-secrets-failed [long multi-line error — worst case] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  const longError = 'gh secret set failed: HTTP 403: Resource not accessible by integration '
    + '(https://api.github.com/repos/acme/app/actions/secrets/P12_PASSWORD)\n'
    + 'Ensure the gh CLI is authenticated with a token that has the "repo" and '
    + '"admin:repo_hook" scopes, then run `gh auth refresh -s admin:repo_hook` and retry.'
  assertFitsBudget(h(CiSecretsFailedStep, { error: longError, onChange: noop }), 'ci-secrets-failed-long')
})

// ── ask-build ─────────────────────────────────────────────────────────────────
test(`ask-build fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(AskBuildStep, { onChange: noop }), 'ask-build')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
