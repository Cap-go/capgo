#!/usr/bin/env bun
// Guards the FullscreenBuildOutput viewport against the "dead space that won't
// repaint" class of bugs. The streamed build env can contain multi-KB single
// lines (base64 provisioning/key blobs). If the viewer WRAPS them, one line
// balloons to dozens of rows: it dominates/overflows the viewport AND desyncs
// Ink's per-line row accounting from the terminal, leaving stale rows on
// stream/scroll/resize. The viewer must render exactly ONE row per line
// (truncate, no wrap) so the frame stays exactly dims.rows tall.
//
// Renders the REAL component at a fixed 80x20 through Ink debug mode + the VT
// grid and asserts: frame never exceeds the terminal height, a giant line
// occupies a single row (no wrapped continuation rows), and the lines after it
// remain visible (a wrapping giant line used to push them off-screen).
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { render } from 'ink'
import React from 'react'
import { FullscreenBuildOutput } from '../src/build/onboarding/ui/components.tsx'
import { frameToGrid } from './helpers/vt-grid.mjs'

const watchdog = setTimeout(() => {
  console.error('WATCHDOG: build-output-viewport test exceeded 30s')
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

const COLS = 80
const ROWS = 20
const TAIL = '  adding: Cordova.framework.dSYM/Contents/Info.plist (deflated 52%)'
const lines = [
  'Requesting build for app (ios)...',
  '',
  '  adding: Capacitor.framework.dSYM/Contents/Resources/DWARF/Capacitor (stored 0%)',
  `"CAPGO_IOS_PROVISIONING_MAP": "${'A'.repeat(900)}"`, // would wrap to ~12 rows if not truncated
  'Cruising back to lane \'ios submit\'',
  TAIL,
]

const stdout = makeStdout(COLS, ROWS)
const inst = render(
  React.createElement(FullscreenBuildOutput, { title: 'Building...', lines, terminalRows: ROWS }),
  { stdout, stderr: makeStdout(COLS, ROWS), stdin: makeStdin(), debug: true, exitOnCtrlC: false, patchConsole: false },
)
await new Promise(r => setTimeout(r, 80))
const frame = (stdout.lastFrame ?? '').replace(/\n$/, '')
inst.unmount()

const frameRows = frame === '' ? 0 : frame.split('\n').length
check(`frame never exceeds the terminal height (${frameRows} <= ${ROWS})`, frameRows <= ROWS)

const grid = await frameToGrid(frame, { cols: COLS, rows: ROWS })
// A wrapped base64 line shows up as rows that are nothing but 'A's. With
// truncation there must be NONE (the blob lives on its single source row only).
const pureAContinuationRows = grid.filter(r => /^A{40,}$/.test(r)).length
check('giant line does NOT wrap into continuation rows', pureAContinuationRows === 0)
// The giant line still appears once, truncated (starts with its key).
check('giant line is shown once, truncated', grid.some(r => r.startsWith('"CAPGO_IOS_PROVISIONING_MAP"')))
// The lines AFTER the giant line are still visible (weren't pushed off-screen).
check('lines after the giant line remain visible', grid.some(r => r.includes(TAIL.trim())))

// Regression: tab-indented fastlane lines must render intact. The viewer
// truncates by char count; a literal tab (1 char, up to 8 cols) used to overflow
// the width so the terminal clipped the last char ("* App" → "* Ap"). sanitize
// now expands tabs, so the full text survives. Pipe a tabbed chunk through the
// sanitizer (the real path) into the viewer and assert the tails are intact.
{
  const { sanitizeBuildLogLines } = await import('../src/build/onboarding/build-log.ts')
  const tabbed = sanitizeBuildLogLines('Modified Targets:\n\t* App\n\t* Release\nStep: update_project_team')
  const so = makeStdout(COLS, ROWS)
  const inst2 = render(
    React.createElement(FullscreenBuildOutput, { title: 'Building...', lines: tabbed, terminalRows: ROWS }),
    { stdout: so, stderr: makeStdout(COLS, ROWS), stdin: makeStdin(), debug: true, exitOnCtrlC: false, patchConsole: false },
  )
  await new Promise(r => setTimeout(r, 80))
  const f2 = (so.lastFrame ?? '').replace(/\n$/, '')
  inst2.unmount()
  const g2 = await frameToGrid(f2, { cols: COLS, rows: ROWS })
  check('tab-indented line keeps its full text ("* App")', g2.some(r => r.includes('* App')))
  check('tab-indented line keeps its full text ("* Release")', g2.some(r => r.includes('* Release')))
  check('no literal tab reaches the rendered grid', !g2.join('').includes('\t'))
}

console.log(`\n${passed} passed, ${failed} failed`)
clearTimeout(watchdog)
process.exit(failed > 0 ? 1 : 0)
