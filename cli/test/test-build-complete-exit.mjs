#!/usr/bin/env bun
// Unit test for isBuildCompleteDismissKey — the pure predicate behind the
// build-complete success screen's "wait for the user, don't auto-exit" behavior.
// The screen used to auto-exit 100ms after rendering, which wiped the final
// frame on the alt-screen instantly (the user never got to read it). Now it
// stays until the user presses Enter / Esc / q. This guards that contract
// without rendering the whole app (driving OnboardingApp to build-complete
// would require mocking the entire flow — Supabase, Apple API, etc.).
import process from 'node:process'
import { isBuildCompleteDismissKey } from '../src/build/onboarding/ui/components.tsx'

let passed = 0
let failed = 0
function check(name, cond) {
  if (cond) {
    passed++
    console.log(`✔ ${name}`)
  }
  else {
    failed++
    console.error(`✖ ${name}`)
  }
}

// Dismiss keys — the user is done reading and wants to exit.
check('Enter dismisses', isBuildCompleteDismissKey('', { return: true }) === true)
check('Esc dismisses', isBuildCompleteDismissKey('', { escape: true }) === true)
check('q dismisses', isBuildCompleteDismissKey('q', {}) === true)

// Non-dismiss keys — the success screen must PERSIST (the whole point of the
// fix). A stray keypress should not tear down the frame.
check('plain letter does not dismiss', isBuildCompleteDismissKey('x', {}) === false)
check('arrow key does not dismiss', isBuildCompleteDismissKey('', { downArrow: true }) === false)
check('space does not dismiss', isBuildCompleteDismissKey(' ', {}) === false)
check('no input + no key does not dismiss', isBuildCompleteDismissKey('', {}) === false)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
