import type { FC } from 'react'
// src/build/onboarding/ui/steps/ios-credentials.tsx
//
// Pure presentational step bodies for the iOS credential sub-flow of the
// `build init` onboarding wizard. Each component takes its dynamic values and
// event handlers as typed props (props in → JSX out) and is unit-tested
// against the 16-row frame-fit contract (see test-frame-fit-ios-credentials.mjs
// and components.tsx for the constants). All terminal-size measurement and the
// side-effecting async handlers stay in the parent (app.tsx); these components
// only render and forward callbacks.
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
export interface CredentialsExistStepProps {
  appId: string
  onChange: (value: string) => void
}

export const CredentialsExistStep: FC<CredentialsExistStepProps> = ({ appId, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold color="yellow">
      ⚠ iOS credentials already exist for
      {' '}
      {appId}
    </Text>
    <Text>New certs and profiles will replace your existing credentials.</Text>
    <Newline />
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
export interface SetupMethodSelectStepProps {
  onChange: (value: string) => void | Promise<void>
}

export const SetupMethodSelectStep: FC<SetupMethodSelectStepProps> = ({ onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <Alert variant="info">
      How do you want to set up iOS credentials?
    </Alert>
    <Newline />
    <Select
      options={[
        { label: '🆕  Create new via App Store Connect API', value: 'create' },
        { label: '📥  Import existing from this Mac (Keychain + Xcode profiles)', value: 'import' },
      ]}
      onChange={onChange}
    />
    <Text dimColor>
      Tip: Import reuses Xcode's cert, so it skips Apple's 3-cert limit.
    </Text>
  </Box>
)

// ── api-key-instructions ─────────────────────────────────────────────────────
// `canUseFilePicker` decides which control to show: the picker/manual fork
// (Select) or a direct path input (FilteredTextInput). The submit handler for
// the no-picker path is owned by the parent. Telemetry/file-reads happen there.
export interface ApiKeyInstructionsStepProps {
  canUseFilePicker: boolean
  onMethodChange: (value: string) => void
  onPathSubmit: (value: string) => void | Promise<void>
}

export const ApiKeyInstructionsStep: FC<ApiKeyInstructionsStepProps> = ({
  canUseFilePicker,
  onMethodChange,
  onPathSubmit,
}) => (
  <Box flexDirection="column" marginTop={1}>
    <Alert variant="info">
      Capgo needs an App Store Connect API key to manage certs and profiles.
    </Alert>
    <Box flexDirection="column" marginLeft={2}>
      <Text>
        <Text bold color="white">1.</Text>
        {' '}
        Open
        {' '}
        <Text color="cyan" underline>appstoreconnect.apple.com/access/integrations/api</Text>
      </Text>
      <Text>
        <Text bold color="white">2.</Text>
        {' '}
        <Text bold>Generate API Key</Text>
        {' · name '}
        <Text color="yellow">"Capgo Builder"</Text>
        {' · Access '}
        <Text bold color="green">Admin</Text>
      </Text>
      <Text>
        <Text bold color="white">3.</Text>
        {' '}
        Download the
        {' '}
        <Text bold>.p8</Text>
        {' '}
        file ·
        {' '}
        <Text dimColor>Ctrl+O opens it in your browser</Text>
      </Text>
    </Box>
    <Divider />
    {canUseFilePicker
      ? (
          <>
            <Text bold>How do you want to provide the .p8 file?</Text>
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
        )}
  </Box>
)

// ── p8-method-select ──────────────────────────────────────────────────────────
export const P8MethodSelectStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Opening file picker..." />
  </Box>
)

// ── input-p8-path ──────────────────────────────────────────────────────────────
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
// we prompt for it fresh.
export interface InputKeyIdStepProps {
  keyId: string
  onSubmit: (value: string) => void
}

export const InputKeyIdStep: FC<InputKeyIdStepProps> = ({ keyId, onSubmit }) => (
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
              <Text dimColor> — Enter to confirm, or type another</Text>
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
export interface InputIssuerIdStepProps {
  onSubmit: (value: string) => void
}

export const InputIssuerIdStep: FC<InputIssuerIdStepProps> = ({ onSubmit }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>
      Issuer ID
      {' '}
      <Text dimColor>(UUID at the top of the API keys page)</Text>
      :
    </Text>
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
export interface CertLimitPromptStepProps {
  existingCount: number
  options: SelectOption[]
  onChange: (value: string) => void
}

export const CertLimitPromptStep: FC<CertLimitPromptStepProps> = ({ existingCount, options, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <ErrorLine text={`iOS distribution certificate limit reached (${existingCount} existing).`} />
    <Text bold>Select a certificate to revoke:</Text>
    <Newline />
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
export interface CreatingProfileStepProps {
  appId: string
}

export const CreatingProfileStep: FC<CreatingProfileStepProps> = ({ appId }) => (
  <Box flexDirection="column" marginTop={1}>
    <SuccessLine text="Bundle ID" detail={appId} />
    <Newline />
    <SpinnerLine text="Creating App Store provisioning profile..." />
  </Box>
)

// ── duplicate-profile-prompt ─────────────────────────────────────────────────
export interface DuplicateProfilePromptStepProps {
  duplicateCount: number
  onChange: (value: string) => void
}

export const DuplicateProfilePromptStep: FC<DuplicateProfilePromptStepProps> = ({ duplicateCount, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <ErrorLine text={`Found ${duplicateCount} existing Capgo profile(s) for this app.`} />
    <Text bold>Delete old profiles and create a new one?</Text>
    <Newline />
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
