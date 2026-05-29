#!/usr/bin/env node
// Regression tests for FullscreenBuildOutput — the streaming build-output viewer.
//
// The bug: the `requesting-build` step rendered its unbounded, growing output
// inside the wizard's measured body, so a long build log inflated bodyHeight and
// tripped the "terminal too small" gate — replacing a live build with a resize
// prompt on a perfectly usable terminal (the user hit it at 33 rows). The fix
// mirrors the AI viewer: a fullscreen takeover that auto-tails inside a viewport
// which ALWAYS fits the live terminal.
//
// These assert exactly that contract: no matter how long the log, the frame
// never exceeds the terminal height (so it can never report "too small"), the
// newest line is always shown (tail), and the status bar shows the line count.
import React from 'react'
import { FullscreenBuildOutput } from '../src/build/onboarding/ui/components.tsx'
import { renderFrameText } from './helpers/frame-fit.mjs'

let passed = 0
let failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`✔ ${name}`) }
  catch (error) { failed++; console.error(`✖ ${name}\n  ${error.message}`) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }
const h = React.createElement

// A long build log — the scenario that tripped "too small".
const longLog = Array.from({ length: 400 }, (_, i) => `build log line ${i + 1}`)

// Render the viewer as the terminal's full screen at a given height.
function render(lines, rows, cols = 80) {
  return renderFrameText(h(FullscreenBuildOutput, { title: 'Building...', lines, terminalRows: rows }), cols, rows)
}

// 1. NEVER exceeds the terminal height — for any height, even with 400 lines.
//    This is the whole point: the build phase can no longer report "too small".
for (const rows of [10, 16, 24, 33, 40, 60]) {
  test(`400-line build log fits a ${rows}-row terminal (never "too small")`, () => {
    const height = render(longLog, rows).split('\n').length
    assert(height <= rows, `frame is ${height} rows, exceeds the ${rows}-row terminal`)
  })
}

// 2. Auto-tails: the newest line is always visible; far-earlier lines are gone.
test('auto-tails: newest line shown, far-earlier lines clipped', () => {
  const frame = render(longLog, 24)
  assert(frame.includes('build log line 400'), 'newest line must be visible (tail)')
  // line 10 (and 100-109, which share the substring) are all far above the
  // ~22-line viewport, so none appear.
  assert(!frame.includes('build log line 10'), 'far-earlier lines should be clipped, not shown')
})

// 3. Status bar shows the spinner label + the running line count.
test('status bar shows "Building..." and the line count', () => {
  const frame = render(longLog, 24)
  assert(/Building/.test(frame), 'missing "Building" status')
  assert(/\(400 lines\)/.test(frame), 'missing/incorrect line count in status')
})

// 4. A short log also fits and keeps the status bar.
test('short log fits and still shows content + status bar', () => {
  const frame = render(['✔ Build job created', 'Uploading: 100%'], 24)
  const height = frame.split('\n').length
  assert(height <= 24, `short-log frame is ${height} rows, exceeds 24`)
  assert(frame.includes('✔ Build job created'), 'short-log content should show')
  assert(/\(2 lines\)/.test(frame), 'line count should be 2')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
