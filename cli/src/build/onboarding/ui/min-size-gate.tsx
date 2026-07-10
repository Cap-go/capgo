import type { FC, ReactNode } from 'react'
// src/build/onboarding/ui/min-size-gate.tsx
//
// Onboarding's full (comfortable) step forms need a minimum terminal size (see
// min-terminal-size.ts, measured by the VT harness). Below that floor we show a
// resize prompt instead of the wizard; at/above it the wizard renders. This is
// the ONE place onboarding shows "terminal too small".
//
// Two consumers:
//   • TerminalTooSmallPrompt — the prompt body. The platform apps render it
//     DIRECTLY at the top of their own render when the terminal is too small, so
//     the app component STAYS MOUNTED (only its returned JSX swaps). That avoids
//     unmounting the wizard on a mid-flow resize — unmounting would tear down
//     in-progress step state and (via Ink teardown effects) could exit the whole
//     wizard. Keeping it mounted means a shrink shows the prompt and a re-grow
//     shows the exact same step, with no lost state and no exit.
//   • MinSizeGate — a convenience wrapper (fits ? children : prompt), gated on the
//     full onboarding floor (terminalFitsOnboarding), for callers with no precious
//     state to preserve where unmounting children on resize is harmless. NOTE: the
//     shell does NOT use this for the platform picker — the picker has its own,
//     much smaller floor and is gated directly with terminalFitsPicker +
//     TerminalTooSmallPrompt(PICKER_MIN_*) in shell.tsx. MinSizeGate is currently
//     unused by the picker path; it remains for any caller wanting the full-floor
//     wrapper.
//
// Both are resize-reactive: callers pass cols/rows from useTerminalSize, which
// re-renders on every resize event.
import process from 'node:process'
import { Box, Text, useInput } from 'ink'
import React from 'react'
import { MIN_COLS, MIN_ROWS, terminalFitsOnboarding } from '../min-terminal-size.js'

export interface TerminalTooSmallPromptProps {
  cols: number
  rows: number
  /** Minimum columns this screen needs. Defaults to the full onboarding floor;
   *  the platform picker passes its smaller PICKER_MIN_COLS. */
  minCols?: number
  /** Minimum rows this screen needs. Defaults to the full onboarding floor; the
   *  platform picker passes its smaller PICKER_MIN_ROWS. So the prompt always
   *  states the floor of the screen that's actually too small (e.g. "11 rows" on
   *  the picker, not the wizard's 49). */
  minRows?: number
}

// The "terminal too small" resize prompt. minHeight fills the viewport so Ink
// uses its full clear-screen path (no stale rows from a previous frame on
// resize), and it names whichever dimension is short — against the floor of the
// CALLING screen (minCols/minRows), so the numbers always match what the user is
// looking at.
export const TerminalTooSmallPrompt: FC<TerminalTooSmallPromptProps> = ({ cols, rows, minCols = MIN_COLS, minRows = MIN_ROWS }) => {
  // Keep a stdin reader alive while the prompt is shown. This is load-bearing:
  // on the picker path the ONLY useInput lives in PlatformPicker, so swapping it
  // for this prompt would leave Ink with zero input subscribers — under
  // alternateScreen + a real TTY that lets waitUntilExit() resolve and the whole
  // wizard exits ("✔ onboarding complete" + quit) the instant you shrink past
  // the floor. Registering a useInput here keeps Ink reading input, so the
  // prompt just sits there until the user resizes back. Ctrl+C still quits.
  useInput((input, key) => {
    if (key.ctrl && input === 'c')
      process.kill(process.pid, 'SIGINT')
  })
  const needWider = cols < minCols
  const needTaller = rows < minRows
  return (
    <Box flexDirection="column" minHeight={rows} padding={1}>
      <Text bold color="cyan">🚀  Capgo Cloud Build · Onboarding</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color="yellow" bold>{`⚠  Terminal too small (${cols}×${rows}).`}</Text>
        <Text>{`This screen needs at least ${minCols}×${minRows} (columns × rows).`}</Text>
        <Box marginTop={1} flexDirection="column">
          {needWider && <Text>{`• Widen to at least ${minCols} columns (currently ${cols}).`}</Text>}
          {needTaller && <Text>{`• Make it taller — at least ${minRows} rows (currently ${rows}).`}</Text>}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Resize this window and onboarding will continue automatically — no need to restart.</Text>
        </Box>
      </Box>
    </Box>
  )
}

export interface MinSizeGateProps {
  cols: number
  rows: number
  children: ReactNode
}

// fits ? children : prompt. Use only where unmounting `children` on resize is
// harmless (no in-progress state). For the stateful wizard apps, render
// TerminalTooSmallPrompt directly instead (see above).
export const MinSizeGate: FC<MinSizeGateProps> = ({ cols, rows, children }) => {
  if (terminalFitsOnboarding(cols, rows))
    return <>{children}</>
  return <TerminalTooSmallPrompt cols={cols} rows={rows} />
}
