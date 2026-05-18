import type { FC } from 'react'
import { Select } from '@inkjs/ui'
import { Box, Newline, Text } from 'ink'
import React from 'react'
import { SuccessLine } from './components.js'

function formatDate(date: Date | null): string {
  if (!date)
    return 'unknown'
  return date.toISOString().slice(0, 10)
}

export interface RenewCompleteSummary {
  appId: string
  certBefore: Date | null
  certAfter: Date | null
  certRenewed: boolean
  profilesRenewed: string[]
  profilesSkippedNonCapgo: string[]
}

interface RenewCompleteScreenProps {
  summary: RenewCompleteSummary
  onRunBuild: () => void
  onExit: () => void
}

export const RenewCompleteScreen: FC<RenewCompleteScreenProps> = ({ summary, onRunBuild, onExit }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <SuccessLine text={`Renewed credentials for ${summary.appId}`} />
      <Newline />

      {summary.certRenewed
        ? (
            <Text>
              {'  '}
              Certificate: valid until
              {' '}
              <Text color="green">{formatDate(summary.certAfter)}</Text>
              {summary.certBefore && (
                <Text dimColor>
                  {' '}
                  (was
                  {' '}
                  {formatDate(summary.certBefore)}
                  )
                </Text>
              )}
            </Text>
          )
        : (
            <Text dimColor>
              {'  '}
              Certificate: unchanged (still valid until
              {' '}
              {formatDate(summary.certAfter)}
              )
            </Text>
          )}

      <Text>
        {'  '}
        Profiles renewed:
        {' '}
        {summary.profilesRenewed.length}
      </Text>
      {summary.profilesRenewed.map(bundleId => (
        <Text key={bundleId}>
          {'    - '}
          {bundleId}
        </Text>
      ))}

      {summary.profilesSkippedNonCapgo.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">
            {'  '}
            Profiles skipped (user-imported, regenerate manually):
            {' '}
            {summary.profilesSkippedNonCapgo.length}
          </Text>
          {summary.profilesSkippedNonCapgo.map(bundleId => (
            <Text key={bundleId} color="yellow">
              {'    - '}
              {bundleId}
            </Text>
          ))}
          {summary.certRenewed && (
            <Box marginTop={1}>
              <Text dimColor>
                {'  '}
                Re-generate skipped profiles with:
                {' '}
                <Text bold>build credentials update --ios-provisioning-profile &lt;path&gt;</Text>
              </Text>
            </Box>
          )}
        </Box>
      )}

      <Newline />
      <Text>Run a test build now?</Text>
      <Select
        options={[
          { label: 'Yes (build now)', value: 'build' },
          { label: 'No (exit)', value: 'exit' },
        ]}
        onChange={(value) => {
          if (value === 'build')
            onRunBuild()
          else
            onExit()
        }}
      />
    </Box>
  )
}
