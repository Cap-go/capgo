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
