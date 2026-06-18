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

// Rows the ai-analysis-running frame spends AROUND the live streaming
// preview: shell padding (top+bottom), Header, spinner line, the
// "… N earlier lines" marker, and the step margins. Deliberately generous —
// the shell renders a full-height frame (minHeight=rows), so if preview +
// chrome exceeds the viewport the whole frame scrolls and the title is
// pushed off the top of the alt screen.
export const AI_RUNNING_CHROME_ROWS = 10

export interface AiPreviewTail {
  /** Lines to render (blank-padded to a constant rendered height). */
  rows: string[]
  /** Logical lines scrolled off the top (0 ⇒ the marker row renders blank). */
  hidden: number
}

/**
 * Pick the visible tail of the live streaming analysis preview for the
 * CURRENT terminal size.
 *
 * Wrap-aware: each logical line is budgeted as the rows it will actually
 * occupy at `terminalCols` (via `estimateRenderedRows`), so the running frame
 * can never grow past the viewport. No artificial padding: streamed text only
 * appends, so the rendered height grows monotonically on its own — the frame
 * starts compact (matching the other wizard steps) and grows downward, and is
 * capped at the budget so it never overflows the full-height shell frame.
 */
export function pickAiPreviewTail(text: string, terminalRows: number, terminalCols: number): AiPreviewTail {
  if (!text)
    return { rows: [], hidden: 0 }
  const budget = Math.max(4, Math.floor(terminalRows) - AI_RUNNING_CHROME_ROWS)
  const lines = text.split('\n')
  // Walk from the end, spending the row budget on wrap-aware line costs.
  let rowsUsed = 0
  let start = lines.length
  while (start > 0) {
    const cost = estimateRenderedRows(lines[start - 1] || ' ', terminalCols)
    if (rowsUsed + cost > budget)
      break
    rowsUsed += cost
    start--
  }
  const rows = lines.slice(start).map(l => (l === '' ? ' ' : l))
  return { rows, hidden: start }
}

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

// The two AI-analysis-result steps. Both wizards (iOS + Android) use these same
// literal step names, so the routing decision below is platform-agnostic.
export type AiResultStep = 'ai-analysis-result' | 'ai-analysis-result-scroll'

/**
 * Decide which AI-result step should be active for the CURRENT terminal size.
 *
 * Routing is BIDIRECTIONAL and driven by the single `isAiAnalysisTooTall`
 * predicate, so it settles deterministically at any size — at a given size
 * exactly one outcome is stable, so it can't oscillate:
 *   - inline + now too tall (terminal shrank)  → scroll
 *   - scroll + now fits      (terminal grew)    → inline   ← the missing case
 *
 * Before, only the inline→scroll direction existed: once the viewer opened
 * (e.g. after shrinking), growing the terminal never returned to the inline
 * render — the user was stuck in the scroll viewer showing "all N lines" with
 * empty space.
 *
 * `viewedFull` (the user manually dismissed the viewer with Esc/Enter) pins the
 * inline step so a later resize can't shove a dismissed analysis back into the
 * viewer. It only gates the inline→scroll direction; leaving the viewer when it
 * fits is always allowed.
 *
 * @returns the step to switch to, or `null` when the current step is already
 *   correct (so the caller can skip a no-op `setStep`).
 */
export function resolveAiResultRoute(params: {
  current: AiResultStep
  text: string | null
  viewedFull: boolean
  terminalRows: number
  terminalCols: number
}): AiResultStep | null {
  const { current, text, viewedFull, terminalRows, terminalCols } = params
  if (!text)
    return null
  const tooTall = isAiAnalysisTooTall(text, terminalRows, terminalCols)
  if (current === 'ai-analysis-result' && tooTall && !viewedFull)
    return 'ai-analysis-result-scroll'
  if (current === 'ai-analysis-result-scroll' && !tooTall)
    return 'ai-analysis-result'
  return null
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
 * Pick the slice of `lines` starting at `scrollOffset` that PACKS the
 * `viewportRows` rendered rows of a terminal `terminalCols` wide.
 *
 * Packs lines until the cumulative wrapped row count reaches or exceeds
 * `viewportRows`, INCLUDING the line that crosses the boundary. That last line
 * may render past the viewport; the viewer clips it with `overflow: hidden` so
 * the visible area is always FULL of text when more lines remain. (Stopping
 * before the boundary line — the old behaviour — left the unused rows as an
 * empty gap when a long line couldn't fully fit.)
 *
 * Always returns at least one line if the input is non-empty and the
 * `scrollOffset` is in-range — even if that line wraps to more rows than the
 * viewport.
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
    result.push(lines[i])
    rowsUsed += renderedRowsForLine(lines[i], terminalCols)
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
