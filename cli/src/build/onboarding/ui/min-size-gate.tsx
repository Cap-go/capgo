import type { FC, ReactNode } from 'react'
// src/build/onboarding/ui/min-size-gate.tsx
//
// Startup size gate. Onboarding's full (comfortable) step forms need a minimum
// terminal size (see min-terminal-size.ts, measured by the VT harness). This
// component is the ONE place that can show "terminal too small": it wraps the
// wizard and, when the terminal is below the floor, renders a resize prompt
// instead of the wizard. Past the gate every step is guaranteed to fit, so the
// wizard never has to show a too-small prompt mid-flow — which is what lets the
// steps drop their adaptive `dense` fallback and always render the full form.
//
// It's resize-reactive: the prompt updates live as the user resizes, and the
// wizard mounts the moment the terminal reaches the floor (no restart needed).
import { Box, Text } from 'ink'
import React from 'react'
import { MIN_COLS, MIN_ROWS, terminalFitsOnboarding } from '../min-terminal-size.js'

export interface MinSizeGateProps {
  cols: number
  rows: number
  children: ReactNode
}

export const MinSizeGate: FC<MinSizeGateProps> = ({ cols, rows, children }) => {
  if (terminalFitsOnboarding(cols, rows))
    return <>{children}</>

  // Name whichever dimension(s) are short so the user knows what to fix.
  // minHeight fills the viewport so Ink uses its full clear-screen path (no
  // stale rows from a previous frame on resize).
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
