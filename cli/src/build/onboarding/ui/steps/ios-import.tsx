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

/**
 * Why the wizard ended up on the no-match recovery menu. Drives the Alert
 * + hint copy in `ImportNoMatchRecoveryStep` so each route gets accurate
 * context — previously the screen claimed "no profile linked to this cert"
 * even when the parent had just logged "Apple linked them to X" (cases 3
 * and 4 below). Set by the parent right before each setStep call; absent
 * (undefined) is treated as the legacy `no-profile-on-disk` default for
 * back-compat with call sites that haven't been audited yet.
 *
 *   - 'no-profile-on-disk'        : identity picked, no usable on-disk
 *                                   profile, and no ASC key to query Apple.
 *   - 'apple-no-cert-match'       : findCertIdBySha1 returned null — Apple
 *                                   doesn't recognize this cert.
 *   - 'apple-no-profiles-linked'  : Apple has the cert but zero profiles
 *                                   linked to it.
 *   - 'apple-bundle-mismatch'     : Apple has profiles but none target the
 *                                   current app's bundle id.
 *   - 'apple-distribution-mismatch': Apple has profiles for this bundle id
 *                                   but none in the requested distribution
 *                                   mode (app_store vs ad_hoc).
 *   - 'apple-other'               : catch-all when none of the specific
 *                                   filters above explain the empty result.
 */
export type NoMatchReason
  = | 'no-profile-on-disk'
    | 'apple-no-cert-match'
    | 'apple-no-profiles-linked'
    | 'apple-bundle-mismatch'
    | 'apple-distribution-mismatch'
    | 'apple-other'

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
// Routed in from up to six distinct conditions in the parent — see the
// NoMatchReason union above. The Alert + hint copy switches on `reason` so
// the screen tells the user the real cause instead of always saying "no
// profile linked to this cert" (which contradicted the yellow log line for
// the bundle-id-mismatch and distribution-mismatch routes). `appId` and
// `importDistribution` carry the contextual nouns that the Apple-side
// variants need to name.
export interface ImportNoMatchRecoveryStepProps {
  identityName: string
  options: SelectOption[]
  /**
   * Why the wizard ended up here. Optional for back-compat — undefined
   * renders the legacy `no-profile-on-disk` wording.
   */
  reason?: NoMatchReason
  /** Concrete iOS bundle id; used by the bundle-mismatch + distribution-mismatch alerts. */
  appId?: string
  /** Active distribution mode; used by the distribution-mismatch alert. */
  importDistribution?: 'app_store' | 'ad_hoc' | null
  dense?: boolean
  onChange: (value: string) => void
}

/**
 * Pick the Alert sentence given a reason. The default branch covers both
 * the explicit `no-profile-on-disk` reason AND the undefined/legacy case,
 * preserving the original wording exactly so call sites that haven't been
 * audited keep their current UX.
 */
function alertText(
  reason: NoMatchReason | undefined,
  identityName: string,
  appId: string | undefined,
  distribution: 'app_store' | 'ad_hoc' | null | undefined,
): string {
  switch (reason) {
    case 'apple-no-cert-match':
      return `Apple's records don't include the certificate "${identityName}". It may have been revoked, never uploaded, or belong to a different team.`
    case 'apple-no-profiles-linked':
      return `Apple has the certificate "${identityName}" but no provisioning profiles are linked to it yet.`
    case 'apple-bundle-mismatch':
      return `Apple has profiles for "${identityName}" but none target "${appId ?? 'this app'}".`
    case 'apple-distribution-mismatch':
      return `Apple has profiles for "${appId ?? 'this app'}" under "${identityName}" but none are ${distribution ?? 'the requested distribution'}.`
    case 'apple-other':
      return `Apple returned profiles for "${identityName}" but none match this app.`
    case 'no-profile-on-disk':
    case undefined:
      return `No provisioning profile on this Mac is linked to "${identityName}".`
  }
}

/**
 * Pick the dim hint line below the alert. Each reason hints at the
 * recovery option most likely to succeed, so the user has a steer before
 * scanning the Select. The default keeps the original wording.
 */
function hintText(
  reason: NoMatchReason | undefined,
  appId: string | undefined,
  distribution: 'app_store' | 'ad_hoc' | null | undefined,
): string {
  switch (reason) {
    case 'apple-no-cert-match':
      return 'Pick a recovery path — the certificate needs to be re-issued in the Apple Developer Portal first.'
    case 'apple-no-profiles-linked':
      return 'Pick a recovery path — "Create a new App Store profile" makes one for this cert via the Apple API.'
    case 'apple-bundle-mismatch':
      return `Pick a recovery path — "Create a new App Store profile" makes one for "${appId ?? 'this app'}".`
    case 'apple-distribution-mismatch':
      return `Pick a recovery path — re-run with the matching distribution mode${distribution ? ` (other than ${distribution})` : ''}, or create a new profile via the Apple API.`
    case 'apple-other':
      return 'Pick a recovery path:'
    case 'no-profile-on-disk':
    case undefined:
      return `The cert is in your Keychain but the matching profile isn't on disk. Pick a recovery path:`
  }
}

export const ImportNoMatchRecoveryStep: FC<ImportNoMatchRecoveryStepProps> = ({ identityName, options, reason, appId, importDistribution, onChange }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Alert variant="warning">
        {alertText(reason, identityName, appId, importDistribution)}
      </Alert>
      <Newline />
      <Text dimColor>
        {hintText(reason, appId, importDistribution)}
      </Text>
      <Newline />
      <Select options={options} onChange={onChange} />
    </Box>
  )
}

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
      {!dense && <Newline />}
      <Box flexDirection="column" marginLeft={2}>
        {dense
          ? (
              <>
                <Text dimColor>1. macOS will pop up a Keychain permission dialog.</Text>
                <Text dimColor>2. Click "Always Allow" so retries don't re-prompt.</Text>
                <Text dimColor>3. That's the only prompt — the rest is non-interactive.</Text>
              </>
            )
          : (
              <>
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
              </>
            )}
      </Box>
      {!dense && <Newline />}
      {select}
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
