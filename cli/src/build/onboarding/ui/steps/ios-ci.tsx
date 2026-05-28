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
// Adaptive spacing. Each interactive step renders its COMFORTABLE form (the
// original design — decorative <Newline/> blank-line spacing between elements,
// per-provider setup advice with its full reason message, the full overwrite
// key list, and an UN-CAPPED Select that shows every option) by DEFAULT and
// collapses to a COMPACT form only when the parent passes `dense=true`. The
// parent (ui/app.tsx) measures the comfortable body against the live viewport
// and flips `dense` on only when the comfortable version can't fit — so a roomy
// terminal breathes while a 16-row terminal still survives. `dense` defaults to
// `false`, so a component rendered without the prop (e.g. a test asserting the
// comfortable form) gets the original look. All props/handlers/behaviour are
// identical across both modes.
//
// The 16-row frame contract (see ui/components.tsx + test/helpers/frame-fit.mjs)
// is a FLOOR we must survive on short terminals, not a cap on every terminal:
// every step body's DENSE form must render within BODY_BUDGET_ROWS (13) rows at
// the reference widths (80 + 60) — that's the form which must survive the floor.
// The comfortable form may legitimately exceed the budget (it only renders when
// the parent measured that it fits). The budget offenders in dense mode are:
//   • ci-secrets-setup lists per-provider install/login advice — the dense form
//     drops the decorative blank lines + the reason message and keeps only the
//     provider label + command lines.
//   • confirm-ci-secret-overwrite lists the env vars that would be replaced —
//     the dense form caps to the last few keys + a "… +N more" line.
//   • ci-secrets-failed renders an arbitrary error string — the dense form
//     clamps it so a long backend error can't wrap past a couple of rows and
//     push the picker off screen.
// In dense mode pickers cap @inkjs/ui's `Select` with `visibleOptionCount`;
// every step keeps its interactive control + key instruction on screen.
// Verified in test-frame-fit-ios-ci.mjs (dense form asserted ≤ 13).
//
// Pure spinner steps (detecting-ci-secrets / checking-ci-secrets /
// uploading-ci-secrets) are a single SpinnerLine that fits both forms
// identically, so they take no `dense` prop.
import { Select } from '@inkjs/ui'
import { Box, Newline, Text } from 'ink'
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
// never needs scrolling, but we pass the cap defensively in dense mode,
// mirroring the Android keystore flow.
const TARGET_VISIBLE_COUNT = 3

// How many already-exist keys to render in the dense overwrite confirmation
// before collapsing the remainder into a "… +N more" line. iOS + Android
// credentials can produce ~10 env vars, which would blow the 13-row budget if
// listed in full at 60 cols. Showing the last few + a count keeps the
// interactive control visible while still telling the user how many will be
// replaced. The comfortable form lists every key.
const OVERWRITE_VISIBLE_KEYS = 3

// Upper bound on the rendered length of a backend error string in the dense
// form. A long `gh`/`glab` failure (stderr + stdout joined) can wrap to many
// rows at 60 cols and shove the retry/continue picker off screen; clamping
// keeps it to ~2 wrapped rows. The full error is only ever surfaced here, so the
// clamp is purely cosmetic — the user still gets the actionable retry control.
// The comfortable form renders the full error.
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
// (retry re-runs detection; skip jumps to build-complete).
//
// Comfortable: the bold heading, a <Newline/>, then each provider's advice block
// (the label, the dim reason `message`, and the command lines) separated by a
// marginBottom={1}, the "Run this in another terminal…" dim note, another
// <Newline/>, then the Select. Dense: the blank lines + the per-provider reason
// message drop so two providers' worth of label + command lines still fits 13
// rows at 60 cols.
export interface CiSecretsSetupStepProps {
  advice: CiSecretSetupAdvice[]
  dense?: boolean
  onChange: (value: string) => void
}

export const CiSecretsSetupStep: FC<CiSecretsSetupStepProps> = ({ advice, dense = false, onChange }) => {
  const select = (
    <Select
      options={[
        { label: 'I installed and logged in, check again', value: 'retry' },
        { label: 'Skip upload', value: 'skip' },
      ]}
      onChange={onChange}
    />
  )
  if (!dense) {
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
        {select}
      </Box>
    )
  }
  return (
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
      {select}
    </Box>
  )
}

// ── ci-secrets-target-select ──────────────────────────────────────────────────
// Shown when more than one git hosting CLI is ready. `options` is built by the
// parent (one row per ready target + a Skip row) so this component stays
// presentational and the parent keeps ownership of mapping a chosen provider
// back to its CiSecretTarget.
//
// Comfortable: the bold question, a <Newline/>, then an UN-capped Select. Dense:
// the blank line drops and the Select caps to TARGET_VISIBLE_COUNT visible rows.
export interface CiSecretsTargetSelectStepProps {
  options: SelectOption[]
  dense?: boolean
  onChange: (value: string) => void
}

export const CiSecretsTargetSelectStep: FC<CiSecretsTargetSelectStepProps> = ({ options, dense = false, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Where should Capgo upload the build env vars?</Text>
    {!dense && <Newline />}
    {dense
      ? <Select visibleOptionCount={TARGET_VISIBLE_COUNT} options={options} onChange={onChange} />
      : <Select options={options} onChange={onChange} />}
  </Box>
)

// ── ask-ci-secrets ────────────────────────────────────────────────────────────
// Confirmation prompt offering to upload the freshly saved credentials as CI
// secrets. `entryCount` drives the pluralised heading; `target` provides the
// destination label + CLI name for the option label. The parent routes yes →
// checking-ci-secrets, no → build-complete.
//
// Comfortable: the success line, a <Newline/>, the bold upload question, the dim
// "Capgo will check…and ask before replacing anything." note, another
// <Newline/>, then the Select. Dense: the blank lines drop and the dim note is
// trimmed so the heading + note + two choices fit the budget at 60 cols.
export interface AskCiSecretsStepProps {
  entryCount: number
  target: CiSecretTarget | null
  targetLabel: string
  dense?: boolean
  onChange: (value: string) => void
}

export const AskCiSecretsStep: FC<AskCiSecretsStepProps> = ({ entryCount, target, targetLabel, dense = false, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <SuccessLine text="Credentials saved" />
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
// Some of the env vars we'd upload already exist remotely. The parent routes
// replace → uploading-ci-secrets, skip → build-complete.
//
// Comfortable: the bold yellow warning, the FULL list of keys that would be
// replaced (in a marginTop+marginLeft box), a <Newline/>, then the Select.
// Dense: the list caps to the last OVERWRITE_VISIBLE_KEYS keys + a "… +N more"
// count and the blank lines drop, so a long list (iOS + Android credentials →
// ~10 keys) can't blow the budget at 60 cols.
export interface ConfirmCiSecretOverwriteStepProps {
  existingKeys: string[]
  dense?: boolean
  onChange: (value: string) => void
}

const OVERWRITE_OPTIONS = [
  { label: 'Replace existing env vars', value: 'replace' },
  { label: 'Skip upload', value: 'skip' },
]

export const ConfirmCiSecretOverwriteStep: FC<ConfirmCiSecretOverwriteStepProps> = ({ existingKeys, dense = false, onChange }) => {
  if (!dense) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="yellow">These env vars already exist and will be replaced:</Text>
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          {existingKeys.map(key => (
            <Text key={key}>{`• ${key}`}</Text>
          ))}
        </Box>
        <Newline />
        <Select options={OVERWRITE_OPTIONS} onChange={onChange} />
      </Box>
    )
  }
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
      <Select options={OVERWRITE_OPTIONS} onChange={onChange} />
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
// continue. The parent routes retry → checking-ci-secrets (or
// detecting-ci-secrets when no target is known) and continue → build-complete.
//
// Comfortable: the FULL (unclamped) error line, a <Newline/>, the dim "You can
// continue…" note, another <Newline/>, then the Select. Dense: `error` is an
// arbitrary backend string — clamped via `clampError` so it can't wrap past a
// couple of rows and hide the picker — and the blank lines drop.
export interface CiSecretsFailedStepProps {
  error: string | null
  dense?: boolean
  onChange: (value: string) => void
}

const FAILED_OPTIONS = [
  { label: 'Try upload again', value: 'retry' },
  { label: 'Continue without upload', value: 'continue' },
]

export const CiSecretsFailedStep: FC<CiSecretsFailedStepProps> = ({ error, dense = false, onChange }) => {
  if (!dense) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <ErrorLine text={error || 'Could not upload env vars.'} />
        <Newline />
        <Text dimColor>You can continue; credentials are already saved locally.</Text>
        <Newline />
        <Select options={FAILED_OPTIONS} onChange={onChange} />
      </Box>
    )
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <ErrorLine text={clampError(error || 'Could not upload env vars.')} />
      <Text dimColor>You can continue; credentials are already saved locally.</Text>
      <Select options={FAILED_OPTIONS} onChange={onChange} />
    </Box>
  )
}

// ── ask-build ─────────────────────────────────────────────────────────────────
// Final prompt of the credential flow: kick off the first cloud build now or
// finish. The parent routes yes → requesting-build, no → build-complete.
//
// Comfortable: the success line, a <Newline/>, the bold question, another
// <Newline/>, then the Select. Dense: the blank lines drop so the body fits the
// budget at 60 cols.
export interface AskBuildStepProps {
  dense?: boolean
  onChange: (value: string) => void
}

export const AskBuildStep: FC<AskBuildStepProps> = ({ dense = false, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <SuccessLine text="Credentials saved" />
    {!dense && <Newline />}
    <Text bold>Start your first cloud build now?</Text>
    {!dense && <Newline />}
    <Select
      options={[
        { label: '🚀  Yes, build now', value: 'yes' },
        { label: '⏭️   No, I\'ll build later', value: 'no' },
      ]}
      onChange={onChange}
    />
  </Box>
)
