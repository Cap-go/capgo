// Build the REAL onboarding frame around a step element, matching app.tsx:
//   <Box padding={1}>
//     <Header/>                      ← always the boxed banner (no compact)
//     <CompletedStepsLog/>           ← cut form (summary + latest), when present
//     <Box ref=bodyRef>
//       {progress section}           ← label + ProgressBar + Divider (when shown)
//       {step}
//     </Box>
//   </Box>
//
// This is the unit the VT harness measures — NOT the bare step — because the
// progress bar AND the completed-steps log above the step are what my earlier
// hand-math kept forgetting.
import { ProgressBar } from '@inkjs/ui'
import { Box, Text } from 'ink'
import React from 'react'
import { CompletedStepsLog } from '../../src/build/onboarding/ui/completed-steps-log.tsx'
import { Divider, Header } from '../../src/build/onboarding/ui/components.tsx'

const h = React.createElement

// The minimal completed-steps log the user requires to always be visible: the
// latest completed step + a "resize to see more" summary line. We feed many
// entries with maxRows=2 so CompletedStepsLog renders its cut form — the worst
// case for a later step that has a long history above it.
const LOG_ENTRIES = Array.from({ length: 8 }, (_, i) => ({ text: `✔ Completed step ${i + 1}`, color: 'green' }))
const LOG_MAX_ROWS = 2

/**
 * @param {import('react').ReactElement} step  the step body element
 * @param {{ withProgress?: boolean, withLog?: boolean, phaseLabel?: string, progress?: number }} [opts]
 *   withLog: include the minimal cut-form completed-steps log (default true — it
 *            is present on every step after the first, including the tallest).
 * @returns {import('react').ReactElement} the full framed element
 */
export function buildOnboardingFrame(step, opts = {}) {
  const { withProgress = true, withLog = true, phaseLabel = 'Step 2 of 4 · Sign in with Google', progress = 25 } = opts
  const progressSection = withProgress
    ? h(
        Box,
        { flexDirection: 'column', marginTop: 1 },
        h(Text, { bold: true, color: 'cyan' }, phaseLabel),
        h(Box, { marginTop: 1 }, h(ProgressBar, { value: progress }), h(Text, { dimColor: true }, ` ${progress}%`)),
        h(Divider, null),
      )
    : null
  const log = withLog ? h(CompletedStepsLog, { entries: LOG_ENTRIES, maxRows: LOG_MAX_ROWS }) : null
  return h(
    Box,
    { flexDirection: 'column', padding: 1 },
    h(Header, null),
    log,
    h(Box, { flexDirection: 'column' }, progressSection, step),
  )
}
