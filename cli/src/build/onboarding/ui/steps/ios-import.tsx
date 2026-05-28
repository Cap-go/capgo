import type { FC } from 'react'
// src/build/onboarding/ui/steps/ios-import.tsx
//
// Pure presentational step bodies for the iOS "import existing credentials"
// sub-flow of the `build init` onboarding wizard (macOS only). Each component is
// "props in → JSX out": every dynamic value and event handler is an explicit,
// typed prop. The parent wizard (ui/app.tsx) owns all state, routing, async work
// and terminal-size measurement; these components never touch
// `useStdout` / `measureElement`.
//
// The frame-fit contract (see ui/components.tsx + test/helpers/frame-fit.mjs)
// requires every step body to render within BODY_BUDGET_ROWS (13) rows at the
// reference widths (80 + 60). The list/picker steps cap the @inkjs/ui `Select`
// with `visibleOptionCount` and add a "+N more (↑/↓)" hint so a long list can't
// blow the budget; the verbose warning/recovery/compiling steps use terse copy
// with decorative blank lines dropped, while always keeping the interactive
// control + the key instruction visible. Verified in
// test-frame-fit-ios-import.mjs.
import { Alert, Select } from '@inkjs/ui'
import { Box, Text } from 'ink'
import React from 'react'
import { SpinnerLine } from '../components.js'

// A single Select option. Mirrors the shape @inkjs/ui's Select expects so the
// parent can build option lists (identity/profile rows + control rows) and pass
// them straight through. Matches ios-credentials.tsx's SelectOption.
export interface SelectOption {
  label: string
  value: string
}

// `Select` only ever renders `visibleOptionCount` OPTIONS (it scrolls the
// rest) — but each option can WRAP to multiple terminal rows at narrow widths.
// The identity/profile labels here are long (full cert name + bundle id), so an
// option wraps to ~3 rows at 60 cols; capping at 3 visible options keeps the
// worst case (3 × 3 = 9 body rows + header + hint) inside the 13-row budget. A
// "+N more" hint tells the user the list scrolls. (The Android keystore flow
// can afford 4 because its alias labels are single short tokens that never
// wrap.)
const LIST_VISIBLE_COUNT = 3

// ── import-scanning ───────────────────────────────────────────────────────────
export const ImportScanningStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Scanning Keychain and provisioning profiles..." />
    <Text dimColor>This is read-only — no Keychain password prompt yet.</Text>
  </Box>
)

// ── import-distribution-mode ──────────────────────────────────────────────────
// First visible step of the import flow. The three options (App Store / Ad-hoc /
// Cancel) are dispatched by the parent, which owns the persistence + routing.
export interface ImportDistributionModeStepProps {
  onChange: (value: string) => void | Promise<void>
}

export const ImportDistributionModeStep: FC<ImportDistributionModeStepProps> = ({ onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>How will Capgo distribute your build?</Text>
    <Text dimColor>• App Store: auto-uploads to TestFlight (needs an ASC API key).</Text>
    <Text dimColor>• Ad-hoc: signed build, downloaded from Capgo or via QR. No ASC key.</Text>
    <Select
      options={[
        { label: '🛫  App Store / TestFlight', value: 'app_store' },
        { label: '📦  Ad-hoc (no TestFlight upload)', value: 'ad_hoc' },
        { label: '↩️   Cancel and use Create new instead', value: '__cancel__' },
      ]}
      onChange={onChange}
    />
  </Box>
)

// ── import-pick-identity ──────────────────────────────────────────────────────
// `options` is built by the parent (one row per Keychain identity + a cancel
// row) so this component stays presentational. `identityCount` drives the
// header copy. `hiddenCount` is how many option rows scroll out of view.
export interface ImportPickIdentityStepProps {
  identityCount: number
  options: SelectOption[]
  onChange: (value: string) => void | Promise<void>
}

export const ImportPickIdentityStep: FC<ImportPickIdentityStepProps> = ({ identityCount, options, onChange }) => {
  const hidden = Math.max(0, options.length - LIST_VISIBLE_COUNT)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>
        {`Found ${identityCount} distribution identit${identityCount === 1 ? 'y' : 'ies'} in your Keychain. Pick one:`}
      </Text>
      <Select visibleOptionCount={LIST_VISIBLE_COUNT} options={options} onChange={onChange} />
      {hidden > 0 && (
        <Text dimColor>{`… +${hidden} more (↑/↓ to scroll)`}</Text>
      )}
    </Box>
  )
}

// ── import-pick-profile ───────────────────────────────────────────────────────
// The parent filters profiles to this app + distribution mode, builds the
// option rows (matching profiles + a "back" row) and computes `matchedCount`
// (matching, shown in the header) and `droppedCount` (filtered out, shown as a
// hint). This component only renders + forwards the choice. `distribution` is
// appended to the header when known.
export interface ImportPickProfileStepProps {
  matchedCount: number
  droppedCount: number
  distribution: 'app_store' | 'ad_hoc' | null
  options: SelectOption[]
  onChange: (value: string) => void
}

export const ImportPickProfileStep: FC<ImportPickProfileStepProps> = ({
  matchedCount,
  droppedCount,
  distribution,
  options,
  onChange,
}) => {
  const hidden = Math.max(0, options.length - LIST_VISIBLE_COUNT)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>
        {`Pick a profile (${matchedCount} match this app's bundle ID${distribution ? `, ${distribution}` : ''}):`}
      </Text>
      {droppedCount > 0 && (
        <Text dimColor>
          {`(${droppedCount} hidden — wrong bundle ID or distribution)`}
        </Text>
      )}
      <Select visibleOptionCount={LIST_VISIBLE_COUNT} options={options} onChange={onChange} />
      {hidden > 0 && (
        <Text dimColor>{`… +${hidden} more (↑/↓ to scroll)`}</Text>
      )}
    </Box>
  )
}

// ── import-no-match-recovery ──────────────────────────────────────────────────
// The cert is in the Keychain but no profile on disk matches it. The parent
// builds the recovery `options` (browser / fetch / optionally create / back),
// whose labels vary on whether an ASC key is already known and whether create
// is allowed for the distribution mode. `identityName` is shown in the warning.
export interface ImportNoMatchRecoveryStepProps {
  identityName: string
  options: SelectOption[]
  onChange: (value: string) => void
}

// The original Alert box wrapped the (unbounded) identity name to 3 inner lines
// → a 5-row box that blew the budget at 60 cols once the recovery options
// (which themselves wrap) were added. Dropped to a plain bold warning line (no
// border/padding) — same as the Android keystore explainer's fix — so the long
// name costs only its wrapped text, never box chrome.
export const ImportNoMatchRecoveryStep: FC<ImportNoMatchRecoveryStepProps> = ({ identityName, options, onChange }) => {
  const hidden = Math.max(0, options.length - LIST_VISIBLE_COUNT)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="yellow">{`⚠  No profile on this Mac is linked to "${identityName}".`}</Text>
      <Text dimColor>Cert is in your Keychain, profile isn't on disk. Pick a recovery path:</Text>
      <Select visibleOptionCount={LIST_VISIBLE_COUNT} options={options} onChange={onChange} />
      {hidden > 0 && (
        <Text dimColor>{`… +${hidden} more (↑/↓ to scroll)`}</Text>
      )}
    </Box>
  )
}

// ── import-fetching-profile ───────────────────────────────────────────────────
export const ImportFetchingProfileStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Looking up your cert on Apple and listing its profiles..." />
  </Box>
)

// ── import-create-profile-only ────────────────────────────────────────────────
// D2: create a new profile via Apple for the cert already in the Keychain
// (cert creation is skipped). Static spinner + a one-line clarification.
export const ImportCreateProfileOnlyStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Creating a new App Store profile via Apple for your existing certificate..." />
    <Text dimColor>(Skipping cert creation — using the cert already in your Keychain.)</Text>
  </Box>
)

// ── import-export-warning ─────────────────────────────────────────────────────
// Heads-up before the single Keychain permission dialog. The label of the
// "export now" row embeds the identity name; the parent owns the go/back/exit
// routing. Numbered steps condensed to single un-wrapped lines.
export interface ImportExportWarningStepProps {
  identityName: string
  onChange: (value: string) => void
}

export const ImportExportWarningStep: FC<ImportExportWarningStepProps> = ({ identityName, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <Alert variant="warning">macOS will now ask permission to access your private key.</Alert>
    <Box flexDirection="column" marginLeft={2}>
      <Text>
        <Text bold color="white">1.</Text>
        {' '}
        A Keychain dialog will pop up.
      </Text>
      <Text>
        <Text bold color="white">2.</Text>
        {' '}
        Click
        {' '}
        <Text bold color="green">"Always Allow"</Text>
        {' '}
        so it doesn't re-ask on retry.
      </Text>
      <Text>
        <Text bold color="white">3.</Text>
        {' '}
        That's the only prompt — export is otherwise non-interactive.
      </Text>
    </Box>
    <Select
      options={[
        { label: `🔓  Export "${identityName}" now`, value: 'go' },
        { label: '↩️   Back', value: 'back' },
        { label: '✖  Exit onboarding', value: 'exit' },
      ]}
      onChange={onChange}
    />
  </Box>
)

// ── import-compiling-helper ───────────────────────────────────────────────────
// One-time-per-CLI-version compile of the Swift keychain-export helper.
// Condensed from the original spinner + Newline + 2 wrapping paragraphs (which
// blew the budget at 60 cols) to terse single-line notes.
export const ImportCompilingHelperStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Compiling keychain-export helper (one-time, ~2-3s)..." />
    <Box flexDirection="column" marginLeft={2}>
      <Text dimColor>
        A small Swift program wraps Apple's Security framework — compiled with
        {' '}
        <Text bold>swiftc</Text>
        {' '}
        into your temp folder.
      </Text>
      <Text dimColor>Cached for this CLI version — future runs skip this step.</Text>
    </Box>
  </Box>
)

// ── import-exporting ──────────────────────────────────────────────────────────
export const ImportExportingStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Exporting from Keychain — check for the macOS dialog..." />
    <Text dimColor>If you don't see a dialog, look behind other windows or the menu bar.</Text>
  </Box>
)
