#!/usr/bin/env bun
// Enforces the minimum-terminal-size contract for onboarding.
//
// Renders EVERY static onboarding step (comfortable form, worst-case content) +
// the completed-steps log, through a real VT engine (@xterm/headless), at the
// enforced MIN_COLS, and asserts none exceeds MIN_ROWS. If a step grows past the
// floor (new copy, a wider Select, etc.), this FAILS — forcing either a copy fix
// or a deliberate bump of MIN_ROWS in min-terminal-size.ts. That keeps the
// enforced gate honest: the number can never silently drift from what the steps
// actually need.
//
// This is the "advanced test that guarantees a good UX" half of the goal; the
// runnable search (find-min-onboarding-size.mjs) is the exploratory half.
import process from 'node:process'
import { MIN_COLS, MIN_ROWS } from '../src/build/onboarding/min-terminal-size.ts'
import { staticStepFixtures } from './helpers/onboarding-fixtures.mjs'
import { buildOnboardingFrame } from './helpers/onboarding-frame.mjs'
import { analyzeFrame } from './helpers/vt-grid.mjs'

const watchdog = setTimeout(() => {
  console.error('WATCHDOG: min-size test exceeded 60s')
  process.exit(2)
}, 60000)
watchdog.unref()

let passed = 0
let failed = 0
const fixtures = staticStepFixtures()

for (const { label, el, withProgress } of fixtures) {
  const frame = buildOnboardingFrame(el, { withProgress })
  // Measure the natural (unclipped) height by rendering into a tall grid.
  const a = await analyzeFrame(frame, { cols: MIN_COLS, rows: 200 })
  if (a.naturalRows <= MIN_ROWS) {
    passed++
    console.log(`✔ ${label} fits ${a.naturalRows}/${MIN_ROWS} rows @ ${MIN_COLS} cols`)
  }
  else {
    failed++
    console.error(`✖ ${label} needs ${a.naturalRows} rows, exceeds MIN_ROWS=${MIN_ROWS} @ ${MIN_COLS} cols`)
  }
}

console.log(`\n${passed} passed, ${failed} failed (floor: ${MIN_COLS}×${MIN_ROWS})`)
clearTimeout(watchdog)
process.exit(failed > 0 ? 1 : 0)
