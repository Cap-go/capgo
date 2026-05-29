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
// eventually pushes the current step off-screen (or trips the resize prompt)
// even on a normal terminal. The log is rendered OUTSIDE the measured step body
// and capped here to whatever rows are left over, newest-first, with a one-line
// summary for the rest — so the current step always wins the space and the log
// never causes a too-small. Wrap-aware: a long line (e.g. a key-file path)
// counts as the rows it occupies, not one.
export interface CappedLog<T> {
  hidden: number
  visible: T[]
}

export function capLogRows<T extends { text: string }>(entries: T[], maxRows: number, cols: number): CappedLog<T> {
  const width = Math.max(1, Math.floor(cols))
  const rowsFor = (text: string): number => Math.max(1, Math.ceil(text.length / width))
  if (maxRows <= 0)
    return { hidden: entries.length, visible: [] }

  let total = 0
  for (const e of entries)
    total += rowsFor(e.text)
  if (total <= maxRows)
    return { hidden: 0, visible: entries }

  // Doesn't all fit: reserve one row for the summary line, then pack the most
  // recent entries that fit the remaining budget.
  const budget = Math.max(0, maxRows - 1)
  const visible: T[] = []
  let used = 0
  for (let i = entries.length - 1; i >= 0; i--) {
    const r = rowsFor(entries[i].text)
    if (visible.length > 0 && used + r > budget)
      break
    visible.unshift(entries[i])
    used += r
    if (used >= budget)
      break
  }
  return { hidden: entries.length - visible.length, visible }
}
