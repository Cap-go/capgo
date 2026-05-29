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

// ── 2. composition: long log fits; uncapped log would overflow ───────────────
// Mirror the wizard frame shape: <Box minHeight padding><Header/>{log}{body}</Box>.
function frame(logEntries, rows, cols, bodyHeight) {
  const body = h(Box, { flexDirection: 'column' }, ...Array.from({ length: bodyHeight }, (_, i) => h(Text, { key: i }, `step line ${i + 1}`)))
  const logBox = logEntries.length > 0
    ? h(Box, { flexDirection: 'column', marginTop: 1 }, ...logEntries.map((e, i) => h(Text, { key: i }, e.text)))
    : null
  return h(Box, { flexDirection: 'column', minHeight: rows, padding: 1 }, h(Header, { compact: true }), logBox, body)
}

// 30 completed steps, one a long key-file path (wraps) — the real scenario.
const longLog = [
  ...Array.from({ length: 28 }, (_, i) => ({ text: `✔ step ${i + 1} done`, color: 'green' })),
  { text: '✔ Key file selected · /Users/me/dev/app/tutorial/capgo-tutorial/AuthKey_66FGQZB566.p8', color: 'green' },
  { text: '✔ Credentials saved', color: 'green' },
]

for (const rows of [16, 19, 24]) {
  test(`capped log fits a ${rows}-row terminal (was: too small)`, () => {
    const bodyHeight = 6
    const budget = logBudgetRows(rows, COMPACT_HEADER_ROWS, bodyHeight)
    const { visible } = capLogRows(longLog, budget, 80)
    // Build the capped log: summary line + visible entries.
    const cappedEntries = [{ text: '…and N earlier steps done (resize taller to see all)', color: 'gray' }, ...visible]
    const capped = frameRows(frame(cappedEntries, rows, 80, bodyHeight), 80)
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
