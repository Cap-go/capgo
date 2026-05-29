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
// with a summary line that stands in for older steps that don't fit. That
// summary is NEVER hidden when steps overflow — even at a one-row budget it
// wins the row (shown alone), because hiding "there are more completed steps"
// is worse than not showing the single newest line.
//
// The top-margin gap separates the block from the header — but ONLY when the
// block renders two or more lines. When it collapses to a single line (a lone
// step, or a lone summary), the gap would be orphaned, so it's dropped and the
// line sits directly under the header.
export const CompletedStepsLog: FC<{ entries: LogEntry[], maxRows: number }> = ({ entries, maxRows }) => {
  if (maxRows < 1 || entries.length === 0)
    return null
  const { hidden, visible } = capLogRows(entries, maxRows)
  if (hidden === 0 && visible.length === 0)
    return null
  // "…and N earlier steps done" when concrete steps are shown below it; when the
  // budget is so tight only the summary fits, it stands alone as "N steps done".
  const summary = visible.length > 0
    ? `…and ${hidden} earlier steps done (resize taller to see all)`
    : `${hidden} steps done (resize taller to see all)`
  const renderedLines = (hidden > 0 ? 1 : 0) + visible.length
  return (
    <Box flexDirection="column" marginTop={renderedLines > 1 ? 1 : 0}>
      {hidden > 0 && (
        <Text dimColor wrap="truncate-end">{summary}</Text>
      )}
      {visible.map((entry, i) => (
        <Text key={i} color={entry.color} wrap="truncate-middle">{entry.text}</Text>
      ))}
    </Box>
  )
}
