#!/usr/bin/env node
// Frame-fit tests for the Android shared lifecycle + AI-analysis onboarding
// steps (welcome / credentials-exist / backing-up / no-platform /
// build-complete / error / ai-analysis-prompt / ai-analysis-running /
// ai-analysis-result). Renders each step component × each meaningful state
// variant via the shared harness and asserts it fits the 16-row contract's
// body budget (13 rows) at every reference width (80 and 60 cols). Shape copied
// from test-frame-fit-ai.mjs (the batch exemplar) + test-frame-fit-android-*.
import React from 'react'
import {
  AiAnalysisPromptStep,
  AiAnalysisResultStep,
  AiAnalysisRunningStep,
  BackingUpStep,
  BuildCompleteStep,
  CredentialsExistStep,
  ErrorStep,
  NoPlatformStep,
  WelcomeStep,
} from '../src/build/onboarding/ui/steps/android-shared.tsx'
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

// ── welcome (spinner) ─────────────────────────────────────────────────────────
test(`welcome fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(WelcomeStep), 'welcome')
})

// ── no-platform — short and long native-dir names ─────────────────────────────
test(`no-platform [short dir] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(NoPlatformStep, { androidDir: 'android' }), 'no-platform-short')
})
test(`no-platform [long dir] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(NoPlatformStep, { androidDir: 'apps/mobile/platforms/android-native' }),
    'no-platform-long',
  )
})

// ── credentials-exist — short and long appId (heading width) ──────────────────
test(`credentials-exist [short appId] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(CredentialsExistStep, { appId: 'com.x.y', onChoose: noop }),
    'credentials-exist-short',
  )
})
test(`credentials-exist [long appId] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(CredentialsExistStep, {
      appId: 'com.companyname.product.flavor.staging.internal.example',
      onChoose: noop,
    }),
    'credentials-exist-long',
  )
})

// ── backing-up (spinner) ──────────────────────────────────────────────────────
test(`backing-up fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(BackingUpStep), 'backing-up')
})

// ── build-complete — every combination of the two optional follow-up lines ────
test(`build-complete [bare] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(BuildCompleteStep, { uploadSummary: null, buildUrl: '' }),
    'build-complete-bare',
  )
})
test(`build-complete [url only] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(BuildCompleteStep, { uploadSummary: null, buildUrl: 'https://capgo.app/app/com.example.app/builds' }),
    'build-complete-url',
  )
})
test(`build-complete [summary + url] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(BuildCompleteStep, {
      uploadSummary: 'Uploaded 5 env vars to GitHub Actions',
      buildUrl: 'https://capgo.app/app/com.example.app/builds',
    }),
    'build-complete-summary-url',
  )
})
test(`build-complete [long summary] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(BuildCompleteStep, {
      uploadSummary: 'Uploaded 12 build environment variables to the GitHub Actions repository secrets store',
      buildUrl: 'https://capgo.app/app/com.example.app/builds',
    }),
    'build-complete-long-summary',
  )
})

// ── error — short and very long (wrapped stderr) failure messages ─────────────
test(`error [short] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(ErrorStep, { message: 'Store password was rejected by the keystore. Try again.', onChoose: noop }),
    'error-short',
  )
})
test(`error [long stderr] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  const longMessage
    = 'Failed to provision Google Cloud resources: the Android Publisher API '
      + 'returned 403 PERMISSION_DENIED — the signed-in account lacks the '
      + 'serviceusage.services.enable permission on project capgo-native-build-9f3a2c, '
      + 'and the linked billing account is suspended. Re-run after enabling billing '
      + 'and granting the Service Usage Admin role, then try the build again from the top.'
  assertFitsBudget(h(ErrorStep, { message: longMessage, onChoose: noop }), 'error-long')
})

// ── ai-analysis-prompt ────────────────────────────────────────────────────────
test(`ai-analysis-prompt fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(AiAnalysisPromptStep, { onChoose: noop }), 'ai-analysis-prompt')
})

// ── ai-analysis-running (spinner) ─────────────────────────────────────────────
test(`ai-analysis-running fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(AiAnalysisRunningStep), 'ai-analysis-running')
})

// ── ai-analysis-result — every content variant × retry affordance ─────────────
// Short inline success text (long analyses route to the scroll step, so the
// inline branch only ever sees short text). Retries available.
test(`ai-analysis-result [short success, retries left] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AiAnalysisResultStep, {
      analysisText: 'Gradle could not find the keystore at the configured path. Verify ANDROID_KEYSTORE_FILE.',
      viewedFull: false,
      result: null,
      retryCount: 0,
      maxRetries: 2,
      onRetry: noop,
      onSkipOrContinue: noop,
    }),
    'ai-result-short-success',
  )
})
// aiViewedFull marker (the long-analysis case: user dismissed the scroll viewer).
test(`ai-analysis-result [viewedFull marker] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AiAnalysisResultStep, {
      analysisText: 'a'.repeat(4000),
      viewedFull: true,
      result: null,
      retryCount: 0,
      maxRetries: 2,
      onRetry: noop,
      onSkipOrContinue: noop,
    }),
    'ai-result-viewed-full',
  )
})
// Non-success banner: error.
test(`ai-analysis-result [error banner] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AiAnalysisResultStep, {
      analysisText: null,
      viewedFull: false,
      result: { kind: 'error', message: 'AI analysis failed: (status 500) internal error.' },
      retryCount: 0,
      maxRetries: 2,
      onRetry: noop,
      onSkipOrContinue: noop,
    }),
    'ai-result-error',
  )
})
// Non-success banner: already_analyzed.
test(`ai-analysis-result [already_analyzed banner] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AiAnalysisResultStep, {
      analysisText: null,
      viewedFull: false,
      result: {
        kind: 'already_analyzed',
        message: 'AI analysis was already requested for this build (only one per job).',
      },
      retryCount: 0,
      maxRetries: 2,
      onRetry: noop,
      onSkipOrContinue: noop,
    }),
    'ai-result-already-analyzed',
  )
})
// Non-success banner: too_big.
test(`ai-analysis-result [too_big banner] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AiAnalysisResultStep, {
      analysisText: null,
      viewedFull: false,
      result: {
        kind: 'too_big',
        message: 'Build log is too large for Capgo AI (>10 MB). Try a local AI tool with the captured log.',
      },
      retryCount: 0,
      maxRetries: 2,
      onRetry: noop,
      onSkipOrContinue: noop,
    }),
    'ai-result-too-big',
  )
})
// Retries exhausted — the single-line "used all N retries" note + Continue.
test(`ai-analysis-result [retries exhausted, banner] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AiAnalysisResultStep, {
      analysisText: null,
      viewedFull: false,
      result: { kind: 'error', message: 'AI analysis failed: (status 503) service unavailable.' },
      retryCount: 2,
      maxRetries: 2,
      onRetry: noop,
      onSkipOrContinue: noop,
    }),
    'ai-result-exhausted',
  )
})
// Last-retry label variant (retriesLeft === 1).
test(`ai-analysis-result [last retry label] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AiAnalysisResultStep, {
      analysisText: 'Short inline diagnosis.',
      viewedFull: false,
      result: null,
      retryCount: 1,
      maxRetries: 2,
      onRetry: noop,
      onSkipOrContinue: noop,
    }),
    'ai-result-last-retry',
  )
})
// viewedFull marker WITH retries exhausted (both terse lines present at once).
test(`ai-analysis-result [viewedFull + exhausted] fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(
    h(AiAnalysisResultStep, {
      analysisText: 'b'.repeat(2000),
      viewedFull: true,
      result: null,
      retryCount: 2,
      maxRetries: 2,
      onRetry: noop,
      onSkipOrContinue: noop,
    }),
    'ai-result-viewed-full-exhausted',
  )
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
