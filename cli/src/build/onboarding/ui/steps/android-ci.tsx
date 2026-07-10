// src/build/onboarding/ui/steps/android-ci.tsx
//
// Pure presentational step bodies for the Android CI-secrets + save sub-flow
// of the `build init` onboarding wizard (Phase 6 of android/ui/app.tsx). Each
// component is "props in → JSX out": every dynamic value and event handler is
// an explicit, typed prop. The parent wizard owns all state, routing, async
// work, telemetry and terminal-size measurement; these components never touch
// `useStdout` / `measureElement`. `useInput` inside the shared FilteredTextInput
// widget is fine — that's a leaf control, not layout measurement.
//
// Adaptive spacing — each body renders its COMFORTABLE form by default (the
// original design: decorative <Newline/> blank-line spacing + full multi-line
// copy + un-capped advice/key lists). The 16-row frame contract (see
// ui/components.tsx + test/helpers/frame-fit.mjs) is a FLOOR we must survive on
// short terminals, not a cap on every terminal: when the parent measures that
// the comfortable body can't fit the viewport it flips the sticky `dense`
// signal and threads `dense={true}` here, collapsing each body to the terse,
// budget-fitting form (blank lines dropped, the per-provider setup advice
// reduced to the first entry + a "… +N more" hint, the overwrite key list
// tailed to the last few + a "… +N more" hint, and the target picker capped via
// Select's `visibleOptionCount` with a "+N more" hint). `dense` defaults to
// `false` so a component rendered without the prop (e.g. a test asserting the
// comfortable form) gets the original look. All props/handlers/behaviour are
// identical across both modes.
import type { FC } from 'react'
import type { CiSecretSetupAdvice } from '../../ci-secrets.js'
import { Select } from '@inkjs/ui'
import { Box, Newline, Text } from 'ink'
import React from 'react'
import { ErrorLine, SpinnerLine, SuccessLine } from '../components.js'

// A single Select option. Mirrors the shape @inkjs/ui's Select expects so the
// parent can build dynamic option lists and pass them straight through.
export interface SelectOption {
  label: string
  value: string
}

// ── saving-credentials (spinner) ──────────────────────────────────────────────

export const SavingCredentialsStep: FC = () => (
  <Box marginTop={1}><SpinnerLine text="Saving credentials..." /></Box>
)

// ── detecting-ci-secrets (spinner) ────────────────────────────────────────────

export const DetectingCiSecretsStep: FC = () => (
  <Box marginTop={1}><SpinnerLine text="Checking git hosting..." /></Box>
)

// ── ci-secrets-setup ──────────────────────────────────────────────────────────
// `advice` is one entry per git-hosting provider that needs its CLI installed
// or authenticated; each carries a wrapping message + one or more shell
// commands. Comfortable: the original rendered every entry with the label,
// message and each command, separated by `marginBottom={1}` blank lines, with a
// <Newline/> after the heading and a <Newline/> before the Select (the original
// look — rendered only after the parent measured it fits). Dense: the
// decorative blank lines are dropped and only the first entry is rendered in
// full (the user fixes one platform at a time) with the rest collapsed to a
// "… +N more" hint, so two providers (or one with the 2-line "not installed"
// advice) can't blow the budget. The Select + its retry/skip context always
// stay on screen.

export interface CiSecretsSetupStepProps {
  advice: CiSecretSetupAdvice[]
  onChoose: (choice: 'retry' | 'skip') => void
  dense?: boolean
}

export const CiSecretsSetupStep: FC<CiSecretsSetupStepProps> = ({ advice, onChoose }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Set up your git hosting CLI to upload env vars</Text>
      <Newline />
      {advice.map(entry => (
        <Box key={entry.target.provider} flexDirection="column" marginBottom={1}>
          <Text>{entry.target.label}</Text>
          <Text dimColor>{entry.message}</Text>
          {entry.commands.map(command => (
            <Text key={`${entry.target.provider}-${command}`} color="cyan">{command}</Text>
          ))}
        </Box>
      ))}
      <Text dimColor>Run this in another terminal, then come back here.</Text>
      <Newline />
      <Select
        options={[
          { label: 'I installed and logged in, check again', value: 'retry' },
          { label: 'Skip upload', value: 'skip' },
        ]}
        onChange={value => onChoose(value as 'retry' | 'skip')}
      />
    </Box>
  )
}

// ── ci-secrets-target-select ──────────────────────────────────────────────────
// The parent builds the option list (one row per detected target + a "Skip"
// row) and owns the route handler. Comfortable: the original bold heading + a
// <Newline/> + the un-capped Select (in practice there are at most two
// providers + skip). Dense: the blank line is dropped and visibility is capped
// via Select's `visibleOptionCount` with a "+N more" hint so it can never blow
// the budget.

export interface CiSecretsTargetSelectStepProps {
  options: SelectOption[]
  onChange: (value: string) => void
  dense?: boolean
}

export const CiSecretsTargetSelectStep: FC<CiSecretsTargetSelectStepProps> = ({ options, onChange }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Where should Capgo upload the build env vars?</Text>
      <Newline />
      <Select options={options} onChange={onChange} />
    </Box>
  )
}

// ── ask-ci-secrets ────────────────────────────────────────────────────────────
// `entryCount` is the number of build env vars about to be uploaded;
// `targetLabel` is the human label of the chosen target; `cli` is the CLI the
// upload will shell out to (gh/glab) shown in the confirm option. Comfortable:
// the original success line + a <Newline/> + the bold "Upload N build env vars
// to <target>?" prompt + the dim "Capgo will check…" reassurance + a <Newline/>
// + the Select. Dense: both <Newline/>s are dropped and the reassurance copy
// trimmed so the prompt + control fit at 60 cols.

export interface AskCiSecretsStepProps {
  entryCount: number
  targetLabel: string
  cli: string
  onChoose: (choice: 'yes' | 'no') => void
  dense?: boolean
}

export const AskCiSecretsStep: FC<AskCiSecretsStepProps> = ({ entryCount, targetLabel, cli, onChoose, dense = false }) => (
  <Box flexDirection="column" marginTop={1}>
    <SuccessLine text="Android credentials saved" />
    {!dense && <Newline />}
    <Text bold>
      {`Upload ${entryCount} build env var${entryCount === 1 ? '' : 's'} to ${targetLabel}?`}
    </Text>
    <Text dimColor>
      {dense
        ? 'Capgo checks for existing names first and asks before replacing anything.'
        : 'Capgo will check for existing names first and ask before replacing anything.'}
    </Text>
    {!dense && <Newline />}
    <Select
      options={[
        { label: `Upload with ${cli}`, value: 'yes' },
        { label: 'Skip', value: 'no' },
      ]}
      onChange={value => onChoose(value as 'yes' | 'no')}
    />
  </Box>
)

// ── confirm-ci-secret-overwrite ───────────────────────────────────────────────
// `existingKeys` are the env-var names already present on the target that the
// upload would replace. Comfortable: the original listed every key indented
// under the heading (in a `marginTop={1}` box) with a <Newline/> before the
// Select (the original look — rendered only after the parent measured it fits).
// Dense: the box's top margin and the <Newline/> are dropped and only the last
// few keys are shown with a "… +N more" line above them, so a realistic 6+-key
// list can't push the heading, list or replace/skip control off-screen.

export interface ConfirmCiSecretOverwriteStepProps {
  existingKeys: string[]
  onChoose: (choice: 'replace' | 'skip') => void
  dense?: boolean
}

export const ConfirmCiSecretOverwriteStep: FC<ConfirmCiSecretOverwriteStepProps> = ({ existingKeys, onChoose }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="yellow">These env vars already exist and will be replaced:</Text>
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        {existingKeys.map(key => (
          <Text key={key}>{`• ${key}`}</Text>
        ))}
      </Box>
      <Newline />
      <Select
        options={[
          { label: 'Replace existing env vars', value: 'replace' },
          { label: 'Skip upload', value: 'skip' },
        ]}
        onChange={value => onChoose(value as 'replace' | 'skip')}
      />
    </Box>
  )
}

// ── ci-secrets-failed (error) ─────────────────────────────────────────────────
// `error` is the upload failure detail and can be long (CLI stderr).
// Comfortable: the original error line + a <Newline/> + the dim reassurance +
// a <Newline/> + the Select (the original look — rendered only after the parent
// measured it fits). Dense: both <Newline/>s are dropped so a long error can
// still wrap a couple of rows without pushing the retry/continue control
// off-screen.

export interface CiSecretsFailedStepProps {
  error: string | null
  onChoose: (choice: 'retry' | 'continue') => void
  dense?: boolean
}

export const CiSecretsFailedStep: FC<CiSecretsFailedStepProps> = ({ error, onChoose, dense = false }) => (
  <Box flexDirection="column" marginTop={1}>
    <ErrorLine text={error || 'Could not upload env vars.'} />
    {!dense && <Newline />}
    <Text dimColor>You can continue; credentials are already saved locally.</Text>
    {!dense && <Newline />}
    <Select
      options={[
        { label: 'Try upload again', value: 'retry' },
        { label: 'Continue without upload', value: 'continue' },
      ]}
      onChange={value => onChoose(value as 'retry' | 'continue')}
    />
  </Box>
)

// ── ask-build ─────────────────────────────────────────────────────────────────
// Final prompt of the Android flow. Comfortable: the original success line + a
// <Newline/> + the bold "Request a build now?" prompt + a <Newline/> + the
// yes/no Select. Dense: both <Newline/>s are dropped so the success line,
// prompt and control fit within budget.

export interface AskBuildStepProps {
  onChoose: (choice: 'yes' | 'no') => void
  dense?: boolean
}

export const AskBuildStep: FC<AskBuildStepProps> = ({ onChoose, dense = false }) => (
  <Box flexDirection="column" marginTop={1}>
    <SuccessLine text="Android credentials saved" />
    {!dense && <Newline />}
    <Text bold>Request a build now?</Text>
    {!dense && <Newline />}
    <Select
      options={[
        { label: '🚀  Yes, request a build', value: 'yes' },
        { label: '⏭   Not now', value: 'no' },
      ]}
      onChange={value => onChoose(value as 'yes' | 'no')}
    />
  </Box>
)
