import type { FC } from 'react'
// src/build/onboarding/ui/steps/ios-credentials.tsx
//
// Pure presentational step bodies for the iOS credential sub-flow of the
// `build init` onboarding wizard. Each component takes its dynamic values and
// event handlers as typed props (props in → JSX out). All terminal-size
// measurement and the side-effecting async handlers stay in the parent
// (app.tsx); these components only render and forward callbacks.
//
// Adaptive spacing. Each interactive step renders its COMFORTABLE form (the
// original design — bordered Alert banners where applicable, decorative
// <Newline/> blank-line spacing, full multi-step copy) by DEFAULT and collapses
// to a COMPACT form only when the parent passes `dense=true`. The parent
// (ui/app.tsx) measures the comfortable body against the live viewport and
// flips `dense` on only when the comfortable version can't fit — so a roomy
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
// the parent measured that it fits). Verified in
// test-frame-fit-ios-credentials.mjs (dense form asserted ≤ 13).
//
// Pure spinner steps (backing-up / p8-method-select / verifying-key /
// creating-certificate / revoking-certificate / saving-credentials) are a
// single SpinnerLine and render identically in both forms, so they take no
// `dense` prop.
import { Alert, Select } from '@inkjs/ui'
import { Box, Newline, Text } from 'ink'
import React from 'react'
import { Divider, ErrorLine, FilteredTextInput, SpinnerLine, SuccessLine } from '../components.js'

// A single Select option. Mirrors the shape @inkjs/ui's Select expects so the
// parent can build option lists (including dynamic cert/profile rows) and pass
// them straight through.
export interface SelectOption {
  label: string
  value: string
}

// ── credentials-exist ──────────────────────────────────────────────────────
// Comfortable: the bold warning heading, a <Newline/>, the full "create new
// certificates and profiles, replacing…" sentence, another <Newline/>, then the
// Select. Dense: the blank lines drop and the sentence is trimmed so the
// warning + prompt + choices stay within budget at 60 cols.
export interface CredentialsExistStepProps {
  appId: string
  dense?: boolean
  onChange: (value: string) => void
}

export const CredentialsExistStep: FC<CredentialsExistStepProps> = ({ appId, dense = false, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold color="yellow">
      ⚠ iOS credentials already exist for
      {' '}
      {appId}
    </Text>
    {!dense && <Newline />}
    <Text>
      {dense
        ? 'New certs and profiles will replace your existing credentials.'
        : 'Onboarding will create new certificates and profiles, replacing your existing credentials.'}
    </Text>
    {!dense && <Newline />}
    <Select
      options={[
        { label: '📦  Start fresh (backup existing credentials first)', value: 'backup' },
        { label: '✖  Exit onboarding', value: 'exit' },
      ]}
      onChange={onChange}
    />
  </Box>
)

// ── backing-up ──────────────────────────────────────────────────────────────
export const BackingUpStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Backing up existing credentials..." />
  </Box>
)

// ── setup-method-select ──────────────────────────────────────────────────────
// Comfortable: the info Alert, a <Newline/>, the Select, another <Newline/>,
// then the full two-line "Importing reuses the certificate Xcode already
// installed…" tip. Dense: the blank lines drop and the tip is trimmed to a
// single line so the banner + choices + tip fit the budget.
export interface SetupMethodSelectStepProps {
  dense?: boolean
  onChange: (value: string) => void | Promise<void>
}

export const SetupMethodSelectStep: FC<SetupMethodSelectStepProps> = ({ dense = false, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <Alert variant="info">
      How do you want to set up iOS credentials?
    </Alert>
    {!dense && <Newline />}
    <Select
      options={[
        { label: '🆕  Create new via App Store Connect API', value: 'create' },
        { label: '📥  Import existing from this Mac (Keychain + Xcode profiles)', value: 'import' },
      ]}
      onChange={onChange}
    />
    {!dense && <Newline />}
    <Text dimColor>
      {dense
        ? 'Tip: Import reuses Xcode\'s cert, so it skips Apple\'s 3-cert limit.'
        : 'Tip: Importing reuses the certificate Xcode already installed, so it doesn\'t count against Apple\'s 3-cert limit.'}
    </Text>
  </Box>
)

// ── p8-source-select ──────────────────────────────────────────────────────────
// First fork of the ASC API-key step: does the user already have a .p8 file? If
// not — and we can drive the guided macOS helper — offer to create one for them.
export interface P8SourceSelectStepProps {
  dense?: boolean
  /** True when the guided macOS helper is available (macOS + binary present). */
  canAutomate: boolean
  onChange: (value: string) => void | Promise<void>
}

export const P8SourceSelectStep: FC<P8SourceSelectStepProps> = ({ dense = false, canAutomate, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <Alert variant="info">
      Do you already have an App Store Connect API key (.p8 file)?
    </Alert>
    {!dense && <Newline />}
    <Select
      options={[
        { label: '✓  Yes — I have a .p8 file', value: 'have' },
        {
          label: canAutomate
            ? '✨  No — create one for me (guided, opens a window)'
            : '🆕  No — I will create one at App Store Connect',
          value: 'create',
        },
      ]}
      onChange={onChange}
    />
  </Box>
)

// ── p8-create-method-select ───────────────────────────────────────────────────
// macOS only: hand-create the key at App Store Connect, or let the guided helper
// drive the whole flow in an embedded browser and capture the key automatically.
export interface P8CreateMethodSelectStepProps {
  dense?: boolean
  onChange: (value: string) => void | Promise<void>
}

export const P8CreateMethodSelectStep: FC<P8CreateMethodSelectStepProps> = ({ dense = false, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <Alert variant="info">
      How do you want to create the .p8 key?
    </Alert>
    {!dense && <Newline />}
    <Select
      options={[
        { label: '✨  Automated — Capgo guides you and captures the key', value: 'automated' },
        { label: '📝  Manual — I will create it myself at App Store Connect', value: 'manual' },
      ]}
      onChange={onChange}
    />
    {!dense && <Newline />}
    <Text dimColor>
      Automated opens a window, walks you through Apple's UI, and captures the key — no copy-paste.
    </Text>
  </Box>
)

// ── asc-key-generating ────────────────────────────────────────────────────────
// Spinner shown while the guided macOS helper runs in its own window.
export const AscKeyGeneratingStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Guiding you through App Store Connect — finish in the window that opened…" />
  </Box>
)

// ── api-key-instructions ─────────────────────────────────────────────────────
// `canUseFilePicker` decides which control to show: the picker/manual fork
// (Select) or a direct path input (FilteredTextInput). The submit handler for
// the no-picker path is owned by the parent. Telemetry/file-reads happen there.
//
// Renders the (essentially comfortable) form: the info Alert, a <Newline/>, the
// FOUR numbered setup steps in a marginLeft box, a <Newline/>, the "Press Ctrl+O"
// hint, a <Newline/>, a Divider, another <Newline/>, then the control. The old
// adaptive `dense` collapse was dropped when the startup size gate began
// guaranteeing enough rows (see the per-platform floor in min-terminal-size.ts),
// so the multi-step copy no longer changes — `dense` now only suppresses the
// single <Newline/> spacer between the picker prompt and its Select.
export interface ApiKeyInstructionsStepProps {
  canUseFilePicker: boolean
  dense?: boolean
  onMethodChange: (value: string) => void
  onPathSubmit: (value: string) => void | Promise<void>
}

export const ApiKeyInstructionsStep: FC<ApiKeyInstructionsStepProps> = ({
  canUseFilePicker,
  dense = false,
  onMethodChange,
  onPathSubmit,
}) => {
  const control = canUseFilePicker
    ? (
        <>
          <Text bold>How do you want to provide the .p8 file?</Text>
          {!dense && <Newline />}
          <Select
            options={[
              { label: '📂  Open file picker', value: 'picker' },
              { label: '📝  Type the path', value: 'manual' },
            ]}
            onChange={onMethodChange}
          />
        </>
      )
    : (
        <>
          <Text bold>Path to your .p8 file:</Text>
          <Box marginTop={1}>
            <FilteredTextInput
              placeholder="~/Downloads/AuthKey_XXXXXXXXXX.p8"
              onSubmit={onPathSubmit}
            />
          </Box>
        </>
      )
  return (
    <Box flexDirection="column" marginTop={1}>
      <Alert variant="info">
        We need an App Store Connect API key to manage certificates and profiles for you.
      </Alert>
      <Newline />
      <Box flexDirection="column" marginLeft={2}>
        <Text>
          <Text bold color="white">1.</Text>
          {' '}
          Go to
          {' '}
          <Text color="cyan" underline>appstoreconnect.apple.com/access/integrations/api</Text>
        </Text>
        <Text>
          <Text bold color="white">2.</Text>
          {' '}
          Click
          {' '}
          <Text bold>"Generate API Key"</Text>
        </Text>
        <Text>
          <Text bold color="white">3.</Text>
          {' '}
          Name it
          {' '}
          <Text color="yellow">"Capgo Builder"</Text>
          {' '}
          · Access:
          {' '}
          <Text bold color="green">"Admin"</Text>
        </Text>
        <Text>
          <Text bold color="white">4.</Text>
          {' '}
          Download the
          {' '}
          <Text bold>.p8</Text>
          {' '}
          file
        </Text>
      </Box>
      <Newline />
      <Box>
        <Text dimColor>Press </Text>
        <Text bold color="white">Ctrl+O</Text>
        <Text dimColor> to open App Store Connect in your browser</Text>
      </Box>
      <Newline />
      <Divider />
      <Newline />
      {control}
    </Box>
  )
}

// ── p8-method-select ──────────────────────────────────────────────────────────
export const P8MethodSelectStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Opening file picker..." />
  </Box>
)

// ── input-p8-path ──────────────────────────────────────────────────────────────
// The bold label + a marginTop input. Identical in both forms (already a tight
// two-element body), so no `dense` branch is needed.
export interface InputP8PathStepProps {
  onSubmit: (value: string) => void | Promise<void>
}

export const InputP8PathStep: FC<InputP8PathStepProps> = ({ onSubmit }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Path to your .p8 file:</Text>
    <Box marginTop={1}>
      <FilteredTextInput
        placeholder="~/Downloads/AuthKey_XXXXXXXXXX.p8"
        onSubmit={onSubmit}
      />
    </Box>
  </Box>
)

// ── input-key-id ──────────────────────────────────────────────────────────────
// `keyId` is the value detected from the .p8 filename (empty when none was
// found). When present we pre-confirm it and let the user override; when empty
// we prompt for it fresh. The `(value || keyId).trim()` reuse logic lives in the
// parent's onSubmit — this component only renders and forwards.
//
// Comfortable: the original full copy — when detected, the "(detected from
// filename)" label + the green-tick value row with the longer "press Enter to
// confirm, or type a different one" hint + the input. Dense: the hint shortens
// to "Enter to confirm, or type another". The blank-line spacing (marginTop
// boxes) is the original look and is kept in both forms (this body is already
// short).
export interface InputKeyIdStepProps {
  keyId: string
  dense?: boolean
  onSubmit: (value: string) => void
}

export const InputKeyIdStep: FC<InputKeyIdStepProps> = ({ keyId, dense = false, onSubmit }) => (
  <Box flexDirection="column" marginTop={1}>
    {keyId
      ? (
          <>
            <Text bold>
              Key ID
              {' '}
              <Text dimColor>(detected from filename)</Text>
              :
            </Text>
            <Box marginTop={1}>
              <Text color="green">✔ </Text>
              <Text>{keyId}</Text>
              <Text dimColor>{dense ? ' — Enter to confirm, or type another' : ' — press Enter to confirm, or type a different one'}</Text>
            </Box>
            <Box marginTop={1}>
              <FilteredTextInput placeholder={keyId} onSubmit={onSubmit} />
            </Box>
          </>
        )
      : (
          <>
            <Text bold>
              Key ID
              {' '}
              <Text dimColor>(shown next to the key name in App Store Connect)</Text>
              :
            </Text>
            <Box marginTop={1}>
              <FilteredTextInput placeholder="ABC123DEF" onSubmit={onSubmit} />
            </Box>
          </>
        )}
  </Box>
)

// ── input-issuer-id ──────────────────────────────────────────────────────────
// Comfortable: the full label ("…at the very top of the API keys page, above
// the key list"), a <Newline/>, the "Press Ctrl+O" hint, then the input. Dense:
// the label trims, the blank line drops, and the hint sits directly above the
// input so the prompt + hint + input fit the budget.
export interface InputIssuerIdStepProps {
  dense?: boolean
  onSubmit: (value: string) => void
}

export const InputIssuerIdStep: FC<InputIssuerIdStepProps> = ({ dense = false, onSubmit }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>
      Issuer ID
      {' '}
      <Text dimColor>{dense ? '(UUID at the top of the API keys page)' : '(UUID at the very top of the API keys page, above the key list)'}</Text>
      :
    </Text>
    {!dense && <Newline />}
    <Box>
      <Text dimColor>Press </Text>
      <Text bold color="white">Ctrl+O</Text>
      <Text dimColor> to open App Store Connect in your browser</Text>
    </Box>
    <Box marginTop={1}>
      <FilteredTextInput
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        onSubmit={onSubmit}
      />
    </Box>
  </Box>
)

// ── verifying-key ──────────────────────────────────────────────────────────────
export const VerifyingKeyStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Verifying API key with Apple..." />
  </Box>
)

// ── creating-certificate ─────────────────────────────────────────────────────
export const CreatingCertificateStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Generating signing key and CSR..." />
    <SpinnerLine text="Creating iOS distribution certificate..." />
  </Box>
)

// ── cert-limit-prompt ─────────────────────────────────────────────────────────
// Apple caps distribution certs at 3; the user must revoke one to continue.
// `options` is built by the parent (one row per existing cert + an exit row)
// so this component stays presentational. `existingCount` drives the header.
//
// Comfortable: the error line, a <Newline/>, the bold "Select a certificate to
// revoke:" prompt, another <Newline/>, then the Select. Dense: the blank lines
// drop so the error + prompt + the (up to 3 cert rows + exit) Select fit the
// budget at 60 cols.
export interface CertLimitPromptStepProps {
  existingCount: number
  options: SelectOption[]
  dense?: boolean
  onChange: (value: string) => void
}

export const CertLimitPromptStep: FC<CertLimitPromptStepProps> = ({ existingCount, options, dense = false, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <ErrorLine text={`iOS distribution certificate limit reached (${existingCount} existing).`} />
    {!dense && <Newline />}
    <Text bold>Select a certificate to revoke:</Text>
    {!dense && <Newline />}
    <Select options={options} onChange={onChange} />
  </Box>
)

// ── revoking-certificate ─────────────────────────────────────────────────────
export const RevokingCertificateStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Revoking old certificate..." />
  </Box>
)

// ── creating-profile ──────────────────────────────────────────────────────────
// Comfortable: the success "Bundle ID" line, a <Newline/>, then the spinner.
// Dense: the blank line drops. (Both keep the bundle-id confirmation.)
export interface CreatingProfileStepProps {
  appId: string
  dense?: boolean
}

export const CreatingProfileStep: FC<CreatingProfileStepProps> = ({ appId, dense = false }) => (
  <Box flexDirection="column" marginTop={1}>
    <SuccessLine text="Bundle ID" detail={appId} />
    {!dense && <Newline />}
    <SpinnerLine text="Creating App Store provisioning profile..." />
  </Box>
)

// ── duplicate-profile-prompt ─────────────────────────────────────────────────
// Comfortable: the error line, a <Newline/>, the bold "Delete old profiles…"
// question, another <Newline/>, then the Select. Dense: the blank lines drop so
// the error + question + two choices fit the budget.
export interface DuplicateProfilePromptStepProps {
  duplicateCount: number
  dense?: boolean
  onChange: (value: string) => void
}

export const DuplicateProfilePromptStep: FC<DuplicateProfilePromptStepProps> = ({ duplicateCount, dense = false, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <ErrorLine text={`Found ${duplicateCount} existing Capgo profile(s) for this app.`} />
    {!dense && <Newline />}
    <Text bold>Delete old profiles and create a new one?</Text>
    {!dense && <Newline />}
    <Select
      options={[
        { label: '✔  Yes, delete old profiles and recreate', value: 'delete' },
        { label: '✖  No, exit onboarding', value: 'exit' },
      ]}
      onChange={onChange}
    />
  </Box>
)

// ── deleting-duplicate-profiles ──────────────────────────────────────────────
export interface DeletingDuplicateProfilesStepProps {
  duplicateCount: number
}

export const DeletingDuplicateProfilesStep: FC<DeletingDuplicateProfilesStepProps> = ({ duplicateCount }) => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text={`Deleting ${duplicateCount} old profile(s)...`} />
  </Box>
)

// ── saving-credentials ──────────────────────────────────────────────────────
export const SavingCredentialsStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Saving credentials..." />
  </Box>
)
