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
//   • MinSizeGate — a convenience wrapper (fits ? children : prompt) for callers
//     with no precious state to preserve (e.g. the shell's pre-platform picker),
//     where unmounting children on resize is harmless.
//
// Both are resize-reactive: callers pass cols/rows from useTerminalSize, which
// re-renders on every resize event.
import { Box, Text } from 'ink'
import React from 'react'
import { MIN_COLS, MIN_ROWS, terminalFitsOnboarding } from '../min-terminal-size.js'

export interface TerminalTooSmallPromptProps {
  cols: number
  rows: number
}

// The "terminal too small" resize prompt. minHeight fills the viewport so Ink
// uses its full clear-screen path (no stale rows from a previous frame on
// resize), and it names whichever dimension is short.
export const TerminalTooSmallPrompt: FC<TerminalTooSmallPromptProps> = ({ cols, rows }) => {
  const needWider = cols < MIN_COLS
  const needTaller = rows < MIN_ROWS
  return (
    <Box flexDirection="column" minHeight={rows} padding={1}>
      <Text bold color="cyan">🚀  Capgo Cloud Build · Onboarding</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color="yellow" bold>{`⚠  Terminal too small (${cols}×${rows}).`}</Text>
        <Text>{`Onboarding needs at least ${MIN_COLS}×${MIN_ROWS} (columns × rows) so every step fits without resizing partway through.`}</Text>
        <Box marginTop={1} flexDirection="column">
          {needWider && <Text>{`• Widen to at least ${MIN_COLS} columns (currently ${cols}).`}</Text>}
          {needTaller && <Text>{`• Make it taller — at least ${MIN_ROWS} rows (currently ${rows}).`}</Text>}
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
