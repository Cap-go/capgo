// src/build/onboarding/min-terminal-size.ts
//
// The minimum terminal size `capgo build init` onboarding requires. Enforced
// ONCE at startup (see command.ts): if the terminal is smaller, we ask the user
// to resize (or offer to relaunch in a correctly-sized window) BEFORE the wizard
// starts. Past that gate, every step is guaranteed to fit, so onboarding never
// shows "terminal too small" mid-flow — which lets the steps drop their
// adaptive "dense" fallback entirely and always render the full, comfortable
// form.
//
// These numbers are not guessed — they are produced by the VT size-search
// harness (test/find-min-onboarding-size.mjs), which renders EVERY static step
// in its comfortable form (worst-case content) plus the completed-steps log,
// through a real terminal emulator (@xterm/headless), and reports the tallest:
//
//   width 80 → 49 rows   (tallest: google-sign-in-learn-more)
//
// Width is fixed at 80 (the classic default) so the row floor is deterministic;
// narrower terminals wrap text taller (53 @ 60 cols), which would raise the row
// requirement. The matching test (test/test-onboarding-min-size.mjs) re-runs the
// harness and FAILS if any static step grows past MIN_ROWS at MIN_COLS, so this
// number can never silently drift from reality.
//
// Dynamic content (the completed-steps log, AI analysis, the build log) is NOT
// part of this floor beyond the log's minimal cut form: those scroll or cut, so
// they never force a resize.
export const MIN_COLS = 80
export const MIN_ROWS = 49

/** True when the given terminal size can run onboarding without a mid-flow resize. */
export function terminalFitsOnboarding(cols: number, rows: number): boolean {
  return cols >= MIN_COLS && rows >= MIN_ROWS
}
