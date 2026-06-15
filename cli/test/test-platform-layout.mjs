#!/usr/bin/env node
// Tests for the platform picker's pure decision logic: the responsive
// cards-vs-list layout choice and the arrow/Enter keypress mapping.
import {
  PLATFORM_CARDS_MIN_COLS,
  PLATFORM_CARDS_MIN_ROWS,
  pickPlatformLayout,
} from '../src/build/onboarding/ui/frame-fit.ts'
import { platformKeyAction } from '../src/build/onboarding/ui/platform-picker.tsx'

let passed = 0
let failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`✔ ${name}`) }
  catch (error) { failed++; console.error(`✖ ${name}\n  ${error.message}`) }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${msg || 'mismatch'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

// ── pickPlatformLayout ───────────────────────────────────────────────────────
test('cards when wide AND tall', () => {
  eq(pickPlatformLayout(80, 24), 'cards')
  eq(pickPlatformLayout(120, 40), 'cards')
})
test('exactly at the thresholds → cards', () => {
  eq(pickPlatformLayout(PLATFORM_CARDS_MIN_COLS, PLATFORM_CARDS_MIN_ROWS), 'cards')
})
test('one below width → list', () => {
  eq(pickPlatformLayout(PLATFORM_CARDS_MIN_COLS - 1, 40), 'list')
})
test('one below height → list (e.g. a short split pane)', () => {
  eq(pickPlatformLayout(120, PLATFORM_CARDS_MIN_ROWS - 1), 'list')
})
test('narrow terminal → list', () => {
  eq(pickPlatformLayout(40, 50), 'list')
})
test('tiny terminal → list', () => {
  eq(pickPlatformLayout(20, 8), 'list')
})

// ── platformKeyAction ────────────────────────────────────────────────────────
test('left / h / 1 → select iOS', () => {
  eq(platformKeyAction('', { leftArrow: true }), { type: 'select', platform: 'ios' })
  eq(platformKeyAction('h', {}), { type: 'select', platform: 'ios' })
  eq(platformKeyAction('1', {}), { type: 'select', platform: 'ios' })
})
test('right / l / 2 → select Android', () => {
  eq(platformKeyAction('', { rightArrow: true }), { type: 'select', platform: 'android' })
  eq(platformKeyAction('l', {}), { type: 'select', platform: 'android' })
  eq(platformKeyAction('2', {}), { type: 'select', platform: 'android' })
})
test('Enter → confirm', () => {
  eq(platformKeyAction('', { return: true }), { type: 'confirm' })
})
test('Enter wins over arrows when both set', () => {
  eq(platformKeyAction('', { return: true, leftArrow: true }), { type: 'confirm' })
})
test('unrelated key → null', () => {
  eq(platformKeyAction('x', {}), null)
  eq(platformKeyAction('', {}), null)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
