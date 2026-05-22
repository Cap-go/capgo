#!/usr/bin/env node
// Tests for the AI-result fit estimator used by the onboarding TUI to decide
// whether to render the analysis inline or route it through the scrollable
// FullscreenAiViewer.
//
// The heuristic is deliberately conservative — prefers "scroll" when in doubt
// — so the tests focus on:
//   1. Empty text  → never overflows.
//   2. Text that fits comfortably → returns false.
//   3. Text that obviously overflows → returns true.
//   4. ANSI escape codes don't inflate the estimate.
//   5. Long single line that would wrap → counted as multiple rows.
import {
  AI_RESULT_CHROME_ROWS,
  estimateRenderedRows,
  isAiAnalysisTooTall,
  stripAnsi,
} from '../src/build/onboarding/ai-fit.ts'

let passed = 0
let failed = 0
function test(name, fn) {
  try {
    fn()
    console.log(`✅ ${name}`)
    passed++
  }
  catch (err) {
    console.error(`❌ ${name}\n   ${err.message}`)
    failed++
  }
}

test('AI_RESULT_CHROME_ROWS is conservative (≥ 15)', () => {
  if (AI_RESULT_CHROME_ROWS < 15)
    throw new Error(`chrome reserve too small: ${AI_RESULT_CHROME_ROWS}`)
})

test('stripAnsi removes SGR escape codes', () => {
  const styled = `\x1b[1;36mhello\x1b[0m world`
  if (stripAnsi(styled) !== 'hello world')
    throw new Error(`got ${JSON.stringify(stripAnsi(styled))}`)
})

test('estimateRenderedRows returns 0 for empty text', () => {
  if (estimateRenderedRows('', 80) !== 0)
    throw new Error('empty should be 0')
})

test('estimateRenderedRows counts each newline as a row floor of 1', () => {
  // 5 short lines → 5 rows
  const txt = ['a', 'b', '', 'c', 'd'].join('\n')
  const rows = estimateRenderedRows(txt, 80)
  if (rows !== 5)
    throw new Error(`expected 5, got ${rows}`)
})

test('estimateRenderedRows accounts for line wrap', () => {
  // 160 chars on a 40-col terminal → 4 rows
  const txt = 'a'.repeat(160)
  const rows = estimateRenderedRows(txt, 40)
  if (rows !== 4)
    throw new Error(`expected 4, got ${rows}`)
})

test('estimateRenderedRows ignores ANSI codes for length', () => {
  // 'hello' with red color = 5 visible chars, should be 1 row at width 80
  const txt = `\x1b[31mhello\x1b[0m`
  const rows = estimateRenderedRows(txt, 80)
  if (rows !== 1)
    throw new Error(`expected 1, got ${rows}`)
})

test('isAiAnalysisTooTall: empty text → false', () => {
  if (isAiAnalysisTooTall('', 30, 80) !== false)
    throw new Error('empty should fit')
})

test('isAiAnalysisTooTall: short text on a tall terminal → false (fits)', () => {
  const txt = ['### Likely cause', '', 'Missing entitlement.'].join('\n')
  if (isAiAnalysisTooTall(txt, 40, 80) !== false)
    throw new Error('3 short lines on 40-row terminal should fit')
})

test('isAiAnalysisTooTall: many lines on a small terminal → true (overflows)', () => {
  // 50 lines on a 24-row terminal — definitely doesn't fit
  const txt = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n')
  if (isAiAnalysisTooTall(txt, 24, 80) !== true)
    throw new Error('50 lines on 24-row terminal should NOT fit')
})

test('isAiAnalysisTooTall: borderline case errs on the side of scroll (conservative)', () => {
  // 20 rows of text, 24-row terminal, 20-row chrome reserve → 4 rows budget.
  // 20 > 4, must return true.
  const txt = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n')
  if (isAiAnalysisTooTall(txt, 24, 80) !== true)
    throw new Error('borderline should err toward true')
})

test('isAiAnalysisTooTall: very tall terminal accepts moderate analyses', () => {
  // 10 rows of text, 60-row terminal — fits easily even with 20-row chrome
  const txt = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n')
  if (isAiAnalysisTooTall(txt, 60, 80) !== false)
    throw new Error('10 lines on 60-row terminal should fit')
})

test('isAiAnalysisTooTall: one very long wrapping line on narrow terminal → true', () => {
  // One logical line, 800 chars, 40-col terminal → 20 wrapped rows
  // 20 rows on 24-row terminal with 20-row chrome → 4 budget → overflows.
  const txt = 'a'.repeat(800)
  if (isAiAnalysisTooTall(txt, 24, 40) !== true)
    throw new Error('long wrapping line should overflow')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0)
  process.exit(1)
