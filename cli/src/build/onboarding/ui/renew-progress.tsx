import type { FC } from 'react'
import { ProgressBar } from '@inkjs/ui'
import { Box, Newline, Text } from 'ink'
import React from 'react'
import { SpinnerLine, SuccessLine } from './components.js'

interface RenewProgressScreenProps {
  totalProfiles: number
  completedProfiles: string[]
  currentBundleId: string | null
}

export const RenewProgressScreen: FC<RenewProgressScreenProps> = ({ totalProfiles, completedProfiles, currentBundleId }) => {
  const done = completedProfiles.length
  const percent = totalProfiles === 0 ? 100 : Math.round((done / totalProfiles) * 100)

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Renewing provisioning profiles</Text>
      <Newline />
      <ProgressBar value={percent} />
      <Box marginTop={1}>
        <Text dimColor>
          {done}
          {' '}
          of
          {' '}
          {totalProfiles}
          {' '}
          complete (
          {percent}
          %)
        </Text>
      </Box>
      <Newline />

      {completedProfiles.map(bundleId => (
        <SuccessLine key={bundleId} text={bundleId} />
      ))}

      {currentBundleId && (
        <Box marginTop={1}>
          <SpinnerLine text={`Renewing ${currentBundleId}…`} />
        </Box>
      )}
    </Box>
  )
}
