#!/usr/bin/env node
// Regression tests for the completed-steps log capping — the layer that
// actually bit us: the log lived inside the measured body and grew on every
// step, eventually tripping "Terminal too small" on a normal terminal.
//
// These test the REAL fix, not just the pure helper:
//   1. logBudgetRows invariant — a log capped to the budget + the header +
//      padding + body + margin always fits the terminal (so the log can never
//      cause a too-small).
//   2. composition — rendering the app's frame shape (header + capped log +
//      body) with a LONG log fits the terminal, whereas the UNCAPPED log
//      overflows it. That difference is the bug → fix.
import { Box, Text } from 'ink'
import React from 'react'
import { CompletedStepsLog } from '../src/build/onboarding/ui/completed-steps-log.tsx'
import { COMPACT_HEADER_ROWS, WIZARD_PADDING_ROWS } from '../src/build/onboarding/ui/components.tsx'
import { capLogRows, logBudgetRows } from '../src/build/onboarding/ui/frame-fit.ts'
import { frameRows, renderFrameText } from './helpers/frame-fit.mjs'

let passed = 0
let failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`✔ ${name}`) }
  catch (error) { failed++; console.error(`✖ ${name}\n  ${error.message}`) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }
const h = React.createElement

// A 1-row header stand-in. This test's subject is the log-capping math (its
// budgets use COMPACT_HEADER_ROWS = 1), NOT the banner — so it uses a 1-row
// placeholder rather than the real Header, which is now always the 5-row boxed
// form (the dynamic compact variant was removed once the startup size gate
// guaranteed the rows for the boxed banner). Includes "Capgo Cloud Build" so the
// header-row findIndex in the gap tests still locates it.
const HeaderStub = () => h(Text, null, '🚀  Capgo Cloud Build · Onboarding')

// The wizard reserves this many rows for the log (its top margin + one summary
// row) in the dense/too-small decision, so the step is never sized to evict it.
const LOG_RESERVE = 2

// ── 1. budget invariant ──────────────────────────────────────────────────────
test('logBudgetRows: budget + chrome + body + margin never exceeds the terminal', () => {
  for (const rows of [12, 16, 19, 24, 40]) {
    for (const headerRows of [COMPACT_HEADER_ROWS, 5]) {
      for (const bodyHeight of [0, 1, 6, 11, 20]) {
        const budget = logBudgetRows(rows, headerRows, bodyHeight)
        assert(budget >= 0, `budget negative: ${budget}`)
        // The full frame: header + padding + body + (1 margin + budget log rows).
        const totalWhenLogPresent = headerRows + WIZARD_PADDING_ROWS + bodyHeight + 1 + budget
        if (budget > 0)
          assert(totalWhenLogPresent <= rows, `overflow: rows=${rows} header=${headerRows} body=${bodyHeight} budget=${budget} total=${totalWhenLogPresent}`)
      }
    }
  }
})

// ── 1b. the reserve guarantees the log summary always has a row ──────────────
// When the step body is sized so the reserve fits (body ≤ terminal − header −
// padding − LOG_RESERVE, which the wizard's dense decision enforces), the log
// budget is ≥ 1 — i.e. the completed-steps summary is never hidden entirely
// just because the current step is tall (the regression the user hit).
test('reserve guarantees a log row whenever the step leaves room for it', () => {
  for (const rows of [16, 19, 24, 40]) {
    for (const headerRows of [COMPACT_HEADER_ROWS, 5]) {
      const maxBody = rows - headerRows - WIZARD_PADDING_ROWS - LOG_RESERVE
      if (maxBody < 0)
        continue
      const budget = logBudgetRows(rows, headerRows, maxBody)
      assert(budget >= 1, `reserve failed: rows=${rows} header=${headerRows} maxBody=${maxBody} budget=${budget}`)
    }
  }
})

// ── 2. composition: long log fits; uncapped log would overflow ───────────────
// Mirror the wizard frame shape AND its one-row-per-entry truncation:
//   <Box minHeight padding><Header/>{log (truncate-middle lines)}{body}</Box>.
function frame(logEntries, rows, bodyHeight) {
  const body = h(Box, { flexDirection: 'column' }, ...Array.from({ length: bodyHeight }, (_, i) => h(Text, { key: i }, `step line ${i + 1}`)))
  const logBox = logEntries.length > 0
    ? h(Box, { flexDirection: 'column', marginTop: 1 }, ...logEntries.map((e, i) => h(Text, { key: i, wrap: 'truncate-middle' }, e.text)))
    : null
  return h(Box, { flexDirection: 'column', minHeight: rows, padding: 1 }, h(HeaderStub, null), logBox, body)
}

// 30 completed steps, one a long key-file path — the real scenario.
const longLog = [
  ...Array.from({ length: 28 }, (_, i) => ({ text: `✔ step ${i + 1} done`, color: 'green' })),
  { text: '✔ Key file selected · /Users/me/dev/app/tutorial/capgo-tutorial/AuthKey_66FGQZB566.p8', color: 'green' },
  { text: '✔ Credentials saved', color: 'green' },
]

for (const rows of [16, 19, 24]) {
  test(`capped log fits a ${rows}-row terminal (was: too small)`, () => {
    const bodyHeight = 6
    const budget = logBudgetRows(rows, COMPACT_HEADER_ROWS, bodyHeight)
    const { visible } = capLogRows(longLog, budget)
    const cappedEntries = [{ text: '…and N earlier steps done (resize taller to see all)', color: 'gray' }, ...visible]
    const capped = frameRows(frame(cappedEntries, rows, bodyHeight), 80)
    assert(capped <= rows, `capped frame is ${capped} rows, exceeds ${rows}`)
  })
}

test('UNCAPPED long log overflows — proving the cap is what prevents too-small', () => {
  const rows = 19
  const uncapped = frameRows(frame(longLog, rows, 6), 80)
  assert(uncapped > rows, `expected the uncapped 30-entry log to overflow ${rows} rows, got ${uncapped}`)
})

// ── 3. CompletedStepsLog: the separator gap follows the block, not the budget ─
// The bug: when the cap collapses the log to a single line (the summary line
// dropped to save a row), the block's top-margin blank STAYED — an orphaned gap
// under the header where the summary used to be. The gap must exist only when
// the block is substantial (summary present, or 2+ entries), and vanish in the
// single-line case so the lone completed-step line sits directly under header.
// We render header + log (no padding) so line 0 is the header and the gap, if
// any, is the blank line immediately below it.
function headerPlusLog(entries, maxRows) {
  return renderFrameText(h(Box, { flexDirection: 'column' }, h(HeaderStub, null), h(CompletedStepsLog, { entries, maxRows })), 80).split('\n')
}

test('single row (maxRows=1) + overflow: summary is ALWAYS shown (never hidden), no leading gap', () => {
  const entries = [
    ...Array.from({ length: 6 }, (_, i) => ({ text: `✔ step ${i + 1}`, color: 'green' })),
    { text: '✔ Distribution certificate created — Expires 2027-05-29', color: 'green' },
  ]
  const lines = headerPlusLog(entries, 1)
  const headerIdx = lines.findIndex(l => /Capgo Cloud Build/.test(l))
  // At a one-row budget the summary wins the row (shown alone) — never hidden.
  const summaryIdx = lines.findIndex(l => /\d+ steps done \(resize taller to see all\)/.test(l))
  assert(headerIdx >= 0, 'header missing')
  assert(summaryIdx >= 0, 'summary MUST show even at a one-row budget — we never hide that more steps exist')
  assert(summaryIdx === headerIdx + 1, `single line should sit directly under the header, no gap (header=${headerIdx}, summary=${summaryIdx})`)
  assert(!lines.some(l => /Distribution certificate created/.test(l)), 'at one row, the summary takes the row — no concrete step line')
})

test('summary block (maxRows=2): KEEPS the leading gap', () => {
  const entries = Array.from({ length: 7 }, (_, i) => ({ text: `✔ step ${i + 1}`, color: 'green' }))
  const lines = headerPlusLog(entries, 2)
  const headerIdx = lines.findIndex(l => /Capgo Cloud Build/.test(l))
  const summaryIdx = lines.findIndex(l => /earlier steps done/.test(l))
  assert(headerIdx >= 0 && summaryIdx >= 0, 'header/summary missing')
  assert(summaryIdx === headerIdx + 2, `summary block should keep a blank gap under the header (header=${headerIdx}, summary=${summaryIdx})`)
})

test('multiple entries, no summary (all fit): KEEP the leading gap', () => {
  const lines = headerPlusLog([{ text: '✔ alpha' }, { text: '✔ bravo' }], 5)
  const headerIdx = lines.findIndex(l => /Capgo Cloud Build/.test(l))
  const firstIdx = lines.findIndex(l => /✔ alpha/.test(l))
  assert(headerIdx >= 0 && firstIdx >= 0, 'header/entry missing')
  assert(firstIdx === headerIdx + 2, `a 2-entry block should keep a blank gap under the header (header=${headerIdx}, first=${firstIdx})`)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
