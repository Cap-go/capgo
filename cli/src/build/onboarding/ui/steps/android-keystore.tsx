// src/build/onboarding/ui/steps/android-keystore.tsx
//
// Pure presentational components for the Android keystore onboarding steps
// (Phase 1). Each component is "props in → JSX out": every dynamic value and
// event handler is an explicit, typed prop. The parent wizard
// (android/ui/app.tsx) owns all state, routing, async work and terminal-size
// measurement; these components never touch `useStdout` / `measureElement`.
//
// The frame-fit contract (see ui/components.tsx + test/helpers/frame-fit.mjs)
// requires every step body to render within BODY_BUDGET_ROWS (13) rows at the
// reference widths. Copy here is kept terse and decorative blank lines are
// dropped so the bodies stay lean at 60 columns where text wraps hardest.
import type { FC } from 'react'
import { Alert, Select } from '@inkjs/ui'
import { Box, Text } from 'ink'
import React from 'react'
import { FilteredTextInput, SpinnerLine } from '../components.js'

// ── keystore-method-select ──────────────────────────────────────────────────

export type KeystoreMethodChoice = 'existing' | 'generate' | 'learn'

export interface KeystoreMethodSelectStepProps {
  onChoose: (choice: KeystoreMethodChoice) => void
}

export const KeystoreMethodSelectStep: FC<KeystoreMethodSelectStepProps> = ({ onChoose }) => (
  <Box flexDirection="column" marginTop={1}>
    <Alert variant="info">
      Android apps must be signed by a keystore. Google Play requires the same one for every update, forever.
    </Alert>
    <Text bold>Do you already have a keystore?</Text>
    <Select
      options={[
        { label: '✅  Yes, I have one', value: 'existing' },
        { label: '🆕  No, create one for me', value: 'generate' },
        { label: 'ℹ️   What is a keystore?', value: 'learn' },
      ]}
      onChange={value => onChoose(value as KeystoreMethodChoice)}
    />
  </Box>
)

// ── keystore-explainer ───────────────────────────────────────────────────────

export interface KeystoreExplainerStepProps {
  onBack: () => void
}

// Condensed from the original Alert + 4 wrapping bullets (which blew the 13-row
// budget at 60 cols). Terse single-line bullets keep every line un-wrapped.
export const KeystoreExplainerStep: FC<KeystoreExplainerStepProps> = ({ onBack }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold color="cyan">A keystore is the signing key for your Android app.</Text>
    <Text>• Google Play uses it to verify each update came from you.</Text>
    <Text>
      • Use the
      {' '}
      <Text bold>same</Text>
      {' '}
      keystore for every release — lose it and you can&apos;t publish.
    </Text>
    <Text>• Never published before? Let us create one for you.</Text>
    <Select options={[{ label: '← Back', value: 'back' }]} onChange={onBack} />
  </Box>
)

// ── keystore-existing-path ───────────────────────────────────────────────────

export interface KeystoreExistingPathStepProps {
  /** When true, render the picker-vs-manual chooser; else the path text input. */
  showChooser: boolean
  onChoosePicker: () => void
  onChooseManual: () => void
  onSubmitPath: (value: string) => void
}

export const KeystoreExistingPathStep: FC<KeystoreExistingPathStepProps> = ({
  showChooser,
  onChoosePicker,
  onChooseManual,
  onSubmitPath,
}) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Existing keystore (.jks, .keystore, or .p12)</Text>
    {showChooser
      ? (
          <>
            <Text>How do you want to provide it?</Text>
            <Select
              options={[
                { label: '📂  Open file picker', value: 'picker' },
                { label: '📝  Type the path', value: 'manual' },
              ]}
              onChange={(value) => {
                if (value === 'picker')
                  onChoosePicker()
                else
                  onChooseManual()
              }}
            />
          </>
        )
      : (
          <>
            <Text dimColor>Tip: drag a file into this window to paste its path.</Text>
            <FilteredTextInput
              placeholder="/path/to/release.jks"
              filter=""
              onSubmit={onSubmitPath}
            />
          </>
        )}
  </Box>
)

// ── keystore-existing-picker ─────────────────────────────────────────────────

export const KeystoreExistingPickerStep: FC = () => (
  <Box marginTop={1}><SpinnerLine text="Waiting for file selection..." /></Box>
)

// ── keystore-existing-store-password ─────────────────────────────────────────

export interface KeystoreExistingStorePasswordStepProps {
  onSubmit: (value: string) => void
}

export const KeystoreExistingStorePasswordStep: FC<KeystoreExistingStorePasswordStepProps> = ({ onSubmit }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Store password:</Text>
    <Text dimColor>We&apos;ll use this to unlock the keystore and auto-detect the alias.</Text>
    <FilteredTextInput placeholder="(hidden)" filter="" mask onSubmit={onSubmit} />
  </Box>
)

// ── keystore-existing-detecting-alias ────────────────────────────────────────

export const KeystoreExistingDetectingAliasStep: FC = () => (
  <Box marginTop={1}><SpinnerLine text="Unlocking keystore and reading aliases..." /></Box>
)

// ── keystore-existing-alias-select ───────────────────────────────────────────

export interface KeystoreExistingAliasSelectStepProps {
  aliases: string[]
  onSelect: (alias: string) => void
}

// `Select` only ever renders `visibleOptionCount` rows (it scrolls the rest),
// so a long alias list can't blow the row budget. We cap visibility low and add
// a "+N more" hint so the user knows the list scrolls, keeping the interactive
// control and instruction always on screen.
const ALIAS_VISIBLE_COUNT = 4

export const KeystoreExistingAliasSelectStep: FC<KeystoreExistingAliasSelectStepProps> = ({ aliases, onSelect }) => {
  const hidden = Math.max(0, aliases.length - ALIAS_VISIBLE_COUNT)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Multiple aliases found. Which one does this app use?</Text>
      <Select
        visibleOptionCount={ALIAS_VISIBLE_COUNT}
        options={aliases.map(a => ({ label: a, value: a }))}
        onChange={onSelect}
      />
      {hidden > 0 && (
        <Text dimColor>
          {`… +${hidden} more (↑/↓ to scroll)`}
        </Text>
      )}
    </Box>
  )
}

// ── keystore-existing-alias ──────────────────────────────────────────────────

export interface KeystoreExistingAliasStepProps {
  onSubmit: (value: string) => void
}

export const KeystoreExistingAliasStep: FC<KeystoreExistingAliasStepProps> = ({ onSubmit }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Key alias:</Text>
    <Text dimColor>We couldn&apos;t auto-detect it — please enter it manually.</Text>
    <FilteredTextInput placeholder="release" filter="" onSubmit={onSubmit} />
  </Box>
)

// ── keystore-existing-key-password ───────────────────────────────────────────

export interface KeystoreExistingKeyPasswordStepProps {
  /** `probing` shows a spinner while we auto-detect; `prompt` asks the user. */
  mode: 'probing' | 'prompt'
  onSubmit: (value: string) => void
}

export const KeystoreExistingKeyPasswordStep: FC<KeystoreExistingKeyPasswordStepProps> = ({ mode, onSubmit }) => {
  if (mode === 'probing') {
    return (
      <Box marginTop={1}>
        <SpinnerLine text="Checking if the key uses the same password as the store..." />
      </Box>
    )
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Key password (Enter to reuse the store password):</Text>
      <FilteredTextInput placeholder="(hidden — same as store)" filter="" mask onSubmit={onSubmit} />
    </Box>
  )
}

// ── keystore-new-alias ───────────────────────────────────────────────────────

export interface KeystoreNewAliasStepProps {
  onSubmit: (value: string) => void
}

export const KeystoreNewAliasStep: FC<KeystoreNewAliasStepProps> = ({ onSubmit }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Key alias (press Enter for "release"):</Text>
    <FilteredTextInput placeholder="release" filter="" onSubmit={onSubmit} />
  </Box>
)

// ── keystore-new-password-method ─────────────────────────────────────────────

export type KeystorePasswordMethodChoice = 'random' | 'manual'

export interface KeystoreNewPasswordMethodStepProps {
  onChoose: (choice: KeystorePasswordMethodChoice) => void
}

export const KeystoreNewPasswordMethodStep: FC<KeystoreNewPasswordMethodStepProps> = ({ onChoose }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>How would you like to set the keystore password?</Text>
    <Select
      options={[
        { label: '🔐  Generate a strong random password (recommended)', value: 'random' },
        { label: '✍️   I\'ll set my own', value: 'manual' },
      ]}
      onChange={value => onChoose(value as KeystorePasswordMethodChoice)}
    />
  </Box>
)

// ── keystore-new-store-password ──────────────────────────────────────────────

export interface KeystoreNewStorePasswordStepProps {
  onSubmit: (value: string) => void
}

export const KeystoreNewStorePasswordStep: FC<KeystoreNewStorePasswordStepProps> = ({ onSubmit }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Store password:</Text>
    <FilteredTextInput placeholder="(hidden, minimum 6 characters)" filter="" mask onSubmit={onSubmit} />
  </Box>
)

// ── keystore-new-key-password ────────────────────────────────────────────────

export interface KeystoreNewKeyPasswordStepProps {
  onSubmit: (value: string) => void
}

export const KeystoreNewKeyPasswordStep: FC<KeystoreNewKeyPasswordStepProps> = ({ onSubmit }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Key password (press Enter to match store password):</Text>
    <FilteredTextInput placeholder="(hidden — same as store)" filter="" mask onSubmit={onSubmit} />
  </Box>
)

// ── keystore-new-cn ──────────────────────────────────────────────────────────

export interface KeystoreNewCommonNameStepProps {
  /** Placeholder shown for the default (the app id). */
  appId: string
  onSubmit: (value: string) => void
}

export const KeystoreNewCommonNameStep: FC<KeystoreNewCommonNameStepProps> = ({ appId, onSubmit }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Common Name for the certificate (Enter to use app ID):</Text>
    <Text dimColor>Google Play doesn&apos;t display this — default is safe.</Text>
    <FilteredTextInput placeholder={appId} filter="" onSubmit={onSubmit} />
  </Box>
)

// ── keystore-generating ──────────────────────────────────────────────────────

export const KeystoreGeneratingStep: FC = () => (
  <Box marginTop={1}><SpinnerLine text="Generating 2048-bit RSA keystore..." /></Box>
)
