#!/usr/bin/env node
// Frame-fit + content tests for the in-wizard PlatformPicker. The picker frame
// (header + body + padding) must fit the 16-row contract in BOTH layouts, and
// both platform options must be present in each.
import { Box } from 'ink'
import React from 'react'
import { PlatformPicker } from '../src/build/onboarding/ui/platform-picker.tsx'
import { assertFitsBudget, BODY_BUDGET_ROWS, renderFrameText } from './helpers/frame-fit.mjs'

let passed = 0
let failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`✔ ${name}`) }
  catch (error) { failed++; console.error(`✖ ${name}\n  ${error.message}`) }
}
const h = React.createElement
const noop = () => {}

// Both layouts must fit the body budget at 80 + 60 cols.
test(`cards layout fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(PlatformPicker, { layout: 'cards', onSelect: noop }), 'platform-cards')
})
test(`list layout fits ${BODY_BUDGET_ROWS}-row budget`, () => {
  assertFitsBudget(h(PlatformPicker, { layout: 'list', onSelect: noop }), 'platform-list')
})

// Both platform options render in each layout (so neither card/option is lost).
for (const layout of ['cards', 'list']) {
  test(`${layout} layout shows both iOS and Android`, () => {
    const text = renderFrameText(h(PlatformPicker, { layout, onSelect: noop }), 80)
    if (!/iOS/.test(text))
      throw new Error(`"iOS" missing from ${layout} layout`)
    if (!/Android/.test(text))
      throw new Error(`"Android" missing from ${layout} layout`)
    if (!/platform do you want to set up/i.test(text))
      throw new Error(`heading missing from ${layout} layout`)
  })
}

// Cards layout shows the per-platform hints + the key legend.
test('cards layout shows store hints + key legend', () => {
  const text = renderFrameText(h(PlatformPicker, { layout: 'cards', onSelect: noop }), 80)
  if (!/Apple App Store/.test(text))
    throw new Error('missing "Apple App Store" hint')
  if (!/Google Play/.test(text))
    throw new Error('missing "Google Play" hint')
  if (!/Enter/.test(text))
    throw new Error('missing key legend')
})

// In a full-height frame the legend is pinned to the BOTTOM (a flex spacer
// separates it from the cards), not stacked directly under them.
test('cards layout pins the key legend to the bottom of the frame', () => {
  const rows = 24
  const frame = h(Box, { flexDirection: 'column', minHeight: rows, padding: 1 }, h(PlatformPicker, { layout: 'cards', onSelect: noop }))
  const lines = renderFrameText(frame, 80).split('\n')
  const legendIdx = lines.findIndex(l => /choose .* Enter/.test(l))
  const cardsIdx = lines.findIndex(l => /Apple App Store/.test(l))
  if (legendIdx < 0)
    throw new Error('legend not found')
  if (cardsIdx < 0)
    throw new Error('cards not found')
  // Legend is well below the cards (spacer in between), near the bottom.
  if (legendIdx - cardsIdx < 3)
    throw new Error(`legend (row ${legendIdx}) not separated from cards (row ${cardsIdx}) — expected a spacer`)
  if (legendIdx < rows - 4)
    throw new Error(`legend at row ${legendIdx} is not near the bottom of the ${rows}-row frame`)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
