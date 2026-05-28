#!/usr/bin/env node
// Tests for the PARENT wizard's adaptive frame-fit DECISION logic — the layer
// the per-component frame-fit tests don't reach.
//
// Regression: the adaptive "comfortable by default, collapse to dense when the
// viewport can't fit it" logic deadlocked. When the comfortable body overflowed
// it reported the frame "too small" (showing the resize prompt) EVEN THOUGH a
// denser form was still available — and because the resize prompt unmounts the
// body, the dense form could never be measured, wedging the wizard on
// "Resize taller — at least N rows" forever. These tests lock the contract:
//   • while a denser form is still available, NEVER report too-small;
//   • a stale (wrong-density) measurement must not trigger too-small;
//   • only block when even the dense form can't fit.
import {
  COMPACT_HEADER_TOTAL_ROWS,
  isFrameTooSmall,
  shouldCollapseToDense,
} from '../src/build/onboarding/ui/frame-fit.ts'

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
function assert(cond, msg) {
  if (!cond)
    throw new Error(msg)
}

// Sanity: compact header + padding = 1 + 2.
test('COMPACT_HEADER_TOTAL_ROWS is 3', () => {
  assert(COMPACT_HEADER_TOTAL_ROWS === 3, `expected 3, got ${COMPACT_HEADER_TOTAL_ROWS}`)
})

// THE BUG: ai-analysis-result at 17 rows. Comfortable body = 15 → 15+3=18 > 17
// overflows. While still comfortable (dense=false) we must NOT block — the
// parent collapses to dense instead. The old logic returned true here → resize
// prompt → body unmounts → dense never measured → permanent deadlock.
test('comfortable overflow is NOT too-small while a dense fallback remains', () => {
  assert(isFrameTooSmall({ bodyRows: 15, dense: false, terminalRows: 17 }) === false, 'must not block in comfortable mode')
})

test('comfortable overflow DOES trigger a collapse-to-dense', () => {
  assert(shouldCollapseToDense({ bodyRows: 15, terminalRows: 17 }) === true, 'should flip to dense')
})

// Right after the flip the only measurement we have was taken in the OTHER
// density, so the parent passes bodyRows=null. That must render optimistically
// (not block) so the dense body can be measured.
test('stale measurement after a density flip does NOT block', () => {
  assert(isFrameTooSmall({ bodyRows: null, dense: true, terminalRows: 17 }) === false, 'null body must render, not block')
})

test('dense body that fits is NOT too-small', () => {
  assert(isFrameTooSmall({ bodyRows: 8, dense: true, terminalRows: 17 }) === false, 'dense fits → render')
})

// Only legitimate too-small: even the dense form overflows.
test('dense body that still overflows IS too-small (legit resize prompt)', () => {
  assert(isFrameTooSmall({ bodyRows: 16, dense: true, terminalRows: 12 }) === true, 'dense overflow → block')
})

test('comfortable body that fits neither blocks nor collapses', () => {
  assert(isFrameTooSmall({ bodyRows: 9, dense: false, terminalRows: 30 }) === false)
  assert(shouldCollapseToDense({ bodyRows: 9, terminalRows: 30 }) === false)
})

// Pre-measure: only a terminal too short for one-line header + padding + a row
// is blocked before we know the body height.
test('truly tiny terminal blocks pre-measure', () => {
  assert(isFrameTooSmall({ bodyRows: null, dense: false, terminalRows: 3 }) === true)
  assert(isFrameTooSmall({ bodyRows: null, dense: false, terminalRows: 4 }) === false)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
