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

// Conservative chrome reserve: outer Header + AI title + safety warning +
// the retry/skip Select with up to 2 options + blank lines/margins.
// Sized for the worst case so a small terminal still feels safe.
export const AI_RESULT_CHROME_ROWS = 20

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
