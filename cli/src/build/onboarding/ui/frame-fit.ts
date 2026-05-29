// Pure frame-fit DECISION logic for the onboarding wizard's adaptive spacing.
// Extracted from the parent `app.tsx` state machine so it can be unit-tested
// independently of Ink rendering (see test/test-frame-fit-decision.mjs).
import { COMPACT_HEADER_ROWS, WIZARD_PADDING_ROWS } from './components.js'

// Rows the one-line compact header + the wizard's outer padding occupy.
export const COMPACT_HEADER_TOTAL_ROWS = COMPACT_HEADER_ROWS + WIZARD_PADDING_ROWS

export interface FrameFitInput {
  // Measured body height FOR THE CURRENT DENSITY, or null when unknown — before
  // the first measure, or right after a density flip when the only measurement
  // we have was taken at the other density (stale).
  bodyRows: number | null
  // Whether the body is currently rendering its compact (dense) form.
  dense: boolean
  terminalRows: number
}

// Decide whether to show the "terminal too small" resize prompt.
//
// CRITICAL: only block when we are ALREADY dense — i.e. there is no smaller
// form left to fall back to. When the COMFORTABLE form overflows we must NOT
// block; the parent collapses to dense (see shouldCollapseToDense) and
// re-measures. Blocking while a denser form is still available unmounts the
// body, which kills the measure→re-measure loop and wedges the wizard on the
// resize prompt forever. A null bodyRows means "not yet measured at the
// current density" (pre-measure, or stale right after a flip) → render
// optimistically so the body can be measured; only a terminal too short for
// the one-line header + padding + a single content row is blocked pre-measure.
export function isFrameTooSmall({ bodyRows, dense, terminalRows }: FrameFitInput): boolean {
  if (bodyRows == null)
    return terminalRows < COMPACT_HEADER_TOTAL_ROWS + 1
  return dense && bodyRows + COMPACT_HEADER_TOTAL_ROWS > terminalRows
}

// A comfortable (non-dense) body should collapse to its dense form when it
// overflows the viewport even with the one-line compact header.
export function shouldCollapseToDense({ bodyRows, terminalRows }: { bodyRows: number, terminalRows: number }): boolean {
  return bodyRows + COMPACT_HEADER_TOTAL_ROWS > terminalRows
}

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
// row count. A one-line summary stands in for hidden steps, but only when it
// actually condenses ≥ 2 of them — with a single step to hide, or only one row
// to spare, we show the step itself rather than a pointless "…and 1 earlier
// step done" placeholder.
export function capLogRows<T>(entries: T[], maxRows: number): CappedLog<T> {
  if (maxRows <= 0)
    return { hidden: 0, visible: [] }
  if (entries.length <= maxRows)
    return { hidden: 0, visible: entries }
  // Overflow. A summary line + ≥1 entry needs ≥2 rows; with only one row to
  // spare, show the single newest step instead of an all-hiding summary.
  if (maxRows < 2)
    return { hidden: 0, visible: entries.slice(entries.length - maxRows) }
  // Reserve one row for the summary; show the most-recent entries in the rest.
  // entries.length > maxRows here, so hidden = length − (maxRows − 1) ≥ 2: the
  // summary always represents at least two steps.
  const visibleCount = maxRows - 1
  return { hidden: entries.length - visibleCount, visible: entries.slice(entries.length - visibleCount) }
}
