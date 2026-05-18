import type { FC } from 'react'
import type { CertRenewReason, ProfileRenewReason, RenewPlan } from '../types'
import { Alert, Select } from '@inkjs/ui'
import { Box, Newline, Text } from 'ink'
import React from 'react'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function formatDate(date: Date | null): string {
  if (!date)
    return 'unknown'
  return date.toISOString().slice(0, 10)
}

function formatDaysFromNow(date: Date | null, now: Date): string {
  if (!date)
    return ''
  const diffDays = Math.round((date.getTime() - now.getTime()) / MS_PER_DAY)
  if (diffDays < 0)
    return `(expired ${Math.abs(diffDays)}d ago)`
  if (diffDays === 0)
    return '(expires today)'
  return `(in ${diffDays}d)`
}

function certReasonLabel(reason: CertRenewReason): string {
  switch (reason) {
    case 'expired': return 'RENEW (expired)'
    case 'expiring': return 'RENEW (expiring within threshold)'
    case 'forced': return 'RENEW (--force)'
    case 'ok': return 'OK — no action needed'
  }
}

function profileReasonLabel(reason: ProfileRenewReason): string {
  switch (reason) {
    case 'expired': return 'RENEW (expired)'
    case 'expiring': return 'RENEW (expiring within threshold)'
    case 'forced': return 'RENEW (--force)'
    case 'cert-renewed': return 'RENEW (cert renewed)'
    case 'ok': return 'OK — no action needed'
    case 'skipped-non-capgo': return 'SKIP — user-imported, regenerate manually'
  }
}

interface RenewPlanScreenProps {
  plan: RenewPlan
  dryRun: boolean
  now?: Date
  onConfirm: () => void
  onCancel: () => void
}

export const RenewPlanScreen: FC<RenewPlanScreenProps> = ({ plan, dryRun, now = new Date(), onConfirm, onCancel }) => {
  const renewedCount = plan.profiles.filter(p => p.needsRenewal).length
  const userImportedAtRisk = plan.cert.needsRenewal
    && plan.profiles.some(p => !p.isCapgoCreated)

  // Default-to-No when the cert is being renewed AND user-imported profiles
  // will be invalidated — see design Step D.
  const options = userImportedAtRisk
    ? [
        { label: 'No (cancel)', value: 'cancel' },
        { label: 'Yes (proceed despite warnings)', value: 'confirm' },
      ]
    : [
        { label: 'Yes (proceed)', value: 'confirm' },
        { label: 'No (cancel)', value: 'cancel' },
      ]

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>
        Renewal plan for
        {' '}
        {plan.appId}
        :
      </Text>
      <Newline />

      <Text bold>  Certificate</Text>
      <Text>
        {'    '}
        Current expiry:
        {' '}
        {formatDate(plan.cert.currentExpiry)}
        {' '}
        {formatDaysFromNow(plan.cert.currentExpiry, now)}
        {'    → '}
        <Text color={plan.cert.needsRenewal ? 'yellow' : 'green'}>
          {certReasonLabel(plan.cert.reason)}
        </Text>
      </Text>
      <Newline />

      <Text bold>
        {'  '}
        Provisioning profiles (
        {renewedCount}
        {' '}
        of
        {' '}
        {plan.profiles.length}
        {' '}
        will be auto-renewed):
      </Text>
      {plan.profiles.length === 0 && (
        <Text dimColor>    (none)</Text>
      )}
      {plan.profiles.map(profile => (
        <Text key={profile.bundleId}>
          {'    '}
          {profile.bundleId}
          {' — '}
          {formatDate(profile.currentExpiry)}
          {' '}
          {formatDaysFromNow(profile.currentExpiry, now)}
          {'    → '}
          <Text color={profile.needsRenewal ? 'yellow' : profile.reason === 'skipped-non-capgo' ? 'red' : 'green'}>
            {profileReasonLabel(profile.reason)}
          </Text>
        </Text>
      ))}
      <Newline />

      {userImportedAtRisk && (
        <Box marginBottom={1}>
          <Alert variant="warning">
            User-imported provisioning profiles will be invalidated when the cert is renewed.
            Re-generate them manually with
            {' '}
            <Text bold>build credentials update --ios-provisioning-profile &lt;path&gt;</Text>
            {' '}
            after this completes.
          </Alert>
        </Box>
      )}

      {dryRun
        ? (
            <Box flexDirection="column">
              <Text color="cyan">--dry-run set: no changes will be made.</Text>
              <Newline />
              <Select
                options={[{ label: 'Exit', value: 'cancel' }]}
                onChange={onCancel}
              />
            </Box>
          )
        : (
            <Box flexDirection="column">
              <Text>Continue?</Text>
              <Select
                options={options}
                onChange={(value) => {
                  if (value === 'confirm')
                    onConfirm()
                  else onCancel()
                }}
              />
            </Box>
          )}
    </Box>
  )
}
