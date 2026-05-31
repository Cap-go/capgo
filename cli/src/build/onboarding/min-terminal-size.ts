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
// through a real terminal emulator (@xterm/headless), and reports the tallest
// PER PLATFORM:
//
//   iOS     width 80 → 38 rows   (tallest: api-key-instructions)
//   Android width 80 → 49 rows   (tallest: google-sign-in-learn-more, the GCP explainer)
//
// The two wizards differ: iOS signs with an App Store Connect API key + certs
// (it has no Google/GCP step), so its tallest static step is shorter than
// Android's GCP service-account explainer. A single shared floor would force iOS
// users to have 11 rows they never need — so the floor is PER PLATFORM.
//
// Width is fixed at 80 (the classic default) so the row floor is deterministic;
// narrower terminals wrap text taller, which would raise the row requirement.
// The matching test (test/test-onboarding-min-size.mjs) re-runs the harness and
// FAILS if any static step grows past ITS platform's floor at MIN_COLS, so these
// numbers can never silently drift from reality.
//
// Dynamic / unbounded content is NOT part of this floor — it scrolls or cuts, so
// it never forces a resize: the completed-steps log (cuts to a summary line), the
// AI analysis + build log (fullscreen scroll viewers), and the iOS error screen
// (its recovery advice is unbounded — 42–54 rows — so it routes through the same
// scroll viewer as the AI analysis rather than dictating a 54-row floor).
export const MIN_COLS = 80

// Per-platform row floors at MIN_COLS. See the harness output above.
export const IOS_MIN_ROWS = 38
export const ANDROID_MIN_ROWS = 49

// Conservative default for platform-agnostic callers (the generic MinSizeGate /
// TerminalTooSmallPrompt default): the LARGER floor, so a gate with no platform
// context never under-reserves. Computed (not aliased to ANDROID_MIN_ROWS) so it
// stays correct if the per-platform floors are ever reordered.
export const MIN_ROWS = Math.max(IOS_MIN_ROWS, ANDROID_MIN_ROWS)

/** The full-onboarding row floor for a given platform. */
export function onboardingMinRows(platform: 'ios' | 'android'): number {
  return platform === 'ios' ? IOS_MIN_ROWS : ANDROID_MIN_ROWS
}

/**
 * True when the given terminal size can run a platform's onboarding without a
 * mid-flow resize. `platform` defaults to the conservative 'android' (larger)
 * floor for platform-agnostic callers.
 */
export function terminalFitsOnboarding(cols: number, rows: number, platform: 'ios' | 'android' = 'android'): boolean {
  return cols >= MIN_COLS && rows >= onboardingMinRows(platform)
}

// A much smaller floor for the PLATFORM PICKER specifically. The picker is shown
// before a platform is chosen and isn't gated to the full onboarding floor — the
// user must be able to pick first (the step floor is enforced afterward). But if
// the terminal is so small the boxed banner can't even render, the picker screen
// is broken and onboarding can't run anyway, so we show the resize prompt
// instead of a clipped banner. Measured via the VT harness: the boxed banner is
// 44 cols wide, and banner + the list-form picker is 11 rows.
export const PICKER_MIN_COLS = 44
export const PICKER_MIN_ROWS = 11

/** True when the terminal can render the platform picker (banner + picker). */
export function terminalFitsPicker(cols: number, rows: number): boolean {
  return cols >= PICKER_MIN_COLS && rows >= PICKER_MIN_ROWS
}
