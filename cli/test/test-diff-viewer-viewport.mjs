#!/usr/bin/env bun
// Guards FullscreenDiffViewer against the "wastes the screen" bug: it used to
// render INSIDE the wizard Box (inheriting the header slot + padding → a large
// top gap) and reserved 12 chrome rows when it needs only 7, so the workflow-file
// diff showed ~26 lines with a big empty band above. It's now a fullscreen
// early-return takeover that fills via minHeight and reserves only real chrome.
//
// Renders the REAL component through Ink debug mode + the VT grid and asserts:
// the frame fills the terminal height, shows ~rows-7 diff lines (uses the space),
// never exceeds the height, a giant line stays on one row (truncate, no wrap),
// and the chrome (summary + exit hint) is present.
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { render } from 'ink'
import React from 'react'
import { FullscreenDiffViewer } from '../src/build/onboarding/ui/components.tsx'
import { frameToGrid } from './helpers/vt-grid.mjs'

const watchdog = setTimeout(() => {
  console.error('WATCHDOG: diff-viewer-viewport test exceeded 30s')
  process.exit(2)
}, 30000)
watchdog.unref()

function makeStdout(cols, rows) {
  const s = new EventEmitter()
  s.columns = cols
  s.rows = rows
  s.isTTY = true
  s.lastFrame = ''
  s.write = (f) => {
    s.lastFrame = f
    return true
  }
  return s
}
function makeStdin() {
  const s = new EventEmitter()
  s.isTTY = true
  s.setEncoding = () => {}
  s.setRawMode = () => {}
  s.resume = () => {}
  s.pause = () => {}
  s.ref = () => {}
  s.unref = () => {}
  s.read = () => null
  return s
}

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

const COLS = 100
const ROWS = 40
const DIFF_CHROME_ROWS = 7 // title + subtitle + 2 dividers + summary + position + exit hint

// A new-file diff longer than the viewport, with one giant line (would wrap to
// ~10 rows if not truncated) to prove the one-row-per-line truncation.
const lines = []
for (let i = 0; i < 60; i++)
  lines.push({ kind: 'add', text: `      line ${i + 1}: some proposed workflow yaml content` })
lines.splice(5, 0, { kind: 'add', text: `KEY: ${'A'.repeat(900)}` })

const stdout = makeStdout(COLS, ROWS)
const inst = render(
  React.createElement(FullscreenDiffViewer, {
    title: '🆕  Proposed new file — /tmp/x/.github/workflows/capgo-build.yml',
    subtitle: 'Nothing exists on disk yet. Every line below is what would be written.',
    lines,
    terminalRows: ROWS,
    onExit: () => {},
  }),
  { stdout, stderr: makeStdout(COLS, ROWS), stdin: makeStdin(), debug: true, exitOnCtrlC: false, patchConsole: false },
)
await new Promise(r => setTimeout(r, 80))
const frame = (stdout.lastFrame ?? '').replace(/\n$/, '')
inst.unmount()

const frameRows = frame === '' ? 0 : frame.split('\n').length
check(`frame never exceeds the terminal height (${frameRows} <= ${ROWS})`, frameRows <= ROWS)
check(`frame FILLS the terminal height (${frameRows} >= ${ROWS - 1})`, frameRows >= ROWS - 1)

const grid = await frameToGrid(frame, { cols: COLS, rows: ROWS })
// Diff content rows look like "  NN + text". Count them — should be ~rows-7.
// The old bug (reserve 12 + the wizard top gap) showed far fewer.
const diffRows = grid.filter(r => /^\s*\d+ \+ /.test(r)).length
check(`uses the space — ${diffRows} diff lines visible (>= ${ROWS - DIFF_CHROME_ROWS - 1})`, diffRows >= ROWS - DIFF_CHROME_ROWS - 1)
// Giant line must not wrap into pure-'A' continuation rows.
const pureAContinuationRows = grid.filter(r => /^A{40,}$/.test(r)).length
check('giant line does NOT wrap into continuation rows', pureAContinuationRows === 0)
check('summary line is shown', grid.some(r => r.includes('Summary:')))
check('exit hint is shown', grid.some(r => r.includes('Press Escape or Enter to exit diff viewer')))

console.log(`\n${passed} passed, ${failed} failed`)
clearTimeout(watchdog)
process.exit(failed > 0 ? 1 : 0)
