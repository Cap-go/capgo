import type { FC } from 'react'
// src/build/onboarding/ui/completed-steps-log.tsx
//
// The completed-steps log shown between the wizard header and the current step.
// Lives in its own module (not components.tsx) on purpose: it depends on
// capLogRows from frame-fit.ts, and frame-fit.ts already imports the header
// constants FROM components.tsx — so putting this in components.tsx would create
// a components ↔ frame-fit import cycle (and a runtime TDZ crash, since
// frame-fit evaluates those constants at module load). A leaf file consuming
// frame-fit keeps the dependency one-directional.
import { Box, Text } from 'ink'
import React from 'react'
import { capLogRows } from './frame-fit.js'

// A completed step shown in the wizard's running log.
export interface LogEntry {
  text: string
  color?: string
}

// Capped to `maxRows` (see capLogRows): the most recent entries newest-last,
// with a one-line "…and N earlier steps done" summary when older steps don't
// fit.
//
// The top-margin gap separates the block from the header — but ONLY when the
// block is substantial (a summary line, or two or more entries). When the cap
// collapses it to a single ambient line, that gap would be orphaned: it sits
// where the summary used to be and reads as a dropped line. So in the
// single-line case we drop the gap and the lone completed-step line sits
// directly under the header.
export const CompletedStepsLog: FC<{ entries: LogEntry[], maxRows: number }> = ({ entries, maxRows }) => {
  if (maxRows < 1 || entries.length === 0)
    return null
  const { hidden, visible } = capLogRows(entries, maxRows)
  if (hidden === 0 && visible.length === 0)
    return null
  const spaced = hidden > 0 || visible.length > 1
  return (
    <Box flexDirection="column" marginTop={spaced ? 1 : 0}>
      {hidden > 0 && (
        <Text dimColor wrap="truncate-end">{`…and ${hidden} earlier steps done (resize taller to see all)`}</Text>
      )}
      {visible.map((entry, i) => (
        <Text key={i} color={entry.color} wrap="truncate-middle">{entry.text}</Text>
      ))}
    </Box>
  )
}
