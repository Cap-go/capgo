#!/usr/bin/env node
// Regression tests for the FullscreenAiViewer (the scrollable AI-analysis
// viewer). Bug: it reserved 10 chrome rows but only draws ~6, so the padded
// frame ended well above the terminal bottom — leaving dead space AND
// paginating earlier than necessary ("Showing 1-8 of 15" with a half-empty
// screen). Fixed by reserving only the real chrome (6) and filling the rest
// with a flex spacer inside a full-height column.
//
// These render the REAL viewer at controlled terminal heights and assert:
//   1. the frame fills the terminal exactly (no dead space): rows === height;
//   2. it shows as many lines as fit (not fewer).
import { EventEmitter } from 'node:events'
import { render as inkRender } from 'ink'
import React from 'react'
import { stripAnsi } from '../src/build/onboarding/ai-fit.ts'
import { FullscreenAiViewer } from '../src/build/onboarding/ui/components.tsx'

let passed = 0
let failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`✔ ${name}`) }
  catch (error) { failed++; console.error(`✖ ${name}\n  ${error.message}`) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }

function makeStdout(rows, cols) {
  const s = new EventEmitter()
  s.rows = rows
  s.columns = cols
  s.frames = []
  s.lastFrame = null
  s.write = (f) => { s.frames.push(f); s.lastFrame = f }
  return s
}
function makeStdin() {
  const s = new EventEmitter()
  s.isTTY = true
  for (const m of ['setEncoding', 'setRawMode', 'resume', 'pause', 'ref', 'unref'])
    s[m] = () => {}
  s.read = () => null
  return s
}

const h = React.createElement

// Render the viewer at a given terminal size; return { rows, showing }.
function renderViewer(lines, termRows, termCols = 100) {
  const stdout = makeStdout(termRows, termCols)
  const instance = inkRender(
    h(FullscreenAiViewer, {
      title: 'AI analysis',
      subtitle: `${lines.length} lines — scrollable because the analysis is taller than your terminal`,
      lines,
      terminalRows: termRows,
      onExit: () => {},
    }),
    { stdout, stderr: makeStdout(termRows, termCols), stdin: makeStdin(), debug: true, exitOnCtrlC: false, patchConsole: false },
  )
  const frame = (stdout.lastFrame ?? '').replace(/\n$/, '')
  instance.unmount()
  const renderedRows = frame === '' ? 0 : frame.split('\n').length
  const showing = frame.split('\n').find(l => l.includes('Showing')) ?? ''
  return { renderedRows, showing, frame }
}

// 20-line analysis (taller than most test terminals).
const longLines = Array.from({ length: 20 }, (_, i) => `analysis line ${i + 1}`)

// 1. No dead space: the viewer fills the terminal. `minHeight={dims.rows}`
// guarantees the column is the full terminal height in a real terminal; when
// all lines fit the subtitle is hidden (chrome 5 not 6), so the column is 1
// row short and minHeight appends a trailing blank — which `debug` mode trims
// from the captured frame. So allow exactly 1 row of slack (the trimmed
// trailing blank); a real dead-space regression would be many rows short.
for (const termRows of [10, 14, 18, 24, 30, 40]) {
  test(`viewer fills the terminal at ${termRows} rows (no dead space)`, () => {
    const { renderedRows } = renderViewer(longLines, termRows)
    assert(renderedRows >= termRows - 1, `expected ~${termRows} rendered rows, got ${renderedRows}`)
  })
}

// 2. Shows as many lines as fit. Chrome is 6 rows, so a 24-row terminal has an
// 18-row viewport → all 20 lines do NOT fit → it paginates but shows ~18, far
// more than the old buggy 8.
test('paginates with a near-full viewport, not a tiny one', () => {
  const { showing } = renderViewer(longLines, 24)
  const match = showing.match(/Showing 1-(\d+) of 20/)
  assert(match, `expected a "Showing 1-N of 20" line, got "${showing.trim()}"`)
  const shown = Number(match[1])
  assert(shown >= 15, `expected ≥15 lines shown in an 18-row viewport, got ${shown}`)
})

// 3. When everything fits, it says so (and still fills the screen).
test('short analysis shows all lines and still fills the terminal', () => {
  const short = ['Likely cause', 'Something went wrong.', '', 'Fix', 'Do the thing.']
  const { renderedRows, showing } = renderViewer(short, 30)
  assert(renderedRows >= 29, `expected ~30 rendered rows, got ${renderedRows}`)
  assert(showing === '' || showing.includes('all'), `expected "all" or no scroll hint, got "${showing.trim()}"`)
})

// 4. Blank lines (markdown section spacing) must occupy a row so the packer's
// wrap counter matches what Ink renders. Bug: Ink collapses an empty <Text> to
// 0 rows while the counter assumed 1, so the packer stopped early and the
// fixed-height content box padded the shortfall as BLANK rows at the bottom (a
// mid-screen gap) while excluding real content below. This renders an analysis
// with interspersed blanks at a paginating height and asserts the content area
// (between the two dividers) is not bottom-padded with multiple blanks.
test('interspersed blank lines do not create a trailing gap in the content area', () => {
  const lines = [
    'Likely cause',
    'X'.repeat(120),
    '',
    'Evidence',
    'err line',
    '',
    'Suggested fix',
    'a'.repeat(120),
    'b'.repeat(120),
    'c'.repeat(120),
    'final A',
    'final B',
  ]
  const { frame } = renderViewer(lines, 16, 80)
  const rows = frame.split('\n')
  const dividerIdx = rows.map((r, i) => (r.includes('─') ? i : -1)).filter(i => i >= 0)
  if (dividerIdx.length < 2)
    throw new Error('expected two divider rows')
  const content = rows.slice(dividerIdx[0] + 1, dividerIdx[1]).map(stripAnsi)
  let trailingBlanks = 0
  for (let i = content.length - 1; i >= 0 && content[i].trim() === ''; i--)
    trailingBlanks++
  // One trailing blank is acceptable (intended spacing); 2+ means the content
  // area was padded with blanks instead of packed with text — the gap bug.
  if (trailingBlanks > 1)
    throw new Error(`content area bottom-padded with ${trailingBlanks} blank rows (the gap bug)`)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
