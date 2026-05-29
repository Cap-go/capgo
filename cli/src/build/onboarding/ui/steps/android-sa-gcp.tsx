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
// Adaptive spacing — each body renders its COMFORTABLE form by default (the
// original design: bordered Alert banners where applicable + decorative
// <Newline/> blank-line spacing + full multi-line copy + un-capped lists). The
// 16-row frame contract (see ui/components.tsx + test/helpers/frame-fit.mjs) is
// a FLOOR we must survive on short terminals, not a cap on every terminal: when
// the parent measures that the comfortable body can't fit the viewport it flips
// the sticky `dense` signal and threads `dense={true}` here, collapsing each
// body to the terse, budget-fitting form (blank lines dropped, banners reduced
// to single-line copy, the full project/package lists capped via Select's
// `visibleOptionCount` with a "+N more" hint, and the variable-length live
// status streams tailed to the last few lines). `dense` defaults to `false` so
// a component rendered without the prop (e.g. a test asserting the comfortable
// form) gets the original look. All props/handlers/behaviour are identical
// across both modes.
import type { FC } from 'react'
import { Alert, Select } from '@inkjs/ui'
import { Box, Newline, Text } from 'ink'
import React from 'react'
import { FilteredTextInput, SpinnerLine } from '../components.js'

// A single Select option. Mirrors the shape @inkjs/ui's Select expects so the
// parent can build dynamic option lists and pass them straight through.
export interface SelectOption {
  label: string
  value: string
}

// Capped visible rows for the scrollable list steps in DENSE mode. Kept low so
// the bold header + Select window + "+N more" hint always fit the 13-row budget
// even at 60 cols where the explanatory copy above wraps. In the comfortable
// form the lists are un-capped (the parent only renders that form after
// measuring it fits the viewport).
const LIST_VISIBLE_COUNT = 4

// How many trailing lines of a live status stream to show in DENSE mode. The
// comfortable form prints the whole stream; the dense form tails it so a long
// stream can never push the spinner / frame past budget.
const STATUS_TAIL = 4

// ── service-account-method-select ────────────────────────────────────────────

export type ServiceAccountMethodChoice = 'existing' | 'generate'

export interface ServiceAccountMethodSelectStepProps {
  onChoose: (choice: ServiceAccountMethodChoice) => void
  dense?: boolean
}

// Comfortable: the info Alert (full copy), a <Newline/>, the bold question,
// another <Newline/>, then the Select. Dense: the blank lines are dropped and
// the Alert copy trimmed so the prompt + two choices stay within budget.
export const ServiceAccountMethodSelectStep: FC<ServiceAccountMethodSelectStepProps> = ({ onChoose, dense = false }) => (
  <Box flexDirection="column" marginTop={1}>
    <Alert variant="info">
      {dense
        ? 'Capgo needs a Google Play service account JSON to upload AABs. Bring your own, or let Capgo set one up via Google.'
        : 'Capgo needs a Google Play service account JSON to upload AABs on your behalf. You can bring your own or let Capgo set one up via Google sign-in.'}
    </Alert>
    {!dense && <Newline />}
    <Text bold>Do you already have a service account JSON?</Text>
    {!dense && <Newline />}
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
  dense?: boolean
}

// Comfortable: the bold title + a <Newline/>, then either the chooser prompt +
// a <Newline/> + the Select, or the drag-and-drop tip + a <Newline/> + the path
// input. Dense: the blank lines are dropped so the title + prompt + control sit
// together within budget.
export const SaJsonExistingPathStep: FC<SaJsonExistingPathStepProps> = ({
  showChooser,
  onChoosePicker,
  onChooseManual,
  onSubmitPath,
  dense = false,
}) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Existing service account JSON (.json)</Text>
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
              placeholder="/path/to/service-account.json"
              filter=""
              onSubmit={onSubmitPath}
            />
          </>
        )}
  </Box>
)

// ── sa-json-existing-picker (spinner) ─────────────────────────────────────────
// Single spinner line — identical comfortable / dense (no spacing to collapse).

export const SaJsonExistingPickerStep: FC = () => (
  <Box marginTop={1}><SpinnerLine text="Opening file picker..." /></Box>
)

// ── sa-json-validating (spinner) ──────────────────────────────────────────────
// Single spinner line — identical comfortable / dense.

export const SaJsonValidatingStep: FC = () => (
  <Box marginTop={1}>
    <SpinnerLine text="Validating service account against Google Play..." />
  </Box>
)

// ── sa-json-validation-failed ─────────────────────────────────────────────────
// `message` is the backend/validation failure detail (can be long — e.g. a
// no-app-access explanation). Comfortable: the original warning Alert + the
// indented full message + a <Newline/> + the bold "What would you like to do?"
// prompt + a <Newline/> + the un-capped Select(3) (the original look — rendered
// only after the parent measured it fits). Dense: the Alert / blank lines are
// dropped — the failure is conveyed by a single red ✖-style line above the
// choices — and the Select keeps its window capped so a long message can't push
// the control off-screen.

export interface SaJsonValidationFailedStepProps {
  message: string
  onChoose: (choice: 'retry' | 'save-anyway' | 'oauth') => void
  dense?: boolean
}

export const SaJsonValidationFailedStep: FC<SaJsonValidationFailedStepProps> = ({ message, onChoose, dense = false }) => {
  const options = [
    { label: '🔄  Try a different service account file', value: 'retry' },
    { label: '💾  Save credentials anyway (skip validation)', value: 'save-anyway' },
    { label: '🆕  Set up a new service account via Google', value: 'oauth' },
  ]
  if (!dense) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Alert variant="warning">
          Service account validation failed.
        </Alert>
        <Newline />
        <Box flexDirection="column" marginLeft={2}>
          <Text color="red">{message}</Text>
        </Box>
        <Newline />
        <Text bold>What would you like to do?</Text>
        <Newline />
        <Select
          options={options}
          onChange={value => onChoose(value as 'retry' | 'save-anyway' | 'oauth')}
        />
      </Box>
    )
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="yellow" bold>⚠  Service account validation failed</Text>
      <Text color="red">{message}</Text>
      <Select
        visibleOptionCount={3}
        options={options}
        onChange={value => onChoose(value as 'retry' | 'save-anyway' | 'oauth')}
      />
    </Box>
  )
}

// ── google-sign-in (pre-consent) ──────────────────────────────────────────────

export type GoogleSignInChoice = 'go' | 'learn' | 'exit'

export interface GoogleSignInStepProps {
  onChoose: (choice: GoogleSignInChoice) => void
  dense?: boolean
}

// Responsive explanation, both forms leading with the WHY (never the
// service-account mechanism):
//   • comfortable (room to spare) — the fuller version: an info Alert + the
//     "two approvals" framing + a per-scope breakdown of why each is safe + the
//     trust line. Shown whenever it fits the terminal.
//   • dense (tight) — the same why condensed to fit BODY_BUDGET_ROWS at the
//     reference widths, in smooth prose (not the old terse fallback).
const GOOGLE_SIGN_IN_OPTIONS = [
  { label: '🔐  Continue to Google sign-in', value: 'go' as const },
  { label: 'ℹ️   Why is this secure?', value: 'learn' as const },
  { label: '✖  Exit (I\'ll do it later)', value: 'exit' as const },
]

export const GoogleSignInStep: FC<GoogleSignInStepProps> = ({ onChoose, dense = false }) => {
  const select = (
    <Select options={GOOGLE_SIGN_IN_OPTIONS} onChange={value => onChoose(value as GoogleSignInChoice)} />
  )
  if (dense) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text>Capgo uploads your signed app to Google Play for you on each cloud build. Google only allows that through a service account — this one-time sign-in creates one for you, instead of a manual setup across two Google consoles.</Text>
        <Text>
          •
          {' '}
          <Text bold>Cloud access</Text>
          {' '}
          looks broad, but it&apos;s used once to create that one account, then never again.
        </Text>
        <Text>
          •
          {' '}
          <Text bold>Play access</Text>
          {' '}
          is release-only — this one app, nothing else.
        </Text>
        <Text dimColor>• Your Google sign-in token never leaves your machine; it&apos;s revoked once setup finishes.</Text>
        {select}
      </Box>
    )
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <Alert variant="info">
        On every Android cloud build, Capgo uploads your signed app to Google Play for you. Google only allows that through a service account — normally a fiddly manual setup across the Google Cloud and Play consoles. This one-time sign-in does it for you, scoped to release-only access.
      </Alert>
      <Newline />
      <Text>Google&apos;s consent screen will ask you to approve two things:</Text>
      <Box flexDirection="column" marginLeft={2} marginTop={1}>
        <Text>
          •
          {' '}
          <Text bold>Create the publishing account</Text>
          {' '}
          in a Google Cloud project you pick. Google labels this access broadly, but Capgo only creates that one account — it never touches anything else in your Cloud.
        </Text>
        <Text>
          •
          {' '}
          <Text bold>Give it release access</Text>
          {' '}
          to this one app in your Play Console, and nothing more.
        </Text>
      </Box>
      <Newline />
      <Text dimColor>Your Google sign-in token stays on your machine and is revoked once setup finishes.</Text>
      <Newline />
      {select}
    </Box>
  )
}

// ── google-sign-in (learn-more) ───────────────────────────────────────────────

export interface GoogleSignInLearnMoreStepProps {
  onBack: () => void
  dense?: boolean
}

// Comfortable: the original long-form trust explainer — an info Alert + an
// indented box of four bold question / wrapping-answer pairs separated by
// <Newline/>s + a dim provenance line + a <Newline/> + the Back control. Dense:
// the whole Q&A is condensed to four terse single-line reassurances (the deep
// detail lives in the docs/source the last line points to) so the explainer +
// the Back control fit within budget.
export const GoogleSignInLearnMoreStep: FC<GoogleSignInLearnMoreStepProps> = ({ onBack, dense = false }) => {
  if (dense) {
    return (
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
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <Alert variant="info">
        What Capgo can and can&apos;t do with the access you&apos;re about to grant.
      </Alert>
      <Newline />
      <Box flexDirection="column" marginLeft={2}>
        <Text bold>Can Capgo touch other GCP projects on my account?</Text>
        <Text>
          The scope allows it, but this CLI only calls APIs against the project you&apos;ll pick on the next screen. It creates one service account named
          {' '}
          <Text color="cyan">capgo-native-build</Text>
          {' '}
          in that one project and stops.
        </Text>
        <Newline />
        <Text bold>Will Capgo upload anything to Play Store without me knowing?</Text>
        <Text>No. The flow invites one service account into one app (the package you confirm) with release-only permissions. Future builds use that service account, not your OAuth tokens.</Text>
        <Newline />
        <Text bold>Can Capgo employees access my Google account?</Text>
        <Text>No. The refresh token never leaves your machine. Capgo&apos;s servers only serve the OAuth client ID — they never see your tokens. When provisioning finishes, the CLI asks Google to revoke that token, so even your local copy stops working.</Text>
        <Newline />
        <Text bold>What if I change my mind later?</Text>
        <Text>
          Revoke anytime at
          {' '}
          <Text color="cyan">myaccount.google.com/permissions</Text>
          , or just delete the service account in Google Cloud. Neither needs Capgo&apos;s involvement.
        </Text>
        <Newline />
        <Text dimColor>Capgo passed Google&apos;s OAuth verification on 2026-05-02 for these scopes. Source code: github.com/Cap-go/capgo</Text>
      </Box>
      <Newline />
      <Select options={[{ label: '← Back to sign-in', value: 'back' }]} onChange={onBack} />
    </Box>
  )
}

// ── google-sign-in-running (spinner + optional status stream) ─────────────────
// `statusMessages` is a live stream of OAuth progress lines. The spinner stays
// pinned at the top. Comfortable: the full stream is rendered (the original
// look). Dense: only the last few status lines are shown so a long stream can't
// push past the budget.

export interface GoogleSignInRunningStepProps {
  statusMessages: string[]
  dense?: boolean
}

export const GoogleSignInRunningStep: FC<GoogleSignInRunningStepProps> = ({ statusMessages, dense = false }) => {
  const lines = dense ? statusMessages.slice(-STATUS_TAIL) : statusMessages
  return (
    <Box flexDirection="column" marginTop={1}>
      <SpinnerLine text="Waiting for Google sign-in..." />
      {lines.length > 0 && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          {lines.map((msg, i) => (<Text key={`oauth-status-${i}`} dimColor>{msg}</Text>))}
        </Box>
      )}
    </Box>
  )
}

// ── play-developer-id-input (actions) ─────────────────────────────────────────
// `playDeveloperUrl` is the Play Console URL prefix shown as the example.

export type PlayDevIdActionChoice = 'open' | 'tutorial' | 'manual'

export interface PlayDeveloperIdActionsStepProps {
  playDeveloperUrl: string
  onChoose: (choice: PlayDevIdActionChoice) => void
  dense?: boolean
}

// Comfortable: the original info Alert + a <Newline/> + the "every Play
// Developer account has a unique ID" explainer + a <Newline/> + the
// "find it in the URL" line + the indented URL example (prefix + bold ID +
// "/…") + a <Newline/> + the dim "copy the digits / whole URL" hint + a
// <Newline/> + the Select(3). Dense: the explanation is compressed to two terse
// lines that still tell the user what the ID is and where to find it, the blank
// lines are dropped, and the URL example is folded into one line.
export const PlayDeveloperIdActionsStep: FC<PlayDeveloperIdActionsStepProps> = ({ playDeveloperUrl, onChoose, dense = false }) => {
  const options = [
    { label: '🌐  Open Play Console in my browser', value: 'open' },
    { label: '🎬  Watch a quick video tutorial', value: 'tutorial' },
    { label: '📝  I have my developer ID — let me paste it', value: 'manual' },
  ]
  if (dense) {
    return (
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
          options={options}
          onChange={value => onChoose(value as PlayDevIdActionChoice)}
        />
      </Box>
    )
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <Alert variant="info">
        We need your Google Play Console Developer account ID.
      </Alert>
      <Newline />
      <Text>Every Google Play Developer account (the one you paid the $25 one-time fee for) has a unique numeric ID. We invite Capgo&apos;s service account into that specific account, which is how builds get uploaded to Play.</Text>
      <Newline />
      <Text>You&apos;ll find the ID in the Play Console URL after signing in:</Text>
      <Box marginLeft={2} marginTop={1}>
        <Text dimColor>{playDeveloperUrl}</Text>
        <Text bold color="cyan">1234567890123456789</Text>
        <Text dimColor>/…</Text>
      </Box>
      <Newline />
      <Text>
        The digits after
        {' '}
        <Text color="cyan">/developers/</Text>
        {' '}
        are what we need. Copy them, or copy the whole URL — we&apos;ll parse it.
      </Text>
      <Newline />
      <Select
        options={options}
        onChange={value => onChoose(value as PlayDevIdActionChoice)}
      />
    </Box>
  )
}

// ── play-developer-id-input (input) ───────────────────────────────────────────

export interface PlayDeveloperIdInputStepProps {
  onSubmit: (value: string) => void
  dense?: boolean
}

// Comfortable: bold label + the dim helper line + a <Newline/> + the input (the
// original look). Dense: the blank line is dropped.
export const PlayDeveloperIdInputStep: FC<PlayDeveloperIdInputStepProps> = ({ onSubmit, dense = false }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Paste the Play Console URL, or just the developer ID:</Text>
    <Text dimColor>Either the whole address bar value or the 16–20 digit number works.</Text>
    {!dense && <Newline />}
    <FilteredTextInput
      placeholder="https://play.google.com/console/u/0/developers/…"
      filter=""
      onSubmit={onSubmit}
    />
  </Box>
)

// ── gcp-projects-loading (spinner) ────────────────────────────────────────────
// Single spinner line — identical comfortable / dense.

export const GcpProjectsLoadingStep: FC = () => (
  <Box marginTop={1}><SpinnerLine text="Loading your Google Cloud projects..." /></Box>
)

// ── gcp-projects-select ───────────────────────────────────────────────────────
// The parent builds the option list (a "Create a new project" row prepended to
// one row per existing GCP project) and owns the route handler. Comfortable:
// the original bold heading + the dim helper line + a <Newline/> + the un-capped
// Select (the original showed every project — the parent only renders this form
// after measuring it fits). Dense: the blank line is dropped and visibility is
// capped via Select's `visibleOptionCount` with a "+N more" hint so a user with
// many projects can't blow the budget.

export interface GcpProjectsSelectStepProps {
  options: SelectOption[]
  onChange: (value: string) => void
  dense?: boolean
}

export const GcpProjectsSelectStep: FC<GcpProjectsSelectStepProps> = ({ options, onChange, dense = false }) => {
  if (!dense) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Which Google Cloud project should host the service account?</Text>
        <Text dimColor>We&apos;ll create a `capgo-native-build` service account in the chosen project.</Text>
        <Newline />
        <Select options={options} onChange={onChange} />
      </Box>
    )
  }
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
  dense?: boolean
}

// Comfortable: bold label + the dim constraint line + a <Newline/> + the input
// (the original look). Dense: the blank line is dropped and the constraint copy
// trimmed.
export const GcpProjectCreateNameStep: FC<GcpProjectCreateNameStepProps> = ({ defaultDisplayName, onSubmit, dense = false }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>Name for the new Google Cloud project:</Text>
    <Text dimColor>
      {dense
        ? '≤30 chars. The project ID is auto-generated from your app ID + a random suffix.'
        : '≤30 chars. The project ID will be auto-generated from your app ID plus a random suffix.'}
    </Text>
    {!dense && <Newline />}
    <FilteredTextInput
      placeholder={defaultDisplayName}
      filter=""
      onSubmit={onSubmit}
    />
  </Box>
)

// ── android-package-select ────────────────────────────────────────────────────
// `showChooser` is true when Gradle-detected package IDs exist AND the user
// hasn't switched to manual entry; it renders the detected-list fork. Otherwise
// the manual package-name input is shown. The detected options (one row per id +
// a "type a different name" row) are built by the parent.

export interface AndroidPackageSelectStepProps {
  showChooser: boolean
  detectedOptions: SelectOption[]
  detectedCount: number
  /** The configured native dir (e.g. "android") — used in the comfortable copy. */
  androidDir: string
  onChooseDetected: (value: string) => void
  onSubmitManual: (value: string) => void
  dense?: boolean
}

// Comfortable: the original info Alert + a <Newline/> + the full
// applicationId-vs-JS-appId paragraph (naming the build.gradle path) + a
// <Newline/> + either the bold "Found these…" line + a <Newline/> + the
// un-capped Select, or the bold "Android package name:" label + a <Newline/> +
// the input. Dense: the Alert / box / blank lines are dropped, the copy is
// compressed to a terse header + a one-line "must match applicationId" hint, and
// the detected list is capped via `visibleOptionCount` + a "+N more" hint.
export const AndroidPackageSelectStep: FC<AndroidPackageSelectStepProps> = ({
  showChooser,
  detectedOptions,
  detectedCount,
  androidDir,
  onChooseDetected,
  onSubmitManual,
  dense = false,
}) => {
  if (!dense) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Alert variant="info">
          Which Android package (applicationId) should Capgo have release access to?
        </Alert>
        <Newline />
        <Text>
          This is the package name the Play Console uses — it must match the
          {' '}
          <Text bold>applicationId</Text>
          {' '}
          in
          {' '}
          <Text color="cyan">{`${androidDir}/app/build.gradle`}</Text>
          , not the Capacitor JS-level appId (those can differ when plugins like CapacitorUpdater override the base ID).
        </Text>
        <Newline />
        {showChooser
          ? (
              <>
                <Text bold>Found these in your Gradle config. Pick one, or enter a different package:</Text>
                <Newline />
                <Select options={detectedOptions} onChange={onChooseDetected} />
              </>
            )
          : (
              <>
                <Text bold>Android package name:</Text>
                <Newline />
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
// `statusMessages` is the live provisioning progress stream. The spinner stays
// pinned at the top. Comfortable: the full stream is rendered (the original
// look). Dense: only the last few lines are shown so a long stream can't push
// the spinner / frame past budget.

export interface GcpSetupRunningStepProps {
  statusMessages: string[]
  dense?: boolean
}

export const GcpSetupRunningStep: FC<GcpSetupRunningStepProps> = ({ statusMessages, dense = false }) => {
  const lines = dense ? statusMessages.slice(-STATUS_TAIL) : statusMessages
  return (
    <Box flexDirection="column" marginTop={1}>
      <SpinnerLine text="Provisioning Google Cloud + Play Console..." />
      {lines.length > 0 && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          {lines.map((msg, i) => (<Text key={`setup-status-${i}`} dimColor>{msg}</Text>))}
        </Box>
      )}
    </Box>
  )
}
