// Pure frame-fit DECISION logic for the onboarding wizard's adaptive spacing.
// Extracted from the parent `app.tsx` state machine so it can be unit-tested
// independently of Ink rendering.
import { WIZARD_PADDING_ROWS } from './components.js'

// ── Platform picker layout ───────────────────────────────────────────────────
// The platform picker renders two bordered "cards" side-by-side when there's
// room, else the same vertical Select used elsewhere. Cards need horizontal
// room for two boxes + gap AND vertical room to fit within the frame budget.
export type PlatformPickerLayout = 'cards' | 'list'

// Two cards (~19 cols each: "Apple App Store" + paddingX(2) + border) + a 3-col
// gap ≈ 41; round up for safety. Below this, stack them as the vertical list.
export const PLATFORM_CARDS_MIN_COLS = 44
// The cards layout uses the BOXED header (5 rows), so the full frame —
// boxed header + wizard padding + heading + cards + legend — measures ~15
// rows. Require the whole 16-row contract before showing cards; otherwise the
// alt buffer would clip the top (the banner) instead of falling back. Below
// this, the compact list (boxless header, ~6 rows total) is used.
export const PLATFORM_CARDS_MIN_ROWS = 16

export function pickPlatformLayout(cols: number, rows: number): PlatformPickerLayout {
  return cols >= PLATFORM_CARDS_MIN_COLS && rows >= PLATFORM_CARDS_MIN_ROWS ? 'cards' : 'list'
}

// ── Completed-steps log capping ──────────────────────────────────────────────
// The "✔ step done" log grows on every completed step, so left unbounded it
// eventually pushes the current step off-screen (or trips the resize prompt).
// The log is rendered OUTSIDE the measured step body and capped here to the
// rows it's allowed.

// Rows available for the log: the terminal minus the header, the wizard
// padding, the measured step body, and the log block's own top margin (1).
// Clamped at 0. By construction `logBudgetRows + headerRows + WIZARD_PADDING_ROWS
// + bodyHeight + 1 ≤ terminalRows`, so a log capped to this budget can never
// push the frame past the terminal — i.e. the log can't cause a "too small".
export function logBudgetRows(terminalRows: number, headerRows: number, bodyHeight: number): number {
  return Math.max(0, terminalRows - headerRows - WIZARD_PADDING_ROWS - bodyHeight - 1)
}

export interface CappedLog<T> {
  hidden: number
  visible: T[]
}

// Pick the most-recent entries that fit `maxRows`. Each entry occupies EXACTLY
// ONE row (the caller truncates long lines like file paths), so this is a plain
// row count.
//
// When the entries overflow `maxRows`, the summary line ("…and N earlier steps
// done") is MANDATORY — we never hide the fact that more completed steps exist.
// It takes one row; the remaining rows show the most-recent entries (newest-
// last). With `maxRows === 1` the summary is therefore the only line (no
// concrete step shown) rather than a step that silently drops the "there's more"
// indicator. `hidden` is always ≥ 2 in the overflow case (entries.length >
// maxRows ⇒ length − (maxRows − 1) ≥ 2), so we never render a summary for a
// single hidden step ("…and 1 earlier step done").
export function capLogRows<T>(entries: T[], maxRows: number): CappedLog<T> {
  if (maxRows <= 0)
    return { hidden: 0, visible: [] }
  if (entries.length <= maxRows)
    return { hidden: 0, visible: entries }
  const visibleCount = maxRows - 1
  return { hidden: entries.length - visibleCount, visible: entries.slice(entries.length - visibleCount) }
}
