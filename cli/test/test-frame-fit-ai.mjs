#!/usr/bin/env node
// Frame-fit tests for the AI sub-flow components. EXEMPLAR for the batch
// subagents: render each component × each state variant via the shared harness
// and assert it fits the 16-row contract's body budget at every reference
// width. Copy this shape for steps/<batch>.tsx test files.
import React from 'react'
import { AiResultBanner } from '../src/build/onboarding/ui/components.tsx'
import { assertFitsBudget, BODY_BUDGET_ROWS, frameRows } from './helpers/frame-fit.mjs'

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

// Each non-success outcome the AI banner can show.
const bannerVariants = [
  ['error', 'AI analysis failed: (status 500) internal error.'],
  ['already_analyzed', 'AI analysis was already requested for this build (only one per job).'],
  ['too_big', 'Build log is too large for Capgo AI (>10 MB). Try a local AI tool with the captured log.'],
]

for (const [kind, message] of bannerVariants) {
  test(`AiResultBanner [${kind}] fits ${BODY_BUDGET_ROWS}-row body budget`, () => {
    assertFitsBudget(h(AiResultBanner, { kind, message }), `ai-banner-${kind}`)
  })
}

// The banner is adaptive: the comfortable default is a bordered box (the
// prominent original design) and the `dense` form drops the box for terminals
// too short to fit it. The dense (compact) form is the one that must survive
// the 16-row floor, so it must stay ≤ 3 rows (icon line + message, no border).
test('AiResultBanner dense form is compact (≤ 3 rows at 80 cols)', () => {
  const rows = frameRows(
    h(AiResultBanner, {
      kind: 'already_analyzed',
      message: 'AI analysis was already requested for this build (only one per job).',
      dense: true,
    }),
    80,
  )
  if (rows > 3)
    throw new Error(`expected ≤ 3 rows, got ${rows}`)
})

// The comfortable default (boxed) must still fit the body budget so it can be
// shown on any terminal that has room.
test('AiResultBanner boxed default fits the body budget', () => {
  assertFitsBudget(h(AiResultBanner, { kind: 'already_analyzed', message: 'AI analysis was already requested for this build (only one per job).' }), 'ai-banner-boxed')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
