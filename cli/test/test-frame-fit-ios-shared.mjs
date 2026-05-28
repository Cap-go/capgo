#!/usr/bin/env node
// Frame-fit tests for the shared iOS + AI onboarding step components
// (src/build/onboarding/ui/steps/ios-shared.tsx). Renders each step body ×
// each meaningful state variant through the shared harness and asserts it fits
// the 16-row contract's body budget (13 rows) at every reference width
// (80 + 60). Shape copied from test-frame-fit-ios-ci.mjs (the batch exemplar).
//
// The budget offenders get realistic worst cases:
//   • error — a composite backend error string with the recovery helper
//     matching MANY branches (so summary + commands overflow before capping)
//     AND a long support-bundle path.
//   • ai-analysis-result — every display variant: short success text, the
//     "already viewed" marker, each non-success banner kind, and the
//     retries-left vs retries-exhausted Select shapes.
import React from 'react'
import {
  AddingPlatformStep,
  AiAnalysisPromptStep,
  AiAnalysisResultStep,
  AiAnalysisRunningStep,
  BuildCompleteStep,
  ErrorStep,
  NoPlatformStep,
  PlatformSelectStep,
  WelcomeStep,
} from '../src/build/onboarding/ui/steps/ios-shared.tsx'
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
// platform-select / build-complete details wrap at 60 cols if copy is verbose.
const LONG_APP_ID = 'com.acme.enterprise.internal.mobile.companion.app'

// Long pnpm-via-dlx style commands so the no-platform / adding-platform
// command lines wrap at 60 cols (worst case for those frames).
const ADD_IOS = 'pnpm exec cap add ios'
const SYNC_IOS = 'pnpm exec cap sync ios'
const DOCTOR = 'pnpm dlx @capgo/cli@latest doctor'
const BUILD_REQUEST = 'pnpm dlx @capgo/cli@latest build request com.acme.enterprise.internal.mobile.companion.app --platform ios'

// ── Static spinner steps (trivially fit, but assert so a future copy change
//    can't silently blow the budget). ─────────────────────────────────────────
test(`welcome fits ${BODY_BUDGET_ROWS}-row body budget`, () => {
  assertFitsBudget(h(WelcomeStep), 'welcome')
})
test(`ai-analysis-running fits ${BODY_BUDGET_ROWS}-row body budget`, () => {
  assertFitsBudget(h(AiAnalysisRunningStep), 'ai-analysis-running')
})

// ── platform-select ─────────────────────────────────────────────────────────
test(`platform-select [long appId] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(PlatformSelectStep, { appId: LONG_APP_ID, onChange: noop }), 'platform-select')
})

// ── no-platform ─────────────────────────────────────────────────────────────
test(`no-platform [long commands] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(NoPlatformStep, { iosDir: 'ios', addIosCommand: ADD_IOS, syncIosCommand: SYNC_IOS, onChange: noop }),
    'no-platform',
  )
})

// ── adding-platform ─────────────────────────────────────────────────────────
test(`adding-platform [long commands] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AddingPlatformStep, { addIosCommand: ADD_IOS, doctorCommand: DOCTOR }),
    'adding-platform',
  )
})

// ── ai-analysis-prompt ──────────────────────────────────────────────────────
test(`ai-analysis-prompt fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(AiAnalysisPromptStep, { onChange: noop }), 'ai-analysis-prompt')
})

// ── ai-analysis-result — every display variant × retry shape ─────────────────
// Short success text (the only kind ever rendered inline — long analyses are
// routed to the scroll step by the parent before this frame).
const SHORT_ANALYSIS = 'The build failed because CODE_SIGN_IDENTITY is unset. Add it to your build settings and retry.'

test(`ai-analysis-result [short success, retries left] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AiAnalysisResultStep, {
      analysisText: SHORT_ANALYSIS,
      viewedFull: false,
      result: null,
      canRetry: true,
      retriesLeft: 2,
      maxRetries: 2,
      onChange: noop,
    }),
    'ai-analysis-result-short-2left',
  )
})
test(`ai-analysis-result [short success, 1 retry left — last-retry label] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AiAnalysisResultStep, {
      analysisText: SHORT_ANALYSIS,
      viewedFull: false,
      result: null,
      canRetry: true,
      retriesLeft: 1,
      maxRetries: 2,
      onChange: noop,
    }),
    'ai-analysis-result-short-1left',
  )
})
test(`ai-analysis-result [success, viewedFull marker] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AiAnalysisResultStep, {
      analysisText: SHORT_ANALYSIS,
      viewedFull: true,
      result: null,
      canRetry: true,
      retriesLeft: 2,
      maxRetries: 2,
      onChange: noop,
    }),
    'ai-analysis-result-viewedFull',
  )
})
test(`ai-analysis-result [retries exhausted — Continue only] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AiAnalysisResultStep, {
      analysisText: SHORT_ANALYSIS,
      viewedFull: false,
      result: null,
      canRetry: false,
      retriesLeft: 0,
      maxRetries: 2,
      onChange: noop,
    }),
    'ai-analysis-result-exhausted',
  )
})

// Non-success banner outcomes (already_analyzed / too_big / error). The parent
// keeps these messages short; we still exercise a fairly long one.
const TOO_BIG_MSG = 'The build log is too large to analyze automatically. Trim it or open the full log in the dashboard.'
const ALREADY_MSG = 'This build log was already analyzed in a previous run — re-run the build to get a fresh diagnosis.'
const ERROR_MSG = 'The analysis service is temporarily unavailable. Please try again in a few minutes.'

test(`ai-analysis-result [already_analyzed banner, retries left] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AiAnalysisResultStep, {
      analysisText: null,
      viewedFull: false,
      result: { kind: 'already_analyzed', message: ALREADY_MSG },
      canRetry: true,
      retriesLeft: 2,
      maxRetries: 2,
      onChange: noop,
    }),
    'ai-analysis-result-already',
  )
})
test(`ai-analysis-result [too_big banner, retries exhausted] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AiAnalysisResultStep, {
      analysisText: null,
      viewedFull: false,
      result: { kind: 'too_big', message: TOO_BIG_MSG },
      canRetry: false,
      retriesLeft: 0,
      maxRetries: 2,
      onChange: noop,
    }),
    'ai-analysis-result-toobig-exhausted',
  )
})
test(`ai-analysis-result [error banner, retries left] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AiAnalysisResultStep, {
      analysisText: null,
      viewedFull: false,
      result: { kind: 'error', message: ERROR_MSG },
      canRetry: true,
      retriesLeft: 2,
      maxRetries: 2,
      onChange: noop,
    }),
    'ai-analysis-result-error',
  )
})

// ── error — capped recovery advice + clamped error + support bundle ──────────
// Mirrors getBuildOnboardingRecoveryAdvice() worst case: a composite error
// string matches MANY branches, so summary/commands grow well past what fits.
// The component must clamp the error, cap the lists, drop docs, and keep the
// recovery Select on screen.
const WORST_CASE_ADVICE = {
  summary: [
    'Apple rejected the App Store Connect credentials.',
    'Double-check the .p8 file, Key ID, Issuer ID, and that the key still has Admin or Developer access.',
    'The CLI could not reach Apple or Capgo over the network.',
    'Check VPN, proxy, firewall, and DNS settings, then retry from the saved step.',
    'Apple is rate-limiting the request right now.',
    'Wait a minute, then retry from the saved step instead of restarting the whole flow.',
    'Apple still has conflicting provisioning profiles for this bundle identifier.',
    'You can let onboarding delete the duplicates automatically, or clean them up in App Store Connect and resume.',
  ],
  commands: [
    'pnpm dlx @capgo/cli@latest doctor',
    'pnpm dlx @capgo/cli@latest build init',
    'pnpm dlx @capgo/cli@latest login',
    BUILD_REQUEST,
  ],
  docs: [
    'https://capgo.app/docs/cli/cloud-build/ios/',
    'https://appstoreconnect.apple.com/access/integrations/api',
    'https://appstoreconnect.apple.com/access/users',
  ],
}

// A long composite backend error that, unclamped, wraps to several rows at
// 60 cols.
const LONG_ERROR = 'API key verification failed: HTTP 403 Forbidden — the App Store Connect key was rejected. '
  + 'Additionally a network timeout (ETIMEDOUT) occurred while contacting Apple, and a duplicate profile conflict '
  + 'was reported for the bundle identifier com.acme.enterprise.internal.mobile.companion.app.'

const LONG_SUPPORT_BUNDLE = '/Users/developer/Library/Application Support/capgo/onboarding-support-bundles/ios-com.acme.enterprise.internal.mobile.companion.app-2026-05-28T12-00-00.zip'

test(`error [short error, no advice, no retry] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(ErrorStep, {
      error: 'Run `pnpm dlx @capgo/cli@latest build init` to resume.',
      recoveryAdvice: null,
      supportBundlePath: null,
      showRetry: false,
      onChange: noop,
    }),
    'error-minimal',
  )
})
test(`error [worst-case composite advice + long error + support bundle + retry] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(ErrorStep, {
      error: LONG_ERROR,
      recoveryAdvice: WORST_CASE_ADVICE,
      supportBundlePath: LONG_SUPPORT_BUNDLE,
      showRetry: true,
      onChange: noop,
    }),
    'error-worst-case',
  )
})
test(`error [advice present, retry, no support bundle] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(ErrorStep, {
      error: 'The onboarding flow hit an unexpected error.',
      recoveryAdvice: {
        summary: [
          'The onboarding flow hit an unexpected error.',
          'Retry the saved step first. If it still fails, capture diagnostics and keep the support bundle when you contact support.',
        ],
        commands: ['pnpm dlx @capgo/cli@latest doctor', 'pnpm dlx @capgo/cli@latest build init'],
        docs: ['https://capgo.app/docs/cli/cloud-build/ios/'],
      },
      supportBundlePath: null,
      showRetry: true,
      onChange: noop,
    }),
    'error-typical',
  )
})

// ── build-complete — with build URL + CI upload summary, and the minimal form ─
test(`build-complete [build URL + CI summary] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(BuildCompleteStep, {
      buildUrl: 'https://capgo.app/app/p/com.acme.enterprise.internal.mobile.companion.app/builds/abc123',
      ciSecretUploadSummary: 'Uploaded 12 build env vars to GitLab CI/CD variables',
      buildRequestCommand: BUILD_REQUEST,
    }),
    'build-complete-full',
  )
})
test(`build-complete [no build, no CI summary] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(BuildCompleteStep, {
      buildUrl: '',
      ciSecretUploadSummary: null,
      buildRequestCommand: BUILD_REQUEST,
    }),
    'build-complete-minimal',
  )
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
