import type { FC } from 'react'
import type { CiSecretSetupAdvice, CiSecretTarget } from '../../ci-secrets.js'
// src/build/onboarding/ui/steps/ios-ci.tsx
//
// Pure presentational step bodies for the iOS CI-secrets sub-flow of the
// `build init` onboarding wizard (detect git hosting → optionally upload the
// build env vars as GitHub Actions secrets / GitLab CI/CD variables). Each
// component is "props in → JSX out": every dynamic value and event handler is
// an explicit, typed prop. The parent wizard (ui/app.tsx) owns all state,
// routing, async work and terminal-size measurement; these components never
// touch `useStdout` / `measureElement`.
//
// The frame-fit contract (see ui/components.tsx + test/helpers/frame-fit.mjs)
// requires every step body to render within BODY_BUDGET_ROWS (13) rows at the
// reference widths (80 + 60). The list-bearing steps are the offenders here:
//   • ci-secrets-setup lists per-provider install/login advice — capped to the
//     install + login command lines, decorative blank lines dropped.
//   • confirm-ci-secret-overwrite lists the env vars that would be replaced —
//     capped to the last few keys + a "… +N more" line.
//   • ci-secrets-failed renders an arbitrary error string — clamped so a long
//     backend error can't wrap past a couple of rows and push the picker off
//     screen.
// Pickers cap @inkjs/ui's `Select` with `visibleOptionCount`; every step keeps
// its interactive control + key instruction on screen. Verified in
// test-frame-fit-ios-ci.mjs.
import { Select } from '@inkjs/ui'
import { Box, Text } from 'ink'
import React from 'react'
import { ErrorLine, SpinnerLine, SuccessLine } from '../components.js'

// A single Select option. Mirrors the shape @inkjs/ui's Select expects so the
// parent can build option lists (provider rows + control rows) and pass them
// straight through. Matches ios-credentials.tsx / ios-import.tsx's SelectOption.
export interface SelectOption {
  label: string
  value: string
}

// `Select` only ever renders `visibleOptionCount` OPTIONS (it scrolls the
// rest). The target picker tops out at 3 options (GitHub + GitLab + Skip) so it
// never needs scrolling, but we pass the cap defensively, mirroring the Android
// keystore flow.
const TARGET_VISIBLE_COUNT = 3

// How many already-exist keys to render in the overwrite confirmation before
// collapsing the remainder into a "… +N more" line. iOS + Android credentials
// can produce ~10 env vars, which would blow the 13-row budget if listed in
// full at 60 cols. Showing the last few + a count keeps the interactive control
// visible while still telling the user how many will be replaced.
const OVERWRITE_VISIBLE_KEYS = 3

// Upper bound on the rendered length of a backend error string. A long
// `gh`/`glab` failure (stderr + stdout joined) can wrap to many rows at 60 cols
// and shove the retry/continue picker off screen; clamping keeps it to ~2
// wrapped rows. The full error is only ever surfaced here, so the clamp is
// purely cosmetic — the user still gets the actionable retry control.
const ERROR_MAX_CHARS = 110

function clampError(message: string): string {
  const collapsed = message.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= ERROR_MAX_CHARS)
    return collapsed
  return `${collapsed.slice(0, ERROR_MAX_CHARS - 1)}…`
}

// ── detecting-ci-secrets ──────────────────────────────────────────────────────
export const DetectingCiSecretsStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Checking git hosting..." />
  </Box>
)

// ── ci-secrets-setup ──────────────────────────────────────────────────────────
// Shown when a git remote was detected but the matching CLI (gh/glab) isn't
// installed or isn't logged in. The parent owns the retry/skip routing
// (retry re-runs detection; skip jumps to build-complete). The advice list is
// kept terse — one provider label, the reason, and the (already short) command
// lines — with the decorative blank lines from the original dropped so two
// providers' worth of advice still fits 13 rows at 60 cols.
export interface CiSecretsSetupStepProps {
  advice: CiSecretSetupAdvice[]
  onChange: (value: string) => void
}

export const CiSecretsSetupStep: FC<CiSecretsSetupStepProps> = ({ advice, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Set up your git hosting CLI to upload env vars</Text>
    {advice.map(entry => (
      <Box key={entry.target.provider} flexDirection="column">
        <Text>{entry.target.label}</Text>
        {entry.commands.map(command => (
          <Text key={`${entry.target.provider}-${command}`} color="cyan">{command}</Text>
        ))}
      </Box>
    ))}
    <Text dimColor>Run this in another terminal, then come back here.</Text>
    <Select
      options={[
        { label: 'I installed and logged in, check again', value: 'retry' },
        { label: 'Skip upload', value: 'skip' },
      ]}
      onChange={onChange}
    />
  </Box>
)

// ── ci-secrets-target-select ──────────────────────────────────────────────────
// Shown when more than one git hosting CLI is ready. `options` is built by the
// parent (one row per ready target + a Skip row) so this component stays
// presentational and the parent keeps ownership of mapping a chosen provider
// back to its CiSecretTarget.
export interface CiSecretsTargetSelectStepProps {
  options: SelectOption[]
  onChange: (value: string) => void
}

export const CiSecretsTargetSelectStep: FC<CiSecretsTargetSelectStepProps> = ({ options, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Where should Capgo upload the build env vars?</Text>
    <Select visibleOptionCount={TARGET_VISIBLE_COUNT} options={options} onChange={onChange} />
  </Box>
)

// ── ask-ci-secrets ────────────────────────────────────────────────────────────
// Confirmation prompt offering to upload the freshly saved credentials as CI
// secrets. `entryCount` drives the pluralised heading; `target` provides the
// destination label + CLI name for the option label. The parent routes yes →
// checking-ci-secrets, no → build-complete.
export interface AskCiSecretsStepProps {
  entryCount: number
  target: CiSecretTarget | null
  targetLabel: string
  onChange: (value: string) => void
}

export const AskCiSecretsStep: FC<AskCiSecretsStepProps> = ({ entryCount, target, targetLabel, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <SuccessLine text="Credentials saved" />
    <Text bold>
      {`Upload ${entryCount} build env var${entryCount === 1 ? '' : 's'} to ${targetLabel}?`}
    </Text>
    <Text dimColor>Capgo checks for existing names first and asks before replacing anything.</Text>
    <Select
      options={[
        { label: `Upload with ${target?.cli || 'CLI'}`, value: 'yes' },
        { label: 'Skip', value: 'no' },
      ]}
      onChange={onChange}
    />
  </Box>
)

// ── checking-ci-secrets ───────────────────────────────────────────────────────
export interface CheckingCiSecretsStepProps {
  targetLabel: string
}

export const CheckingCiSecretsStep: FC<CheckingCiSecretsStepProps> = ({ targetLabel }) => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text={`Checking existing env vars in ${targetLabel}...`} />
  </Box>
)

// ── confirm-ci-secret-overwrite ───────────────────────────────────────────────
// Some of the env vars we'd upload already exist remotely. We list the ones
// that would be replaced, capped to the last OVERWRITE_VISIBLE_KEYS + a count so
// a long list (iOS + Android credentials → ~10 keys) can't blow the budget. The
// parent routes replace → uploading-ci-secrets, skip → build-complete.
export interface ConfirmCiSecretOverwriteStepProps {
  existingKeys: string[]
  onChange: (value: string) => void
}

export const ConfirmCiSecretOverwriteStep: FC<ConfirmCiSecretOverwriteStepProps> = ({ existingKeys, onChange }) => {
  const hidden = Math.max(0, existingKeys.length - OVERWRITE_VISIBLE_KEYS)
  const visibleKeys = existingKeys.slice(existingKeys.length - OVERWRITE_VISIBLE_KEYS)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="yellow">These env vars already exist and will be replaced:</Text>
      <Box flexDirection="column" marginLeft={2}>
        {hidden > 0 && <Text dimColor>{`… +${hidden} more`}</Text>}
        {visibleKeys.map(key => (
          <Text key={key}>{`• ${key}`}</Text>
        ))}
      </Box>
      <Select
        options={[
          { label: 'Replace existing env vars', value: 'replace' },
          { label: 'Skip upload', value: 'skip' },
        ]}
        onChange={onChange}
      />
    </Box>
  )
}

// ── uploading-ci-secrets ──────────────────────────────────────────────────────
export interface UploadingCiSecretsStepProps {
  targetLabel: string
}

export const UploadingCiSecretsStep: FC<UploadingCiSecretsStepProps> = ({ targetLabel }) => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text={`Uploading env vars to ${targetLabel}...`} />
  </Box>
)

// ── ci-secrets-failed ─────────────────────────────────────────────────────────
// Upload failed, but credentials are already saved locally so the user can
// continue. `error` is an arbitrary backend string — clamped via `clampError`
// so it can't wrap past a couple of rows and hide the picker. The parent routes
// retry → checking-ci-secrets (or detecting-ci-secrets when no target is known)
// and continue → build-complete.
export interface CiSecretsFailedStepProps {
  error: string | null
  onChange: (value: string) => void
}

export const CiSecretsFailedStep: FC<CiSecretsFailedStepProps> = ({ error, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <ErrorLine text={clampError(error || 'Could not upload env vars.')} />
    <Text dimColor>You can continue; credentials are already saved locally.</Text>
    <Select
      options={[
        { label: 'Try upload again', value: 'retry' },
        { label: 'Continue without upload', value: 'continue' },
      ]}
      onChange={onChange}
    />
  </Box>
)

// ── ask-build ─────────────────────────────────────────────────────────────────
// Final prompt of the credential flow: kick off the first cloud build now or
// finish. The parent routes yes → requesting-build, no → build-complete.
export interface AskBuildStepProps {
  onChange: (value: string) => void
}

export const AskBuildStep: FC<AskBuildStepProps> = ({ onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <SuccessLine text="Credentials saved" />
    <Text bold>Start your first cloud build now?</Text>
    <Select
      options={[
        { label: '🚀  Yes, build now', value: 'yes' },
        { label: '⏭️   No, I\'ll build later', value: 'no' },
      ]}
      onChange={onChange}
    />
  </Box>
)
