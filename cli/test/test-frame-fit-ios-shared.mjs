#!/usr/bin/env node
// Behavioral tests for the shared iOS onboarding AI-analysis step bodies.
//
// The obsolete dense-budget frame-fit assertions (every step's DENSE form must
// fit a 13-row budget) have been retired — the app now always renders the
// comfortable form and a startup size-gate guarantees the terminal is big
// enough, so the dense branches are gone. The enforced-floor coverage now lives
// in test/test-onboarding-min-size.mjs. What remains here is the one assertion
// that checks RENDERED CONTENT (not the row budget): the collapsed AI-analysis
// marker must not tell the user to "scroll up" (the wizard runs in the
// alt-screen buffer, which has no scrollback) and must instead offer a "Re-read
// analysis" option.
import React from 'react'
import { AiAnalysisResultStep } from '../src/build/onboarding/ui/steps/ios-shared.tsx'
import { renderOnboardingFrame } from './helpers/frame-fit.mjs'

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

// ── collapsed AI result marker ────────────────────────────────────────────────
test(`collapsed AI result: no "scroll back" lie + offers a Re-read option`, () => {
  const frame = renderOnboardingFrame(
    h(AiAnalysisResultStep, { analysisText: 'x', collapsed: true, result: null, canRetry: true, retriesLeft: 2, maxRetries: 3, onChange: noop }),
  )
  const text = frame.output
  if (text.includes('scroll up'))
    throw new Error('collapsed marker must not tell the user to "scroll up" (alt-screen has no scrollback)')
  if (!text.includes('Re-read'))
    throw new Error('collapsed marker should offer a "Re-read analysis" option')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
