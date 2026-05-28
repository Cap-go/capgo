/**
 * Fit estimation for the AI analysis result step in the onboarding TUI.
 *
 * The on-failure AI flow can return a multi-screen markdown diagnosis. If
 * that text doesn't fit in the user's current terminal viewport we MUST
 * route it through the scrollable `FullscreenAiViewer` — otherwise the
 * earlier lines scroll out of view and the onboarding wizard ends up in
 * an unreadable state.
 *
 * The estimator deliberately errs on the side of "doesn't fit": a
 * false-positive scroll is fine (just one more keystroke for the user),
 * but a false-negative inline render is bad UX (text disappears off the
 * top of the screen).
 */

// Rows the inline ai-analysis-result frame spends on chrome AROUND the
// analysis text: compact Header + outer padding + "AI analysis" title + the
// "AI can make mistakes" caution + the retry/skip Select. We route to the
// fullscreen scroll viewer only when the analysis won't fit inline even after
// the frame collapses to its dense (compact) form — so the inline path shows
// the WHOLE analysis whenever the terminal has room. 20 was far too
// conservative: it scrolled even on tall terminals where everything fit. The
// dense + too-small safety net catches anything that still overflows once
// rendered inline, so a tight reserve here is safe.
export const AI_RESULT_CHROME_ROWS = 10

// ESC sequence used by `renderMarkdown` and `kleur`/`chalk` to color text.
// The escape byte (0x1B) lives in a private-use region so the regex below
// is exact even for input that includes literal '[' or 'm' bytes.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B\[[0-9;]*m/g

/** Strip ANSI SGR escape codes so length matches what the user actually sees. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '')
}

/**
 * Estimate how many terminal rows a multi-line, possibly ANSI-styled string
 * will occupy when rendered by Ink at the given column width.
 *
 * Each logical line (split on '\n') becomes `ceil(visibleLen / cols)` rows,
 * with a floor of 1 to account for empty lines that still consume a row.
 */
export function estimateRenderedRows(text: string, terminalCols: number): number {
  if (!text)
    return 0
  const cols = Math.max(1, Math.floor(terminalCols))
  const lines = text.split('\n')
  let total = 0
  for (const line of lines) {
    const visibleLen = stripAnsi(line).length
    total += Math.max(1, Math.ceil(visibleLen / cols))
  }
  return total
}

/**
 * Decide whether the AI analysis text should be routed through the
 * scrollable fullscreen viewer. Conservative — prefers true (scroll) when
 * the estimate is close to the available row budget.
 *
 * @param text         The AI analysis markdown (already rendered to ANSI).
 * @param terminalRows Total terminal rows from `useStdout().stdout?.rows`.
 * @param terminalCols Total terminal cols from `useStdout().stdout?.columns`.
 * @param chromeRows   Reserved rows for the surrounding wizard chrome.
 *                     Defaults to `AI_RESULT_CHROME_ROWS`.
 */
export function isAiAnalysisTooTall(
  text: string,
  terminalRows: number,
  terminalCols: number,
  chromeRows: number = AI_RESULT_CHROME_ROWS,
): boolean {
  if (!text)
    return false
  const availableRows = Math.max(1, terminalRows - chromeRows)
  const estimated = estimateRenderedRows(text, terminalCols)
  return estimated > availableRows
}

/**
 * Wrap-aware rendered-row count for a single logical line.
 * Treats blank/empty lines as one row (Ink still occupies a row for them).
 */
function renderedRowsForLine(line: string, terminalCols: number): number {
  const cols = Math.max(1, Math.floor(terminalCols))
  const visibleLen = stripAnsi(line).length
  return Math.max(1, Math.ceil(visibleLen / cols))
}

/**
 * Sum of rendered rows for a list of logical lines.
 *
 * Used by the scrollable viewer to figure out how many padding rows to
 * add below the visible content so the frame height stays constant across
 * scroll positions (constant height = Ink renders in-place, no scrollback
 * growth on every keystroke).
 */
export function totalRenderedRows(lines: string[], terminalCols: number): number {
  let total = 0
  for (const line of lines)
    total += renderedRowsForLine(line, terminalCols)
  return total
}

/**
 * Pick the slice of `lines` starting at `scrollOffset` that fits within
 * `viewportRows` *rendered* rows on a terminal `terminalCols` wide. Returns
 * fewer lines than would otherwise be sliced when individual lines wrap.
 *
 * Always returns at least one line if the input is non-empty and the
 * `scrollOffset` is in-range — even if that line wraps to more rows than the
 * viewport. The user can still scroll past it; without this floor the viewer
 * would render an empty body on hostile inputs.
 */
export function pickVisibleLines(
  lines: string[],
  scrollOffset: number,
  viewportRows: number,
  terminalCols: number,
): string[] {
  if (lines.length === 0 || scrollOffset >= lines.length)
    return []
  const result: string[] = []
  let rowsUsed = 0
  for (let i = scrollOffset; i < lines.length; i++) {
    const rows = renderedRowsForLine(lines[i], terminalCols)
    if (result.length > 0 && rowsUsed + rows > viewportRows)
      break
    result.push(lines[i])
    rowsUsed += rows
    if (rowsUsed >= viewportRows)
      break
  }
  return result
}

/**
 * Compute the largest `scrollOffset` that still keeps content visible at the
 * bottom of the viewport — i.e. the offset where the LAST line is rendered
 * within the viewport. Walks backwards from the end, packing as many tail
 * lines as fit (accounting for wrap), and returns the offset of the first
 * fully-visible tail line.
 */
export function computeMaxScrollOffset(
  lines: string[],
  viewportRows: number,
  terminalCols: number,
): number {
  if (lines.length === 0)
    return 0
  let rowsUsed = 0
  let kFromEnd = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    const rows = renderedRowsForLine(lines[i], terminalCols)
    if (kFromEnd > 0 && rowsUsed + rows > viewportRows)
      break
    rowsUsed += rows
    kFromEnd += 1
    if (rowsUsed >= viewportRows)
      break
  }
  return Math.max(0, lines.length - kFromEnd)
}
