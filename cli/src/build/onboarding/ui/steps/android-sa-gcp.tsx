// src/build/onboarding/ui/steps/android-sa-gcp.tsx
//
// Pure presentational step bodies for the Android service-account / Google
// sign-in / GCP project / Play-developer sub-flow of the `build init`
// onboarding wizard (Phase 2–5 of android/ui/app.tsx). Each component is
// "props in → JSX out": every dynamic value and event handler is an explicit,
// typed prop. The parent wizard owns all state, routing, async work, telemetry
// and terminal-size measurement; these components never touch
// `useStdout` / `measureElement`. `useInput` inside the shared FilteredTextInput
// widget is fine — that's a leaf control, not layout measurement.
//
// The frame-fit contract (see ui/components.tsx + test/helpers/frame-fit.mjs)
// requires every step body to render within BODY_BUDGET_ROWS (13) rows at the
// reference widths (80 and 60 cols). Copy here is deliberately terse and
// decorative blank lines are dropped so the bodies stay lean at 60 columns
// where text wraps hardest — but the interactive control and its key
// instruction always stay on screen. List steps cap visibility via Select's
// `visibleOptionCount` and add a "+N more (↑/↓)" hint so a long list can never
// blow the budget.
import type { FC } from 'react'
import { Alert, Select } from '@inkjs/ui'
import { Box, Text } from 'ink'
import React from 'react'
import { FilteredTextInput, SpinnerLine } from '../components.js'

// A single Select option. Mirrors the shape @inkjs/ui's Select expects so the
// parent can build dynamic option lists and pass them straight through.
export interface SelectOption {
  label: string
  value: string
}

// Capped visible rows for the scrollable list steps. Kept low so the bold
// header + Select window + "+N more" hint always fit the 13-row budget even at
// 60 cols where the explanatory copy above wraps.
const LIST_VISIBLE_COUNT = 4

// ── service-account-method-select ────────────────────────────────────────────

export type ServiceAccountMethodChoice = 'existing' | 'generate'

export interface ServiceAccountMethodSelectStepProps {
  onChoose: (choice: ServiceAccountMethodChoice) => void
}

export const ServiceAccountMethodSelectStep: FC<ServiceAccountMethodSelectStepProps> = ({ onChoose }) => (
  <Box flexDirection="column" marginTop={1}>
    <Alert variant="info">
      Capgo needs a Google Play service account JSON to upload AABs. Bring your own, or let Capgo set one up via Google.
    </Alert>
    <Text bold>Do you already have a service account JSON?</Text>
    <Select
      options={[
        { label: '🔐  No, set one up for me via Google', value: 'generate' },
        { label: '✅  Yes, I have my service account JSON file', value: 'existing' },
      ]}
      onChange={value => onChoose(value as ServiceAccountMethodChoice)}
    />
  </Box>
)

// ── sa-json-existing-path ─────────────────────────────────────────────────────
// `showChooser` is true when the runtime supports a native file picker AND the
// user hasn't yet switched to manual entry; it renders the picker-vs-manual
// fork. Otherwise the direct path text input is shown. The submit/route
// handlers stay in the parent (it owns path validation + transitions).

export interface SaJsonExistingPathStepProps {
  showChooser: boolean
  onChoosePicker: () => void
  onChooseManual: () => void
  onSubmitPath: (value: string) => void
}

export const SaJsonExistingPathStep: FC<SaJsonExistingPathStepProps> = ({
  showChooser,
  onChoosePicker,
  onChooseManual,
  onSubmitPath,
}) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Existing service account JSON (.json)</Text>
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
              placeholder="/path/to/service-account.json"
              filter=""
              onSubmit={onSubmitPath}
            />
          </>
        )}
  </Box>
)

// ── sa-json-existing-picker (spinner) ─────────────────────────────────────────

export const SaJsonExistingPickerStep: FC = () => (
  <Box marginTop={1}><SpinnerLine text="Opening file picker..." /></Box>
)

// ── sa-json-validating (spinner) ──────────────────────────────────────────────

export const SaJsonValidatingStep: FC = () => (
  <Box marginTop={1}>
    <SpinnerLine text="Validating service account against Google Play..." />
  </Box>
)

// ── sa-json-validation-failed ─────────────────────────────────────────────────
// `message` is the backend/validation failure detail (can be long — e.g. a
// no-app-access explanation). The original Alert + indented message + bold +
// several <Newline/>s + Select(3) overflowed at 60 cols, so the blank lines are
// dropped: the failure is conveyed by a single red ✖ line above the choices,
// and the Select keeps its window capped so a long message can't push the
// control off-screen.

export interface SaJsonValidationFailedStepProps {
  message: string
  onChoose: (choice: 'retry' | 'save-anyway' | 'oauth') => void
}

export const SaJsonValidationFailedStep: FC<SaJsonValidationFailedStepProps> = ({ message, onChoose }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text color="yellow" bold>⚠  Service account validation failed</Text>
    <Text color="red">{message}</Text>
    <Select
      visibleOptionCount={3}
      options={[
        { label: '🔄  Try a different service account file', value: 'retry' },
        { label: '💾  Save credentials anyway (skip validation)', value: 'save-anyway' },
        { label: '🆕  Set up a new service account via Google', value: 'oauth' },
      ]}
      onChange={value => onChoose(value as 'retry' | 'save-anyway' | 'oauth')}
    />
  </Box>
)

// ── google-sign-in (pre-consent) ──────────────────────────────────────────────

export type GoogleSignInChoice = 'go' | 'learn' | 'exit'

export interface GoogleSignInStepProps {
  onChoose: (choice: GoogleSignInChoice) => void
}

// Condensed from the original Alert + intro line + two wrapping bullets +
// blank lines + Select(3), which blew the budget at 60 cols. The two access
// scopes are folded into terse single-line bullets and the decorative
// <Newline/>s are dropped; the Select and its scope context stay visible.
export const GoogleSignInStep: FC<GoogleSignInStepProps> = ({ onChoose }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold color="cyan">Sign in with Google to set up Play publishing.</Text>
    <Text dimColor>Tokens stay on your machine — Capgo&apos;s servers never see them.</Text>
    <Text>
      •
      {' '}
      <Text bold>Cloud</Text>
      : create a service account in a project you pick.
    </Text>
    <Text>
      •
      {' '}
      <Text bold>Play</Text>
      : invite it with release-only access.
    </Text>
    <Select
      options={[
        { label: '🔐  Continue to Google sign-in', value: 'go' },
        { label: 'ℹ️   Why is this secure?', value: 'learn' },
        { label: '✖  Exit (I\'ll do it later)', value: 'exit' },
      ]}
      onChange={value => onChoose(value as GoogleSignInChoice)}
    />
  </Box>
)

// ── google-sign-in (learn-more) ───────────────────────────────────────────────
// The original long-form Q&A (4 question/answer pairs, each a wrapping
// paragraph + blank lines) was far over budget. Condensed to four terse
// single-line reassurances so the whole trust explainer + the Back control fit;
// the deep detail lives in the docs/source, which the last line points to.

export interface GoogleSignInLearnMoreStepProps {
  onBack: () => void
}

export const GoogleSignInLearnMoreStep: FC<GoogleSignInLearnMoreStepProps> = ({ onBack }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold color="cyan">What Capgo can and can&apos;t do:</Text>
    <Text>• Touches only the one project you pick — one SA, then stops.</Text>
    <Text>• Invites that SA into one app with release-only access.</Text>
    <Text>• Refresh token never leaves your machine; it&apos;s revoked after.</Text>
    <Text>
      • Revoke anytime at
      {' '}
      <Text color="cyan">myaccount.google.com/permissions</Text>
      .
    </Text>
    <Text dimColor>Google-verified 2026-05-02 · source: github.com/Cap-go/capgo</Text>
    <Select options={[{ label: '← Back to sign-in', value: 'back' }]} onChange={onBack} />
  </Box>
)

// ── google-sign-in-running (spinner + optional status stream) ─────────────────
// `statusMessages` is a live stream of OAuth progress lines. The spinner stays
// pinned at the top; only the last few status lines are shown so a long stream
// can't push past the budget.

const OAUTH_STATUS_TAIL = 4

export interface GoogleSignInRunningStepProps {
  statusMessages: string[]
}

export const GoogleSignInRunningStep: FC<GoogleSignInRunningStepProps> = ({ statusMessages }) => {
  const tail = statusMessages.slice(-OAUTH_STATUS_TAIL)
  return (
    <Box flexDirection="column" marginTop={1}>
      <SpinnerLine text="Waiting for Google sign-in..." />
      {tail.length > 0 && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          {tail.map((msg, i) => (<Text key={`oauth-status-${i}`} dimColor>{msg}</Text>))}
        </Box>
      )}
    </Box>
  )
}

// ── play-developer-id-input (actions) ─────────────────────────────────────────
// `playDeveloperUrl` is the Play Console URL prefix shown as the example. The
// original Alert + several explainer paragraphs + the URL example + Select(3)
// overflowed badly; the explanation is compressed to two terse lines that still
// tell the user what the ID is and where to find it.

export type PlayDevIdActionChoice = 'open' | 'tutorial' | 'manual'

export interface PlayDeveloperIdActionsStepProps {
  playDeveloperUrl: string
  onChoose: (choice: PlayDevIdActionChoice) => void
}

export const PlayDeveloperIdActionsStep: FC<PlayDeveloperIdActionsStepProps> = ({ playDeveloperUrl, onChoose }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold color="cyan">We need your Play Console Developer account ID.</Text>
    <Text dimColor>The numeric ID we invite the service account into so builds can publish.</Text>
    <Text>
      Find it in the Play Console URL:
      {' '}
      <Text dimColor>{playDeveloperUrl}</Text>
      <Text bold color="cyan">1234567890123456789</Text>
    </Text>
    <Select
      options={[
        { label: '🌐  Open Play Console in my browser', value: 'open' },
        { label: '🎬  Watch a quick video tutorial', value: 'tutorial' },
        { label: '📝  I have my developer ID — let me paste it', value: 'manual' },
      ]}
      onChange={value => onChoose(value as PlayDevIdActionChoice)}
    />
  </Box>
)

// ── play-developer-id-input (input) ───────────────────────────────────────────

export interface PlayDeveloperIdInputStepProps {
  onSubmit: (value: string) => void
}

export const PlayDeveloperIdInputStep: FC<PlayDeveloperIdInputStepProps> = ({ onSubmit }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Paste the Play Console URL, or just the developer ID:</Text>
    <Text dimColor>Either the whole address-bar value or the 16–20 digit number works.</Text>
    <FilteredTextInput
      placeholder="https://play.google.com/console/u/0/developers/…"
      filter=""
      onSubmit={onSubmit}
    />
  </Box>
)

// ── gcp-projects-loading (spinner) ────────────────────────────────────────────

export const GcpProjectsLoadingStep: FC = () => (
  <Box marginTop={1}><SpinnerLine text="Loading your Google Cloud projects..." /></Box>
)

// ── gcp-projects-select ───────────────────────────────────────────────────────
// The parent builds the option list (a "Create a new project" row prepended to
// one row per existing GCP project) and owns the route handler. Visibility is
// capped so a user with many projects can't blow the budget; a "+N more" hint
// signals the list scrolls.

export interface GcpProjectsSelectStepProps {
  options: SelectOption[]
  onChange: (value: string) => void
}

export const GcpProjectsSelectStep: FC<GcpProjectsSelectStepProps> = ({ options, onChange }) => {
  const hidden = Math.max(0, options.length - LIST_VISIBLE_COUNT)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Which Google Cloud project should host the service account?</Text>
      <Text dimColor>We&apos;ll create a `capgo-native-build` service account in it.</Text>
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

// ── gcp-project-create-name ───────────────────────────────────────────────────

export interface GcpProjectCreateNameStepProps {
  /** Placeholder shown for the default project display name. */
  defaultDisplayName: string
  onSubmit: (value: string) => void
}

export const GcpProjectCreateNameStep: FC<GcpProjectCreateNameStepProps> = ({ defaultDisplayName, onSubmit }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Name for the new Google Cloud project:</Text>
    <Text dimColor>≤30 chars. The project ID is auto-generated from your app ID + a random suffix.</Text>
    <FilteredTextInput
      placeholder={defaultDisplayName}
      filter=""
      onSubmit={onSubmit}
    />
  </Box>
)

// ── android-package-select ────────────────────────────────────────────────────
// `showChooser` is true when Gradle-detected package IDs exist AND the user
// hasn't switched to manual entry; it renders the detected-list fork (capped +
// "+N more" hint). Otherwise the manual package-name input is shown. The
// detected options (one row per id + a "type a different name" row) are built
// by the parent. Copy is compressed: the original verbose applicationId-vs-JS-
// appId paragraph wrapped to many rows at 60 cols and pushed the list off the
// budget.

export interface AndroidPackageSelectStepProps {
  showChooser: boolean
  detectedOptions: SelectOption[]
  detectedCount: number
  onChooseDetected: (value: string) => void
  onSubmitManual: (value: string) => void
}

export const AndroidPackageSelectStep: FC<AndroidPackageSelectStepProps> = ({
  showChooser,
  detectedOptions,
  detectedCount,
  onChooseDetected,
  onSubmitManual,
}) => {
  const hidden = Math.max(0, detectedOptions.length - LIST_VISIBLE_COUNT)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">Which Android package should Capgo release?</Text>
      <Text dimColor>
        Must match the
        {' '}
        <Text bold>applicationId</Text>
        {' '}
        in app/build.gradle (not the JS appId).
      </Text>
      {showChooser
        ? (
            <>
              <Text>
                {`Found ${detectedCount} in Gradle. Pick one, or type a different package:`}
              </Text>
              <Select
                visibleOptionCount={LIST_VISIBLE_COUNT}
                options={detectedOptions}
                onChange={onChooseDetected}
              />
              {hidden > 0 && (
                <Text dimColor>{`… +${hidden} more (↑/↓ to scroll)`}</Text>
              )}
            </>
          )
        : (
            <>
              <Text bold>Android package name:</Text>
              <FilteredTextInput
                placeholder="com.example.app"
                filter=""
                onSubmit={onSubmitManual}
              />
            </>
          )}
    </Box>
  )
}

// ── gcp-setup-running (spinner + optional status stream) ──────────────────────
// `statusMessages` is the live provisioning progress stream. Only the last few
// lines are shown so a long stream can't push the spinner / frame past budget.

const SETUP_STATUS_TAIL = 4

export interface GcpSetupRunningStepProps {
  statusMessages: string[]
}

export const GcpSetupRunningStep: FC<GcpSetupRunningStepProps> = ({ statusMessages }) => {
  const tail = statusMessages.slice(-SETUP_STATUS_TAIL)
  return (
    <Box flexDirection="column" marginTop={1}>
      <SpinnerLine text="Provisioning Google Cloud + Play Console..." />
      {tail.length > 0 && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          {tail.map((msg, i) => (<Text key={`setup-status-${i}`} dimColor>{msg}</Text>))}
        </Box>
      )}
    </Box>
  )
}
