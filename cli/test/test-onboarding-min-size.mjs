#!/usr/bin/env bun
// Enforces the minimum-terminal-size contract for onboarding, PER PLATFORM.
//
// Renders EVERY static onboarding step (comfortable form, worst-case content) +
// the completed-steps log, through a real VT engine (@xterm/headless), at the
// enforced MIN_COLS, and asserts none exceeds ITS PLATFORM's floor — iOS steps
// vs IOS_MIN_ROWS (38), Android steps vs ANDROID_MIN_ROWS (49). If a step grows
// past its floor (new copy, a wider Select, etc.), this FAILS — forcing either a
// copy fix or a deliberate bump of that platform's floor in min-terminal-size.ts.
// That keeps each enforced gate honest: the numbers can never silently drift
// from what the steps actually need.
//
// The iOS error screen (ish.ErrorStep) is intentionally ABSENT from the fixtures
// — it's unbounded and routes through the scroll viewer (see
// onboarding-fixtures.mjs); only its compact inline form renders against the
// floor, and that's ~20 rows.
import process from 'node:process'
import { ANDROID_MIN_ROWS, IOS_MIN_ROWS, MIN_COLS } from '../src/build/onboarding/min-terminal-size.ts'
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
const floorFor = platform => (platform === 'ios' ? IOS_MIN_ROWS : ANDROID_MIN_ROWS)

for (const { label, el, withProgress, platform } of fixtures) {
  const frame = buildOnboardingFrame(el, { withProgress })
  // Measure the natural (unclipped) height by rendering into a tall grid.
  const a = await analyzeFrame(frame, { cols: MIN_COLS, rows: 200 })
  const floor = floorFor(platform)
  if (a.naturalRows <= floor) {
    passed++
    console.log(`✔ [${platform}] ${label} fits ${a.naturalRows}/${floor} rows @ ${MIN_COLS} cols`)
  }
  else {
    failed++
    console.error(`✖ [${platform}] ${label} needs ${a.naturalRows} rows, exceeds the ${platform} floor of ${floor} @ ${MIN_COLS} cols`)
  }
}

console.log(`\n${passed} passed, ${failed} failed (iOS floor ${MIN_COLS}×${IOS_MIN_ROWS}, Android floor ${MIN_COLS}×${ANDROID_MIN_ROWS})`)
clearTimeout(watchdog)
process.exit(failed > 0 ? 1 : 0)
