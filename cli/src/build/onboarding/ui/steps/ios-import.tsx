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
// Adaptive spacing. Each interactive step renders its COMFORTABLE form (the
// original design — bordered Alert banners, decorative <Newline/> blank-line
// spacing, full multi-line copy, and an UN-CAPPED Select that shows every
// option) by DEFAULT and collapses to a COMPACT form only when the parent passes
// `dense=true`. The parent (ui/app.tsx) measures the comfortable body against the
// live viewport and flips `dense` on only when the comfortable version can't fit
// — so a roomy terminal breathes while a 16-row terminal still survives. `dense`
// defaults to `false`, so a component rendered without the prop (e.g. a test
// asserting the comfortable form) gets the original look. All props/handlers/
// behaviour are identical across both modes.
//
// The 16-row frame contract (see ui/components.tsx + test/helpers/frame-fit.mjs)
// is a FLOOR we must survive on short terminals, not a cap on every terminal:
// every step body's DENSE form must render within BODY_BUDGET_ROWS (13) rows at
// the reference widths (80 + 60) — that's the form which must survive the floor.
// In dense mode the list/picker steps cap the @inkjs/ui `Select` with
// `visibleOptionCount` and add a "+N more (↑/↓)" hint so a long list can't blow
// the budget; the verbose warning/recovery/compiling steps switch to terse copy
// with the decorative blank lines (and Alert chrome) dropped, while always
// keeping the interactive control + the key instruction visible. The comfortable
// form may legitimately exceed the budget (it only renders when the parent
// measured that it fits). Verified in test-frame-fit-ios-import.mjs (dense form
// asserted ≤ 13).
//
// Pure spinner steps (import-scanning / import-fetching-profile /
// import-create-profile-only / import-exporting) are a single SpinnerLine plus
// at most one short note that fits both forms identically, so they take no
// `dense` prop.
import { Alert, Select } from '@inkjs/ui'
import { Box, Newline, Text } from 'ink'
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
//
// Comfortable: the bold question, a <Newline/>, the two full-length bullet lines
// explaining each mode, another <Newline/>, then the Select. Dense: the blank
// lines drop and the bullets shorten to single un-wrapped lines so the
// question + bullets + three choices fit the budget at 60 cols.
export interface ImportDistributionModeStepProps {
  dense?: boolean
  onChange: (value: string) => void | Promise<void>
}

export const ImportDistributionModeStep: FC<ImportDistributionModeStepProps> = ({ dense = false, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>How will Capgo distribute your build?</Text>
    {!dense && <Newline />}
    <Text dimColor>
      {dense
        ? '• App Store: auto-uploads to TestFlight (needs an ASC API key).'
        : '• App Store: builds upload to TestFlight automatically (requires an App Store Connect API key)'}
    </Text>
    <Text dimColor>
      {dense
        ? '• Ad-hoc: signed build, downloaded from Capgo or via QR. No ASC key.'
        : '• Ad-hoc: builds are signed and either downloaded from Capgo or installed via QR. No ASC key needed.'}
    </Text>
    {!dense && <Newline />}
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
// header copy.
//
// Comfortable: the full bold "Found N distribution identity/identities in your
// Keychain. Pick one:" header, a <Newline/>, then an UN-capped Select that lists
// every identity. Dense: the blank line drops and the Select caps to
// LIST_VISIBLE_COUNT visible rows (scrolling the rest) with a "… +N more" hint,
// so even a long list of long cert names stays within budget at 60 cols.
export interface ImportPickIdentityStepProps {
  identityCount: number
  options: SelectOption[]
  dense?: boolean
  onChange: (value: string) => void | Promise<void>
}

export const ImportPickIdentityStep: FC<ImportPickIdentityStepProps> = ({ identityCount, options, dense = false, onChange }) => {
  const hidden = Math.max(0, options.length - LIST_VISIBLE_COUNT)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>
        {`Found ${identityCount} distribution identit${identityCount === 1 ? 'y' : 'ies'} in your Keychain. Pick one:`}
      </Text>
      {!dense && <Newline />}
      {dense
        ? <Select visibleOptionCount={LIST_VISIBLE_COUNT} options={options} onChange={onChange} />
        : <Select options={options} onChange={onChange} />}
      {dense && hidden > 0 && (
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
// Comfortable: the full bold "Pick a provisioning profile (N matching this app's
// bundle ID and X distribution):" header, the full "(N other profile(s) hidden —
// wrong bundle ID or distribution mode)" hint when any were filtered out, a
// <Newline/>, then an UN-capped Select listing every matching profile. Dense: the
// header + dropped hint shorten to single un-wrapped lines, the blank line drops,
// and the Select caps to LIST_VISIBLE_COUNT visible rows with a "… +N more" hint
// so the (wide) profile rows stay within budget at 60 cols.
export interface ImportPickProfileStepProps {
  matchedCount: number
  droppedCount: number
  distribution: 'app_store' | 'ad_hoc' | null
  options: SelectOption[]
  dense?: boolean
  onChange: (value: string) => void
}

export const ImportPickProfileStep: FC<ImportPickProfileStepProps> = ({
  matchedCount,
  droppedCount,
  distribution,
  options,
  dense = false,
  onChange,
}) => {
  const hidden = Math.max(0, options.length - LIST_VISIBLE_COUNT)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>
        {dense
          ? `Pick a profile (${matchedCount} match this app's bundle ID${distribution ? `, ${distribution}` : ''}):`
          : `Pick a provisioning profile (${matchedCount} matching this app's bundle ID${distribution ? ` and ${distribution} distribution` : ''}):`}
      </Text>
      {droppedCount > 0 && (
        <Text dimColor>
          {dense
            ? `(${droppedCount} hidden — wrong bundle ID or distribution)`
            : `(${droppedCount} other profile${droppedCount === 1 ? '' : 's'} hidden — wrong bundle ID or distribution mode)`}
        </Text>
      )}
      {!dense && <Newline />}
      {dense
        ? <Select visibleOptionCount={LIST_VISIBLE_COUNT} options={options} onChange={onChange} />
        : <Select options={options} onChange={onChange} />}
      {dense && hidden > 0 && (
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
  dense?: boolean
  onChange: (value: string) => void
}

// Comfortable: the original layout — the warning inside an `Alert variant=
// "warning"` box ("No provisioning profile on this Mac is linked to '{name}'."),
// a <Newline/>, the full "The cert is in your Keychain but the matching profile
// isn't on disk. Pick a recovery path:" line, another <Newline/>, then an
// UN-capped Select listing every recovery option.
//
// Dense: the Alert box (whose border + padding wrap the unbounded identity name
// to several rows) drops to a plain bold yellow warning line — same as the
// Android keystore explainer's fix, so the long name costs only its wrapped text
// — the dim line + blank lines shorten/drop, and the Select caps to
// LIST_VISIBLE_COUNT visible rows with a "… +N more" hint so the (wrapping)
// recovery options stay within budget at 60 cols.
export const ImportNoMatchRecoveryStep: FC<ImportNoMatchRecoveryStepProps> = ({ identityName, options, dense = false, onChange }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Alert variant="warning">
        {`No provisioning profile on this Mac is linked to "${identityName}".`}
      </Alert>
      <Newline />
      <Text dimColor>
        The cert is in your Keychain but the matching profile isn't on disk. Pick a recovery path:
      </Text>
      <Newline />
      <Select options={options} onChange={onChange} />
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
// routing.
//
// Comfortable: the warning Alert, a <Newline/>, the THREE full numbered steps
// (step 1 quotes the exact macOS dialog text), another <Newline/>, then the
// Select. Dense: the blank lines drop and the numbered steps shorten to single
// un-wrapped lines so the banner + steps + three choices fit the budget at 60
// cols. The Select is always shown in full (only three rows).
export interface ImportExportWarningStepProps {
  identityName: string
  dense?: boolean
  onChange: (value: string) => void
}

export const ImportExportWarningStep: FC<ImportExportWarningStepProps> = ({ identityName, dense = false, onChange }) => {
  const select = (
    <Select
      options={[
        { label: `🔓  Export "${identityName}" now`, value: 'go' },
        { label: '↩️   Back', value: 'back' },
        { label: '✖  Exit onboarding', value: 'exit' },
      ]}
      onChange={onChange}
    />
  )
  return (
    <Box flexDirection="column" marginTop={1}>
      <Alert variant="warning">
        macOS will now ask permission to access your private key.
      </Alert>
      <Newline />
      <Box flexDirection="column" marginLeft={2}>
        <Text>
          <Text bold color="white">1.</Text>
          {' '}
          A Keychain dialog will pop up asking
          {' '}
          <Text bold>"security wants to use your confidential information"</Text>
        </Text>
        <Text>
          <Text bold color="white">2.</Text>
          {' '}
          Click
          {' '}
          <Text bold color="green">"Always Allow"</Text>
          {' '}
          so it doesn't ask again on retry
        </Text>
        <Text>
          <Text bold color="white">3.</Text>
          {' '}
          That's the only prompt — the export is otherwise non-interactive
        </Text>
      </Box>
      <Newline />
      {select}
    </Box>
  )
}

// ── import-compiling-helper ───────────────────────────────────────────────────
// One-time-per-CLI-version compile of the Swift keychain-export helper.
//
// Comfortable: the original spinner, a <Newline/>, then the two full wrapping
// paragraphs (the "~350 lines / wraps Apple's Security framework / compiles via
// swiftc into your OS temp folder" explanation + the "cached for this CLI
// version" note). Dense: the blank line drops and both paragraphs collapse to
// terse single-line notes (the original wrapping paragraphs blew the budget at
// 60 cols).
export interface ImportCompilingHelperStepProps {
  dense?: boolean
}

export const ImportCompilingHelperStep: FC<ImportCompilingHelperStepProps> = ({ dense = false }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <SpinnerLine text="Compiling keychain-export helper (one-time, ~2-3s)..." />
      <Newline />
      <Box flexDirection="column" marginLeft={2}>
        <Text dimColor>
          We ship a small Swift program (~350 lines) that wraps Apple's
          Security framework. It compiles via
          {' '}
          <Text bold>swiftc</Text>
          {' '}
          into your OS temp folder.
        </Text>
        <Text dimColor>
          The result is cached for this CLI version — future runs of
          {' '}
          <Text bold>build init</Text>
          {' '}
          skip this step.
        </Text>
      </Box>
    </Box>
  )
}

// ── import-exporting ──────────────────────────────────────────────────────────
// Spinner + a single short note. Identical in both forms (the note fits the
// budget at 60 cols on its own), so no `dense` branch is needed. Restores the
// original full note copy.
export const ImportExportingStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Exporting from Keychain — check for the macOS dialog..." />
    <Text dimColor>If you don't see a dialog, look behind other windows or check the menu bar.</Text>
  </Box>
)
