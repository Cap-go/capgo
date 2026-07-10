#!/usr/bin/env node
// Behavioral tests for the shared iOS onboarding AI-analysis step bodies
// (src/build/onboarding/ui/steps/ios-shared.tsx).
//
// The obsolete dense-budget frame-fit assertions (every step's DENSE form must
// fit a 13-row budget) have been retired: the app now always renders the
// comfortable form and a startup size-gate guarantees the terminal is big
// enough, so the dense branches are gone. The enforced-floor coverage now lives
// in test/test-onboarding-min-size.mjs (comfortable forms vs the 80×49 floor).
//
// What remains here is the one assertion that checks RENDERED CONTENT, not the
// row budget: the collapsed AI-analysis marker must not tell the user to scroll
// the terminal back (the wizard runs in the alt-screen buffer, which has no
// scrollback) and must instead offer a "Re-read analysis" option.
import React from 'react'
import { AiAnalysisResultStep } from '../src/build/onboarding/ui/steps/ios-shared.tsx'
import { renderFrameText } from './helpers/frame-fit.mjs'

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

const SHORT_ANALYSIS = 'The build failed because CODE_SIGN_IDENTITY is unset. Add it to your build settings and retry.'

// ── content: the collapsed marker must not lie about scrollback ──────────────
// The wizard runs in the alt-screen buffer (no scrollback), so the old "scroll
// your terminal back to re-read it" marker was a dead instruction. When
// collapsed, the analysis must be re-readable via a "Re-read" option, and the
// marker must not tell the user to scroll the terminal.
test('collapsed AI result: no "scroll back" lie + offers a Re-read option', () => {
  const text = renderFrameText(
    h(AiAnalysisResultStep, {
      analysisText: SHORT_ANALYSIS,
      collapsed: true,
      result: null,
      canRetry: true,
      retriesLeft: 2,
      maxRetries: 2,
      onChange: noop,
    }),
    80,
  )
  if (/scroll your terminal back/i.test(text))
    throw new Error('marker still tells the user to scroll the terminal back (impossible in the alt buffer)')
  if (!/Re-read/i.test(text))
    throw new Error('collapsed state must offer a "Re-read analysis" option')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
