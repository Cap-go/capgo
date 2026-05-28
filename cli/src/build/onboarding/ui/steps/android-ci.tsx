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
// The frame-fit contract (see ui/components.tsx + test/helpers/frame-fit.mjs)
// requires every step body to render within BODY_BUDGET_ROWS (13) rows at the
// reference widths (80 and 60 cols). Copy here is deliberately terse and the
// original decorative <Newline/>s are dropped so the bodies stay lean at 60
// columns where text wraps hardest — but the interactive control and its key
// instruction always stay on screen. The list-bearing steps (CI setup advice,
// overwrite confirmation) cap how many entries they show and add a
// "… +N more" hint so a long list can never blow the budget; pickers cap
// `visibleOptionCount` for the same reason.
import type { FC } from 'react'
import type { CiSecretSetupAdvice, CiSecretTarget } from '../../ci-secrets.js'
import { Select } from '@inkjs/ui'
import { Box, Text } from 'ink'
import React from 'react'
import { ErrorLine, SpinnerLine, SuccessLine } from '../components.js'

// A single Select option. Mirrors the shape @inkjs/ui's Select expects so the
// parent can build dynamic option lists and pass them straight through.
export interface SelectOption {
  label: string
  value: string
}

// Capped visible rows for the scrollable picker steps. Kept low so the bold
// header + Select window always fit the 13-row budget even at 60 cols.
const LIST_VISIBLE_COUNT = 4

// How many list entries the non-picker list steps (setup advice, overwrite
// confirmation) render before collapsing the rest into a "… +N more" line.
// Showing the LAST few keeps the most recently relevant entries visible while
// the bold header + interactive control stay on screen.
const SETUP_ADVICE_VISIBLE = 1
const OVERWRITE_KEYS_VISIBLE = 3

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
// commands. The original rendered every entry with a blank line above and
// below plus the label, message and each command — which blew the budget once
// there were 2 providers (or one provider with the 2-line "not installed"
// advice). We render only the first entry in full (the user fixes one platform
// at a time) and collapse the rest to a "… +N more" hint; the decorative
// <Newline/>s are dropped. The Select + its retry/skip instruction always stay
// visible.

export interface CiSecretsSetupStepProps {
  advice: CiSecretSetupAdvice[]
  onChoose: (choice: 'retry' | 'skip') => void
}

export const CiSecretsSetupStep: FC<CiSecretsSetupStepProps> = ({ advice, onChoose }) => {
  const shown = advice.slice(0, SETUP_ADVICE_VISIBLE)
  const hidden = Math.max(0, advice.length - SETUP_ADVICE_VISIBLE)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Set up your git hosting CLI to upload env vars</Text>
      {shown.map(entry => (
        <Box key={entry.target.provider} flexDirection="column">
          <Text>{entry.target.label}</Text>
          <Text dimColor>{entry.message}</Text>
          {entry.commands.map(command => (
            <Text key={`${entry.target.provider}-${command}`} color="cyan">{command}</Text>
          ))}
        </Box>
      ))}
      {hidden > 0 && (
        <Text dimColor>{`… +${hidden} more platform${hidden === 1 ? '' : 's'} to set up`}</Text>
      )}
      <Text dimColor>Run this in another terminal, then come back.</Text>
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
// row) and owns the route handler. Visibility is capped so it can never blow
// the budget, though in practice there are at most two providers + skip.

export interface CiSecretsTargetSelectStepProps {
  options: SelectOption[]
  onChange: (value: string) => void
}

export const CiSecretsTargetSelectStep: FC<CiSecretsTargetSelectStepProps> = ({ options, onChange }) => {
  const hidden = Math.max(0, options.length - LIST_VISIBLE_COUNT)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Where should Capgo upload the build env vars?</Text>
      <Select
        visibleOptionCount={LIST_VISIBLE_COUNT}
        options={options}
        onChange={onChange}
      />
      {hidden > 0 && (
        <Text dimColor>{`… +${hidden} more (↑/↓ to scroll)`}</Text>
      )}
    </Box>
  )
}

// ── ask-ci-secrets ────────────────────────────────────────────────────────────
// `entryCount` is the number of build env vars about to be uploaded;
// `targetLabel` is the human label of the chosen target; `cli` is the CLI the
// upload will shell out to (gh/glab) shown in the confirm option. The original
// had a blank line after the success line and before the Select; both
// <Newline/>s are dropped so the prompt + control fit at 60 cols.

export interface AskCiSecretsStepProps {
  entryCount: number
  targetLabel: string
  cli: string
  onChoose: (choice: 'yes' | 'no') => void
}

export const AskCiSecretsStep: FC<AskCiSecretsStepProps> = ({ entryCount, targetLabel, cli, onChoose }) => (
  <Box flexDirection="column" marginTop={1}>
    <SuccessLine text="Android credentials saved" />
    <Text bold>
      {`Upload ${entryCount} build env var${entryCount === 1 ? '' : 's'} to ${targetLabel}?`}
    </Text>
    <Text dimColor>Capgo checks for existing names first and asks before replacing anything.</Text>
    <Select
      options={[
        { label: `Upload with ${cli}`, value: 'yes' },
        { label: 'Skip', value: 'no' },
      ]}
      onChange={value => onChoose(value as 'yes' | 'no')}
    />
  </Box>
)

// ── checking-ci-secrets (spinner) ─────────────────────────────────────────────

export interface CheckingCiSecretsStepProps {
  targetLabel: string
}

export const CheckingCiSecretsStep: FC<CheckingCiSecretsStepProps> = ({ targetLabel }) => (
  <Box marginTop={1}><SpinnerLine text={`Checking existing env vars in ${targetLabel}...`} /></Box>
)

// ── confirm-ci-secret-overwrite ───────────────────────────────────────────────
// `existingKeys` are the env-var names already present on the target that the
// upload would replace. The original listed every key indented under the
// heading with a blank line before the Select; a realistic 6+-key list blew the
// budget. We show the last few keys + a "… +N more" line and drop the
// <Newline/>, keeping the heading, the list and the replace/skip control on
// screen.

export interface ConfirmCiSecretOverwriteStepProps {
  existingKeys: string[]
  onChoose: (choice: 'replace' | 'skip') => void
}

export const ConfirmCiSecretOverwriteStep: FC<ConfirmCiSecretOverwriteStepProps> = ({ existingKeys, onChoose }) => {
  const shown = existingKeys.slice(-OVERWRITE_KEYS_VISIBLE)
  const hidden = Math.max(0, existingKeys.length - OVERWRITE_KEYS_VISIBLE)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="yellow">These env vars already exist and will be replaced:</Text>
      <Box flexDirection="column" marginLeft={2}>
        {hidden > 0 && (
          <Text dimColor>{`… +${hidden} more`}</Text>
        )}
        {shown.map(key => (
          <Text key={key}>{`• ${key}`}</Text>
        ))}
      </Box>
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

// ── uploading-ci-secrets (spinner) ────────────────────────────────────────────

export interface UploadingCiSecretsStepProps {
  targetLabel: string
}

export const UploadingCiSecretsStep: FC<UploadingCiSecretsStepProps> = ({ targetLabel }) => (
  <Box marginTop={1}><SpinnerLine text={`Uploading env vars to ${targetLabel}...`} /></Box>
)

// ── ci-secrets-failed (error) ─────────────────────────────────────────────────
// `error` is the upload failure detail and can be long (CLI stderr). The
// original wrapped the error + a reassurance line with blank lines around both
// plus the Select, which overflowed at 60 cols once the error wrapped. The
// reassurance is compressed to one dim line and the <Newline/>s are dropped; a
// long error can still wrap a couple of rows without pushing the retry/continue
// control off-screen.

export interface CiSecretsFailedStepProps {
  error: string | null
  onChoose: (choice: 'retry' | 'continue') => void
}

export const CiSecretsFailedStep: FC<CiSecretsFailedStepProps> = ({ error, onChoose }) => (
  <Box flexDirection="column" marginTop={1}>
    <ErrorLine text={error || 'Could not upload env vars.'} />
    <Text dimColor>You can continue; credentials are already saved locally.</Text>
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
// Final prompt of the Android flow. The original had blank lines around the
// "Request a build now?" prompt; both <Newline/>s are dropped so the success
// line, prompt and yes/no control fit comfortably.

export interface AskBuildStepProps {
  onChoose: (choice: 'yes' | 'no') => void
}

export const AskBuildStep: FC<AskBuildStepProps> = ({ onChoose }) => (
  <Box flexDirection="column" marginTop={1}>
    <SuccessLine text="Android credentials saved" />
    <Text bold>Request a build now?</Text>
    <Select
      options={[
        { label: '🚀  Yes, request a build', value: 'yes' },
        { label: '⏭   Not now', value: 'no' },
      ]}
      onChange={value => onChoose(value as 'yes' | 'no')}
    />
  </Box>
)
