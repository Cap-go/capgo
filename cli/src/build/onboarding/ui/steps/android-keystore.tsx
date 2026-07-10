// src/build/onboarding/ui/steps/android-keystore.tsx
//
// Pure presentational components for the Android keystore onboarding steps
// (Phase 1). Each component is "props in → JSX out": every dynamic value and
// event handler is an explicit, typed prop. The parent wizard
// (android/ui/app.tsx) owns all state, routing, async work and terminal-size
// measurement; these components never touch `useStdout` / `measureElement`.
//
// Adaptive spacing — each body renders its COMFORTABLE form by default (the
// original design: bordered Alert banners where applicable + decorative
// <Newline/> blank-line spacing + full multi-line copy + un-capped lists). The
// 16-row frame contract (see ui/components.tsx + test/helpers/frame-fit.mjs) is
// a FLOOR we must survive on short terminals, not a cap on every terminal: when
// the parent measures that the comfortable body can't fit the viewport it flips
// the sticky `dense` signal and threads `dense={true}` here, collapsing each
// body to the terse, budget-fitting form (blank lines dropped, banners reduced
// to single-line copy, the alias list capped via `Select visibleOptionCount`
// with a "+N more" hint). `dense` defaults to `false` so a component rendered
// without the prop (e.g. a test asserting the comfortable form) gets the
// original look. All props/handlers/behaviour are identical across both modes.
import type { FC } from 'react'
import { Alert, Select } from '@inkjs/ui'
import { Box, Newline, Text } from 'ink'
import React from 'react'
import { FilteredTextInput, SpinnerLine } from '../components.js'

// ── keystore-method-select ──────────────────────────────────────────────────

export type KeystoreMethodChoice = 'existing' | 'generate' | 'learn'

export interface KeystoreMethodSelectStepProps {
  onChoose: (choice: KeystoreMethodChoice) => void
  dense?: boolean
}

// Comfortable: the info Alert (full copy), a <Newline/>, the bold question,
// another <Newline/>, then the Select. Dense: the blank lines are dropped and
// the Alert copy trimmed so the prompt + three choices stay within budget.
export const KeystoreMethodSelectStep: FC<KeystoreMethodSelectStepProps> = ({ onChoose, dense = false }) => (
  <Box flexDirection="column" marginTop={1}>
    <Alert variant="info">
      {dense
        ? 'Android apps must be signed by a keystore. Google Play requires the same one for every update, forever.'
        : 'Android apps must be signed by a keystore. Google Play requires the same keystore for every update, forever.'}
    </Alert>
    {!dense && <Newline />}
    <Text bold>Do you already have a keystore?</Text>
    {!dense && <Newline />}
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
  dense?: boolean
}

// Comfortable: the original info Alert + a <Newline/> + four indented,
// full-sentence bullets in a marginLeft box + a <Newline/> + the Back control.
// Dense: the Alert/box/blank-lines are dropped in favour of terse single-line
// bullets so every line stays un-wrapped within the 13-row budget at 60 cols
// (the original wrapping bullets blew the budget there).
export const KeystoreExplainerStep: FC<KeystoreExplainerStepProps> = ({ onBack }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Alert variant="info">
        A keystore is a file that holds a cryptographic key used to sign your Android app.
      </Alert>
      <Newline />
      <Box flexDirection="column" marginLeft={2}>
        <Text>• Google Play uses the key to verify that every update really came from you.</Text>
        <Text>
          • You must use the
          {' '}
          <Text bold>same</Text>
          {' '}
          keystore for every release of this app.
        </Text>
        <Text>• If you lose it, you lose the ability to publish updates.</Text>
        <Text>• If you&apos;ve never published this app before, let us create one for you.</Text>
      </Box>
      <Newline />
      <Select options={[{ label: '← Back', value: 'back' }]} onChange={onBack} />
    </Box>
  )
}

// ── keystore-existing-path ───────────────────────────────────────────────────

export interface KeystoreExistingPathStepProps {
  /** When true, render the picker-vs-manual chooser; else the path text input. */
  showChooser: boolean
  onChoosePicker: () => void
  onChooseManual: () => void
  onSubmitPath: (value: string) => void
  dense?: boolean
}

// Comfortable: the bold title + a <Newline/>, then either the chooser prompt +
// a <Newline/> + the Select, or the drag-and-drop tip + a <Newline/> + the path
// input. Dense: the blank lines are dropped so the title + prompt + control sit
// together within budget.
export const KeystoreExistingPathStep: FC<KeystoreExistingPathStepProps> = ({
  showChooser,
  onChoosePicker,
  onChooseManual,
  onSubmitPath,
  dense = false,
}) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Existing keystore (.jks, .keystore, or .p12)</Text>
    {!dense && <Newline />}
    {showChooser
      ? (
          <>
            <Text>How do you want to provide it?</Text>
            {!dense && <Newline />}
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
            {!dense && <Newline />}
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
  dense?: boolean
}

// Comfortable: bold label, the dim helper line, a <Newline/>, then the masked
// input (the original look). Dense: the blank line is dropped.
export const KeystoreExistingStorePasswordStep: FC<KeystoreExistingStorePasswordStepProps> = ({ onSubmit, dense = false }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Store password:</Text>
    <Text dimColor>We&apos;ll use this to unlock the keystore and auto-detect the alias.</Text>
    {!dense && <Newline />}
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
  dense?: boolean
}

// The original full heading + a <Newline/> + an UN-capped Select (shows every
// alias — the parent only renders this after measuring it fits the viewport).
export const KeystoreExistingAliasSelectStep: FC<KeystoreExistingAliasSelectStepProps> = ({ aliases, onSelect }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Multiple aliases in the keystore. Which one do you use for this app?</Text>
      <Newline />
      <Select
        options={aliases.map(a => ({ label: a, value: a }))}
        onChange={onSelect}
      />
    </Box>
  )
}

// ── keystore-existing-alias ──────────────────────────────────────────────────

export interface KeystoreExistingAliasStepProps {
  onSubmit: (value: string) => void
  dense?: boolean
}

// Comfortable: bold label, dim helper line, a <Newline/>, then the input.
// Dense: the blank line is dropped.
export const KeystoreExistingAliasStep: FC<KeystoreExistingAliasStepProps> = ({ onSubmit, dense = false }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Key alias:</Text>
    <Text dimColor>We couldn&apos;t auto-detect it — please enter it manually.</Text>
    {!dense && <Newline />}
    <FilteredTextInput placeholder="release" filter="" onSubmit={onSubmit} />
  </Box>
)

// ── keystore-existing-key-password ───────────────────────────────────────────

export interface KeystoreExistingKeyPasswordStepProps {
  /** `probing` shows a spinner while we auto-detect; `prompt` asks the user. */
  mode: 'probing' | 'prompt'
  onSubmit: (value: string) => void
  dense?: boolean
}

// `probing` is a single spinner line — identical comfortable / dense. The
// `prompt` form is comfortable (full label + a <Newline/> + the masked input)
// by default and collapses the blank line + trims the label in dense mode.
export const KeystoreExistingKeyPasswordStep: FC<KeystoreExistingKeyPasswordStepProps> = ({ mode, onSubmit, dense = false }) => {
  if (mode === 'probing') {
    return (
      <Box marginTop={1}>
        <SpinnerLine text="Checking if the key uses the same password as the store..." />
      </Box>
    )
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>
        {dense
          ? 'Key password (Enter to reuse the store password):'
          : 'Key password (press Enter to use the same as store password):'}
      </Text>
      {!dense && <Newline />}
      <FilteredTextInput placeholder="(hidden — same as store)" filter="" mask onSubmit={onSubmit} />
    </Box>
  )
}

// ── keystore-new-alias ───────────────────────────────────────────────────────

export interface KeystoreNewAliasStepProps {
  onSubmit: (value: string) => void
  dense?: boolean
}

// Comfortable: bold label + a <Newline/> + the input. Dense: the blank line is
// dropped.
export const KeystoreNewAliasStep: FC<KeystoreNewAliasStepProps> = ({ onSubmit, dense = false }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Key alias (press Enter for "release"):</Text>
    {!dense && <Newline />}
    <FilteredTextInput placeholder="release" filter="" onSubmit={onSubmit} />
  </Box>
)

// ── keystore-new-password-method ─────────────────────────────────────────────

export type KeystorePasswordMethodChoice = 'random' | 'manual'

export interface KeystoreNewPasswordMethodStepProps {
  onChoose: (choice: KeystorePasswordMethodChoice) => void
  dense?: boolean
}

// Comfortable: bold question + a <Newline/> + the Select. Dense: the blank line
// is dropped.
export const KeystoreNewPasswordMethodStep: FC<KeystoreNewPasswordMethodStepProps> = ({ onChoose, dense = false }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>How would you like to set the keystore password?</Text>
    {!dense && <Newline />}
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
  dense?: boolean
}

// Comfortable: bold label + a <Newline/> + the masked input. Dense: the blank
// line is dropped.
export const KeystoreNewStorePasswordStep: FC<KeystoreNewStorePasswordStepProps> = ({ onSubmit, dense = false }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Store password:</Text>
    {!dense && <Newline />}
    <FilteredTextInput placeholder="(hidden, minimum 6 characters)" filter="" mask onSubmit={onSubmit} />
  </Box>
)

// ── keystore-new-key-password ────────────────────────────────────────────────

export interface KeystoreNewKeyPasswordStepProps {
  onSubmit: (value: string) => void
  dense?: boolean
}

// Comfortable: bold label + a <Newline/> + the masked input. Dense: the blank
// line is dropped.
export const KeystoreNewKeyPasswordStep: FC<KeystoreNewKeyPasswordStepProps> = ({ onSubmit, dense = false }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Key password (press Enter to match store password):</Text>
    {!dense && <Newline />}
    <FilteredTextInput placeholder="(hidden — same as store)" filter="" mask onSubmit={onSubmit} />
  </Box>
)

// ── keystore-new-cn ──────────────────────────────────────────────────────────

export interface KeystoreNewCommonNameStepProps {
  /** Placeholder shown for the default (the app id). */
  appId: string
  onSubmit: (value: string) => void
  dense?: boolean
}

// Comfortable: the full label + the dim helper line + a <Newline/> + the input.
// Dense: the blank line is dropped and the label trimmed.
export const KeystoreNewCommonNameStep: FC<KeystoreNewCommonNameStepProps> = ({ appId, onSubmit, dense = false }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>
      {dense
        ? 'Common Name for the certificate (Enter to use app ID):'
        : 'Common Name for the certificate (press Enter to use app ID):'}
    </Text>
    <Text dimColor>Google Play doesn&apos;t display this — default is safe.</Text>
    {!dense && <Newline />}
    <FilteredTextInput placeholder={appId} filter="" onSubmit={onSubmit} />
  </Box>
)

// ── keystore-generating ──────────────────────────────────────────────────────

export const KeystoreGeneratingStep: FC = () => (
  <Box marginTop={1}><SpinnerLine text="Generating 2048-bit RSA keystore..." /></Box>
)
