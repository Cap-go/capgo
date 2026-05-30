// Build the REAL onboarding frame around a step element, matching app.tsx:
//   <Box padding={1}>
//     <Header/>                      ← always the boxed banner (no compact)
//     <Box ref=bodyRef>
//       {progress section}           ← label + ProgressBar + Divider (when shown)
//       {step}
//     </Box>
//   </Box>
//
// This is the unit the VT harness measures — NOT the bare step — because the
// progress bar above the step is what my earlier hand-math kept forgetting.
import { ProgressBar } from '@inkjs/ui'
import { Box, Text } from 'ink'
import React from 'react'
import { Divider, Header } from '../../src/build/onboarding/ui/components.tsx'

const h = React.createElement

/**
 * @param {import('react').ReactElement} step  the step body element
 * @param {{ withProgress?: boolean, phaseLabel?: string, progress?: number }} [opts]
 * @returns {import('react').ReactElement} the full framed element
 */
export function buildOnboardingFrame(step, opts = {}) {
  const { withProgress = true, phaseLabel = 'Step 2 of 4 · Sign in with Google', progress = 25 } = opts
  const progressSection = withProgress
    ? h(
        Box,
        { flexDirection: 'column', marginTop: 1 },
        h(Text, { bold: true, color: 'cyan' }, phaseLabel),
        h(Box, { marginTop: 1 }, h(ProgressBar, { value: progress }), h(Text, { dimColor: true }, ` ${progress}%`)),
        h(Divider, null),
      )
    : null
  return h(
    Box,
    { flexDirection: 'column', padding: 1 },
    h(Header, null),
    h(Box, { flexDirection: 'column' }, progressSection, step),
  )
}
