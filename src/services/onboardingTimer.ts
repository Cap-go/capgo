// Measures the time users spend between onboarding step events.
// The mark is module-level so it persists across onboarding components
// for the lifetime of the page session.

let lastMark: number | null = null

/**
 * Returns milliseconds elapsed since the previous call and resets the mark.
 * The first call of the session returns 0.
 */
export function stepElapsed(): number {
  const now = Date.now()
  const elapsedMs = lastMark === null ? 0 : now - lastMark
  lastMark = now
  return elapsedMs
}
