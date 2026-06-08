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
  AI_RUNNING_CHROME_ROWS,
  computeMaxScrollOffset,
  estimateRenderedRows,
  isAiAnalysisTooTall,
  pickAiPreviewTail,
  pickVisibleLines,
  resolveAiResultRoute,
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

test('AI_RESULT_CHROME_ROWS matches the inline result-frame chrome (~10)', () => {
  // Must cover the inline chrome (Header + padding + title + caution + Select)
  // so we don't route inline when it would overflow, but NOT be so large that
  // analyses scroll on terminals where they'd fit (the old value of 20 did
  // exactly that — see git history). 6–14 is the sane band.
  if (AI_RESULT_CHROME_ROWS < 6 || AI_RESULT_CHROME_ROWS > 14)
    throw new Error(`chrome reserve out of range: ${AI_RESULT_CHROME_ROWS}`)
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

test('isAiAnalysisTooTall: analysis taller than the inline budget → scroll', () => {
  // 20 rows of text, 24-row terminal, ~10-row chrome reserve → ~14 rows budget.
  // 20 > 14, must return true (route to the scroll viewer).
  const txt = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n')
  if (isAiAnalysisTooTall(txt, 24, 80) !== true)
    throw new Error('a 20-line analysis must not render inline on a 24-row terminal')
})

test('isAiAnalysisTooTall: analysis that fits inline is NOT scrolled', () => {
  // 13 lines on a 26-row terminal: 13 + ~10 chrome = 23 ≤ 26 → render inline,
  // do NOT route to the scroll viewer. (The old reserve of 20 scrolled this.)
  const txt = Array.from({ length: 13 }, (_, i) => `line ${i}`).join('\n')
  if (isAiAnalysisTooTall(txt, 26, 80) !== false)
    throw new Error('a 13-line analysis on a 26-row terminal should render inline')
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

// ── pickVisibleLines ─────────────────────────────────────────────────────────

test('pickVisibleLines: empty input returns []', () => {
  const out = pickVisibleLines([], 0, 10, 80)
  if (out.length !== 0)
    throw new Error('expected []')
})

test('pickVisibleLines: scrollOffset past end returns []', () => {
  const out = pickVisibleLines(['a', 'b'], 5, 10, 80)
  if (out.length !== 0)
    throw new Error('expected []')
})

test('pickVisibleLines: returns at most viewportRows simple lines', () => {
  const lines = ['a', 'b', 'c', 'd', 'e']
  const out = pickVisibleLines(lines, 0, 3, 80)
  if (out.join(',') !== 'a,b,c')
    throw new Error(`got ${out.join(',')}`)
})

test('pickVisibleLines: stops early when wrapped lines would overflow', () => {
  // 80-char line wraps to 4 rows on a 20-col terminal. Viewport 5 rows →
  // 4 (first line) + 1 (second short) = 5 fits exactly, then we stop.
  // The third short line is dropped because rowsUsed already hit viewportRows.
  const lines = ['x'.repeat(80), 'short', 'short']
  const out = pickVisibleLines(lines, 0, 5, 20)
  if (out.length !== 2)
    throw new Error(`expected 2 lines, got ${out.length}`)
})

test('pickVisibleLines: PACKS the viewport, including the line that crosses the bottom', () => {
  // a(1) + b(1) leaves 1 row of slack in a 3-row viewport; the next line wraps
  // to 4 rows. The OLD logic stopped at [a,b] and left a 1-row gap; now we
  // include the long line (the viewer clips it via overflow:hidden) so the
  // viewport is packed full of text. Regression guard for the empty-gap bug.
  const lines = ['a', 'b', 'x'.repeat(80)] // x*80 = 4 rows at 20 cols
  const out = pickVisibleLines(lines, 0, 3, 20)
  if (out.length !== 3)
    throw new Error(`expected the overflowing line to be included (3), got ${out.length}`)
})

test('pickVisibleLines: floor at one line even if it overflows by itself', () => {
  // 200-char line wraps to 10 rows on 20-col terminal, viewport is 5 rows.
  // We still include the line so the viewer isn't blank.
  const lines = ['x'.repeat(200)]
  const out = pickVisibleLines(lines, 0, 5, 20)
  if (out.length !== 1)
    throw new Error('expected 1 line as floor')
})

test('pickVisibleLines: starts from scrollOffset', () => {
  const lines = ['a', 'b', 'c', 'd', 'e']
  const out = pickVisibleLines(lines, 2, 2, 80)
  if (out.join(',') !== 'c,d')
    throw new Error(`got ${out.join(',')}`)
})

// ── computeMaxScrollOffset ───────────────────────────────────────────────────

test('computeMaxScrollOffset: empty input is 0', () => {
  if (computeMaxScrollOffset([], 5, 80) !== 0)
    throw new Error('expected 0')
})

test('computeMaxScrollOffset: simple lines, viewport ≥ count → 0', () => {
  // 5 short lines, viewport 10 — everything fits, max offset is 0
  const lines = ['a', 'b', 'c', 'd', 'e']
  if (computeMaxScrollOffset(lines, 10, 80) !== 0)
    throw new Error('expected 0 when everything fits')
})

test('computeMaxScrollOffset: simple lines, viewport < count → packs from end', () => {
  // 10 short lines, viewport 3 → max offset = 7 (lines 7,8,9 visible)
  const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`)
  if (computeMaxScrollOffset(lines, 3, 80) !== 7)
    throw new Error(`expected 7, got ${computeMaxScrollOffset(lines, 3, 80)}`)
})

test('computeMaxScrollOffset: long wrapping tail line counts for wrap', () => {
  // Last line wraps to 3 rows on a 20-col terminal, viewport 5 → only 2 short
  // tail lines + the wrapping line fit. Actually: tail line takes 3 rows,
  // then 2 more short lines (1 row each) = 5 rows total. So 3 lines fit at
  // the end → max offset = 10 - 3 = 7.
  const lines = [
    ...Array.from({ length: 9 }, (_, i) => `line ${i}`),
    'y'.repeat(60),
  ]
  const got = computeMaxScrollOffset(lines, 5, 20)
  if (got !== 7)
    throw new Error(`expected 7, got ${got}`)
})

// ── resolveAiResultRoute (bidirectional inline ⇄ scroll routing) ─────────────

// A short analysis that comfortably fits inline on any reasonable terminal.
const shortText = ['Likely cause', 'Missing profile.', '', 'Fix', 'Add it.'].join('\n')
// A tall analysis that overflows the inline budget on a small terminal.
const tallText = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')

test('resolveAiResultRoute: inline + too tall → scroll (terminal shrank)', () => {
  const next = resolveAiResultRoute({ current: 'ai-analysis-result', text: tallText, viewedFull: false, terminalRows: 20, terminalCols: 80 })
  if (next !== 'ai-analysis-result-scroll')
    throw new Error(`expected scroll, got ${next}`)
})

// THE REGRESSION: in the scroll viewer, growing the terminal so it fits again
// must route BACK to the inline render. The old one-way logic returned null
// here and the user was stuck in the viewer.
test('resolveAiResultRoute: scroll + now fits → inline (terminal grew back)', () => {
  const next = resolveAiResultRoute({ current: 'ai-analysis-result-scroll', text: shortText, viewedFull: false, terminalRows: 60, terminalCols: 120 })
  if (next !== 'ai-analysis-result')
    throw new Error(`expected inline, got ${next}`)
})

test('resolveAiResultRoute: scroll + still too tall → stay (null)', () => {
  const next = resolveAiResultRoute({ current: 'ai-analysis-result-scroll', text: tallText, viewedFull: false, terminalRows: 16, terminalCols: 80 })
  if (next !== null)
    throw new Error(`expected null (stay in scroll), got ${next}`)
})

test('resolveAiResultRoute: inline + fits → stay (null)', () => {
  const next = resolveAiResultRoute({ current: 'ai-analysis-result', text: shortText, viewedFull: false, terminalRows: 40, terminalCols: 80 })
  if (next !== null)
    throw new Error(`expected null (stay inline), got ${next}`)
})

test('resolveAiResultRoute: viewedFull pins inline even when too tall', () => {
  // User dismissed the viewer; a later shrink must NOT shove them back in.
  const next = resolveAiResultRoute({ current: 'ai-analysis-result', text: tallText, viewedFull: true, terminalRows: 16, terminalCols: 80 })
  if (next !== null)
    throw new Error(`expected null (viewedFull pins inline), got ${next}`)
})

test('resolveAiResultRoute: null text → null (no routing)', () => {
  const next = resolveAiResultRoute({ current: 'ai-analysis-result-scroll', text: null, viewedFull: false, terminalRows: 60, terminalCols: 120 })
  if (next !== null)
    throw new Error(`expected null, got ${next}`)
})

// Stability: routing settles in one hop at any size — re-running from the
// returned step yields null (no oscillation). Sweep representative sizes.
test('resolveAiResultRoute: settles in one hop (no oscillation) across sizes', () => {
  for (const text of [shortText, tallText]) {
    for (const rows of [12, 16, 20, 30, 50]) {
      for (const start of ['ai-analysis-result', 'ai-analysis-result-scroll']) {
        const next = resolveAiResultRoute({ current: start, text, viewedFull: false, terminalRows: rows, terminalCols: 80 })
        const settled = next ?? start
        const again = resolveAiResultRoute({ current: settled, text, viewedFull: false, terminalRows: rows, terminalCols: 80 })
        if (again !== null)
          throw new Error(`oscillation: start=${start} rows=${rows} → ${settled} → ${again}`)
      }
    }
  }
})

// ── pickAiPreviewTail (live streaming preview sizing) ──────────────────────

await test('pickAiPreviewTail: empty text → no rows, no hidden', () => {
  const r = pickAiPreviewTail('', 40, 80)
  if (r.rows.length !== 0 || r.hidden !== 0) throw new Error(JSON.stringify(r))
})

await test('pickAiPreviewTail: short text returns exactly its content (no padding)', () => {
  const r = pickAiPreviewTail('one\ntwo', 40, 80)
  if (r.rows.length !== 2) throw new Error(`expected 2 rows, got ${r.rows.length}`)
  if (r.rows[0] !== 'one' || r.rows[1] !== 'two') throw new Error(JSON.stringify(r.rows))
  if (r.hidden !== 0) throw new Error(`hidden ${r.hidden}`)
})

await test('pickAiPreviewTail: uses the real viewport — tall terminal hides nothing', () => {
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
  const r = pickAiPreviewTail(lines, 50, 80) // budget 42 > 30 lines
  if (r.hidden !== 0) throw new Error(`expected nothing hidden on a tall terminal, hidden=${r.hidden}`)
})

await test('pickAiPreviewTail: small terminal hides earliest lines only', () => {
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
  const r = pickAiPreviewTail(lines, 20, 80) // budget 10 (chrome 10)
  if (r.hidden !== 20) throw new Error(`hidden ${r.hidden}`)
  if (r.rows[0] !== 'line 20') throw new Error(`first visible ${r.rows[0]}`)
  if (r.rows[r.rows.length - 1] !== 'line 29') throw new Error('tail must end at the latest line')
})

await test('pickAiPreviewTail: wrap-aware — a long line costs multiple rows of budget', () => {
  const long = 'x'.repeat(200) // 3 rows at 80 cols
  const text = [long, long, long, long, long].join('\n') // 15 rows of content
  const r = pickAiPreviewTail(text, 20, 80) // budget 10 → only 3 long lines (9 rows) fit
  if (r.hidden !== 2) throw new Error(`hidden ${r.hidden}`)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0)
  process.exit(1)
