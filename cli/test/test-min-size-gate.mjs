#!/usr/bin/env bun
// Behaviour test for the startup size gate (MinSizeGate).
//
// Below the floor it must show a resize prompt (naming the short dimension) and
// hide the wizard; at/above the floor it must render the wizard content through
// unchanged. Rendered via the real VT grid so we assert what the terminal shows.
import { Box, Text } from 'ink'
import process from 'node:process'
import React from 'react'
import { MIN_COLS, MIN_ROWS } from '../src/build/onboarding/min-terminal-size.ts'
import { MinSizeGate } from '../src/build/onboarding/ui/min-size-gate.tsx'
import { frameToGrid, renderInkFrame } from './helpers/vt-grid.mjs'

const watchdog = setTimeout(() => {
  console.error('WATCHDOG 30s')
  process.exit(2)
}, 30000)
watchdog.unref()

const h = React.createElement
let passed = 0
let failed = 0
function check(name, cond) {
  if (cond) {
    passed++
    console.log(`✔ ${name}`)
  }
  else {
    failed++
    console.error(`✖ ${name}`)
  }
}

const SENTINEL = 'WIZARD_CONTENT_SENTINEL'
const child = h(Box, null, h(Text, null, SENTINEL))
const gateAt = (cols, rows) => renderInkFrame(h(MinSizeGate, { cols, rows, children: child }), cols)

// 1. too short → prompt, names rows, hides wizard
{
  const out = gateAt(MIN_COLS, MIN_ROWS - 1)
  check('too short: hides wizard', !out.includes(SENTINEL))
  check('too short: shows too-small warning', /too small/i.test(out))
  check('too short: states required size', new RegExp(`${MIN_COLS}.${MIN_ROWS}`).test(out))
  check('too short: calls out rows', /taller|rows/i.test(out))
}

// 2. too narrow → names columns
{
  const out = gateAt(MIN_COLS - 10, MIN_ROWS)
  check('too narrow: hides wizard', !out.includes(SENTINEL))
  check('too narrow: calls out columns', /Widen|columns/i.test(out))
}

// 3. exactly the floor → renders wizard
check('exactly the floor renders the wizard', gateAt(MIN_COLS, MIN_ROWS).includes(SENTINEL))

// 4. ample size → renders wizard
check('ample size renders the wizard', gateAt(MIN_COLS + 20, MIN_ROWS + 10).includes(SENTINEL))

// 5. the resize prompt itself fits the small terminal it's shown on (real grid):
//    it must not clip (natural height ≤ rows) and the warning must be visible.
//    (We check the warning line, not the wrapping resize sentence, because at
//    50 cols that sentence wraps and no single grid line contains a fixed
//    phrase — clipping is the real property to assert here.)
{
  const cols = 50
  const rows = 20
  const frame = renderInkFrame(h(MinSizeGate, { cols, rows, children: child }), cols)
  const naturalRows = frame.split('\n').length
  const grid = await frameToGrid(frame, { cols, rows })
  const visible = grid.filter(l => l.length > 0)
  check(
    'the resize prompt fits the small terminal it is shown on',
    naturalRows <= rows && visible.some(l => /too small/i.test(l)) && visible.some(l => /Resize this window/i.test(l)),
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
clearTimeout(watchdog)
process.exit(failed > 0 ? 1 : 0)
