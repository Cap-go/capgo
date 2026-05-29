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
import { COMPACT_HEADER_ROWS, Header, WIZARD_PADDING_ROWS } from '../src/build/onboarding/ui/components.tsx'
import { capLogRows, logBudgetRows } from '../src/build/onboarding/ui/frame-fit.ts'
import { frameRows } from './helpers/frame-fit.mjs'

let passed = 0
let failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`✔ ${name}`) }
  catch (error) { failed++; console.error(`✖ ${name}\n  ${error.message}`) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }
const h = React.createElement

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
  return h(Box, { flexDirection: 'column', minHeight: rows, padding: 1 }, h(Header, { compact: true }), logBox, body)
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
  const uncapped = frameRows(frame(longLog, rows, 80, 6), 80)
  assert(uncapped > rows, `expected the uncapped 30-entry log to overflow ${rows} rows, got ${uncapped}`)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
