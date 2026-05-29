#!/usr/bin/env node
// Resize integration tests for the onboarding shell.
//
// A terminal "resize" is not a special interactive event — it's exactly two
// things: stdout.columns/rows mutate, then stdout emits 'resize'. ink (and our
// useStdout-based useTerminalSize hook) listen for that event.
// renderResizeFrames simulates precisely that and returns the frames emitted
// before vs. after. We assert the END STATE: after a resize the frame matches a
// fresh render at the new size — height follows the new rows, the bottom-pinned
// legend re-pins, and the cards↔list layout follows the new width.
//
// NOT tested here: the 1-frame "jump then correct" bounce that motivated the
// useTerminalSize fix (read stdout live instead of from lagging state). That
// bounce is a real-terminal timing/alt-screen artifact. In this headless
// debug-mode harness ink commits React's update and dedupes identical output,
// so the stale intermediate frame never reaches the stream: a throwaway
// diagnostic showed BOTH the fixed hook and a buggy state-based twin produce a
// single clean transition (after = [<new height>], no stale frame). Asserting
// "no stale frame" would therefore PASS on the buggy code too — a false green.
// So we don't fake a guard we can't honestly provide; the bounce fix is covered
// by reasoning + manual resize. These end-state tests still catch the
// regressions the harness CAN see: resize handling going dead (frame stuck at
// the old size) or the responsive layout/legend not following the new size.
import { Box } from 'ink'
import React from 'react'
import { Header } from '../src/build/onboarding/ui/components.tsx'
import { pickPlatformLayout } from '../src/build/onboarding/ui/frame-fit.ts'
import { PlatformPicker } from '../src/build/onboarding/ui/platform-picker.tsx'
import { useTerminalSize } from '../src/build/onboarding/ui/shell.tsx'
import { renderFrameText, renderResizeFrames } from './helpers/frame-fit.mjs'

let passed = 0
let failed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`✔ ${name}`) }
  catch (error) { failed++; console.error(`✖ ${name}\n  ${error.message}`) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }
const h = React.createElement
const noop = () => {}

// The shell's frame shape: minHeight + compact header + picker, layout chosen by
// pickPlatformLayout (cards when wide/tall, list otherwise) — same wiring as
// shell.tsx. shellFrame is pure (rows/cols in → JSX out) so it doubles as the
// reference render to compare the resized output against.
function shellFrame(cols, rows) {
  const layout = pickPlatformLayout(cols, rows)
  return h(
    Box,
    { flexDirection: 'column', minHeight: rows, padding: 1 },
    h(Header, { compact: layout === 'list' }),
    h(PlatformPicker, { layout, onSelect: noop }),
  )
}
// Same shape, but driven by the REAL useTerminalSize hook (reads stdout live).
function Shell() {
  const { cols, rows } = useTerminalSize()
  return shellFrame(cols, rows)
}
const norm = f => (f ?? '').replace(/\n$/, '')

// 1. Shrink: the frame follows the new (smaller) height exactly.
await test('shrink 24→20 rows: resized frame matches a fresh 20-row render', async () => {
  const { before, after } = await renderResizeFrames(h(Shell), { from: { cols: 80, rows: 24 }, to: { cols: 80, rows: 20 } })
  assert(before.length >= 1, 'no initial frame rendered')
  assert(after.length >= 1, 'resize produced no new frame — resize handling is dead')
  assert(norm(before.at(-1)) === renderFrameText(shellFrame(80, 24), 80), 'initial frame is not the expected 24-row layout')
  assert(norm(after.at(-1)) === renderFrameText(shellFrame(80, 20), 80), 'after shrink, frame does not match a fresh 20-row render')
})

// 2. Grow: the frame follows the new (taller) height and the legend re-pins to
//    the new bottom (not stranded mid-frame).
await test('grow 20→40 rows: resized frame matches a fresh 40-row render, legend at bottom', async () => {
  const { after } = await renderResizeFrames(h(Shell), { from: { cols: 80, rows: 20 }, to: { cols: 80, rows: 40 } })
  assert(after.length >= 1, 'resize produced no new frame')
  const finalFrame = norm(after.at(-1))
  assert(finalFrame === renderFrameText(shellFrame(80, 40), 80), 'after grow, frame does not match a fresh 40-row render')
  const lines = finalFrame.split('\n')
  const legendIdx = lines.findIndex(l => /choose .* Enter/.test(l))
  assert(legendIdx >= 0, 'legend missing after grow')
  assert(legendIdx >= lines.length - 4, `legend at row ${legendIdx} not near the bottom of the ${lines.length}-row frame`)
})

// 3. Responsive: narrowing past the cards threshold switches cards → list.
await test('resize cols 80→40: layout switches from cards to list', async () => {
  const { before, after } = await renderResizeFrames(h(Shell), { from: { cols: 80, rows: 24 }, to: { cols: 40, rows: 24 } })
  assert(/Apple App Store/.test(norm(before.at(-1))), 'expected cards layout at 80 cols (with store hints)')
  const finalFrame = norm(after.at(-1))
  assert(finalFrame === renderFrameText(shellFrame(40, 24), 40), 'after narrowing, frame does not match a fresh 40-col list render')
  // list layout uses the @inkjs/ui Select — no card store-hint subtitles.
  assert(!/Apple App Store/.test(finalFrame), 'still showing card hints after narrowing — layout did not switch to list')
  assert(/iOS/.test(finalFrame) && /Android/.test(finalFrame), 'list options missing after narrowing')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
