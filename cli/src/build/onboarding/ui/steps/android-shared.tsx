// src/build/onboarding/ui/steps/android-shared.tsx
//
// Pure presentational step bodies for the Android `build init` onboarding
// wizard's shared lifecycle frames (welcome / credentials-exist / backing-up /
// no-platform / build-complete / error) plus the AI build-log analysis
// prompt / running / result frames. Each component is "props in → JSX out":
// every dynamic value and event handler is an explicit, typed prop. The parent
// wizard (android/ui/app.tsx) owns all state, routing, async work, telemetry
// (trackAiAnalysisChoice etc.) and terminal-size measurement; these components
// never touch `useStdout` / `measureElement`. `useInput` inside a leaf control
// is fine — that's not layout measurement.
//
// The frame-fit contract (see ui/components.tsx + test/helpers/frame-fit.mjs)
// requires every step body to render within BODY_BUDGET_ROWS (13) rows at the
// reference widths (80 and 60 cols). Copy here is deliberately terse and the
// original decorative <Newline/>s are dropped so the bodies stay lean at 60
// columns where text wraps hardest — but the interactive control and its key
// instruction always stay on screen. The two variable-length frames cap their
// growth: `error` truncates a long failure message to a single line, and
// `ai-analysis-result` only ever renders SHORT analysis text inline (long
// analyses are routed to the fullscreen scroll viewer by the parent before
// this frame is shown) and collapses the "retries exhausted" hint to one line.
import type { FC } from 'react'
import type { AiResultKind } from '../components.js'
import { Select } from '@inkjs/ui'
import { Box, Text } from 'ink'
import React from 'react'
import { AiResultBanner, ErrorLine, SpinnerLine, SuccessLine } from '../components.js'

// Longest a single failure message may be before we hard-truncate it with an
// ellipsis. A raw backend / CLI stderr can be hundreds of characters and would
// wrap several rows at 60 cols, pushing the retry/exit control off the 13-row
// budget. One line of failure context + the recovery control is enough here;
// the parent already logs the full message to the scrollback above.
const MAX_ERROR_CHARS = 110

function truncate(text: string, max: number): string {
  if (text.length <= max)
    return text
  // -1 so the ellipsis itself doesn't push us over `max`.
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

// ── welcome (spinner) ─────────────────────────────────────────────────────────

export const WelcomeStep: FC = () => (
  <Box marginTop={1} justifyContent="center">
    <SpinnerLine text="Detecting Android project..." />
  </Box>
)

// ── no-platform ───────────────────────────────────────────────────────────────
// `androidDir` is the (configurable) native dir we looked for, e.g. "android".
// The original separated the error line from the instruction with a <Newline/>;
// dropped here so the two lines sit together and the frame stays at 2 rows.

export interface NoPlatformStepProps {
  androidDir: string
}

export const NoPlatformStep: FC<NoPlatformStepProps> = ({ androidDir }) => (
  <Box flexDirection="column" marginTop={1}>
    <ErrorLine text={`No ${androidDir}/ directory found.`} />
    <Text>
      Run
      {' '}
      <Text bold color="white">npx cap add android</Text>
      {' '}
      first, then re-run onboarding.
    </Text>
  </Box>
)

// ── credentials-exist ─────────────────────────────────────────────────────────
// `appId` is the Capgo app whose credentials already exist. The original padded
// the warning, the explanation and the Select with three <Newline/>s; dropped
// so the prompt + choices fit comfortably at 60 cols.

export interface CredentialsExistStepProps {
  appId: string
  onChoose: (choice: 'backup' | 'exit') => void
}

export const CredentialsExistStep: FC<CredentialsExistStepProps> = ({ appId, onChoose }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold color="yellow">{`⚠ Android credentials already exist for ${appId}`}</Text>
    <Text>Onboarding will create new credentials, replacing the existing ones.</Text>
    <Select
      options={[
        { label: '📦  Start fresh (backup existing credentials first)', value: 'backup' },
        { label: '✖  Exit onboarding', value: 'exit' },
      ]}
      onChange={value => onChoose(value as 'backup' | 'exit')}
    />
  </Box>
)

// ── backing-up (spinner) ──────────────────────────────────────────────────────

export const BackingUpStep: FC = () => (
  <Box marginTop={1}><SpinnerLine text="Backing up existing credentials..." /></Box>
)

// ── build-complete ────────────────────────────────────────────────────────────
// Terminal frame of the flow. `uploadSummary` (CI-secret push result) and
// `buildUrl` are both optional. The original wrapped each in a <Newline/> +
// fragment; dropped so the success line + the (at most two) follow-up lines
// stay within budget.

export interface BuildCompleteStepProps {
  uploadSummary: string | null
  buildUrl: string
}

export const BuildCompleteStep: FC<BuildCompleteStepProps> = ({ uploadSummary, buildUrl }) => (
  <Box flexDirection="column" marginTop={1}>
    <SuccessLine text="Onboarding complete" />
    {uploadSummary && <Text>{`${uploadSummary}.`}</Text>}
    {buildUrl && (
      <Text>
        Track your build:
        {' '}
        <Text color="cyan" underline>{buildUrl}</Text>
      </Text>
    )}
  </Box>
)

// ── error ─────────────────────────────────────────────────────────────────────
// `message` is the failure detail and can be arbitrarily long (wrapped backend
// / CLI stderr). The original rendered the full message + a <Newline/> + the
// retry/exit Select, so a long message wrapped past the budget and clipped the
// control. We truncate the message to a single line (the parent logs the full
// text to the scrollback) and drop the <Newline/>; the recovery control always
// stays on screen.

export interface ErrorStepProps {
  message: string
  onChoose: (choice: 'retry' | 'exit') => void
}

export const ErrorStep: FC<ErrorStepProps> = ({ message, onChoose }) => (
  <Box flexDirection="column" marginTop={1}>
    <ErrorLine text={truncate(message, MAX_ERROR_CHARS)} />
    <Select
      options={[
        { label: '↻  Retry', value: 'retry' },
        { label: '✖  Exit', value: 'exit' },
      ]}
      onChange={value => onChoose(value as 'retry' | 'exit')}
    />
  </Box>
)

// ── ai-analysis-prompt ────────────────────────────────────────────────────────
// Offered when a build fails and Capgo captured a log to analyze. The original
// padded the failure line, the offer and the Select with <Newline/>s; dropped
// so the offer + debug/skip control fit at 60 cols. All telemetry on the choice
// stays in the parent's onChange handler.

export interface AiAnalysisPromptStepProps {
  onChoose: (choice: 'debug' | 'skip') => void
}

export const AiAnalysisPromptStep: FC<AiAnalysisPromptStepProps> = ({ onChoose }) => (
  <Box flexDirection="column" marginTop={1}>
    <ErrorLine text="Build failed." />
    <Text>We can analyze the build log with Capgo AI (Kimi K2.5) and suggest a fix.</Text>
    <Select
      options={[
        { label: '🤖  Debug with AI', value: 'debug' },
        { label: '⏭   Skip', value: 'skip' },
      ]}
      onChange={value => onChoose(value as 'debug' | 'skip')}
    />
  </Box>
)

// ── ai-analysis-running (spinner) ─────────────────────────────────────────────

export const AiAnalysisRunningStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Analyzing build log with Capgo AI (Kimi K2.5)..." />
  </Box>
)

// ── ai-analysis-result ────────────────────────────────────────────────────────
// Renders the AI diagnosis (or a non-success banner), the "AI can make
// mistakes" caution, and the retry-or-skip control. Mutually-exclusive content:
//   • `analysisText` (success) — rendered inline ONLY when short; the parent
//     routes long analyses to the fullscreen scroll viewer BEFORE this frame is
//     shown, so the inline branch never blows the budget.
//   • `viewedFull` — once the user has dismissed the scroll viewer, the long
//     text already scrolled past in the terminal, so we show a one-line "shown
//     above" marker instead of re-printing it.
//   • `result` (non-success) — a compact AiResultBanner (already ≤ 3 rows).
//
// `retryCount` + `maxRetries` derive the retry affordance; the parent keeps the
// counter and ALL telemetry (trackAiAnalysisChoice) + state-reset in its
// onChange handlers. We expose two handlers: `onRetry` ("I fixed it, rebuild")
// and `onSkipOrContinue` (skip retry / continue). The original padded every
// element with <Newline/>s and printed a two-line "retries exhausted" note,
// which overflowed at 60 cols; the blank lines are dropped and the exhausted
// note is a single dim line so the Select always stays visible.

export interface AiAnalysisResultStepProps {
  /** Pre-rendered (markdown→ANSI) analysis text, or null on a non-success result. */
  analysisText: string | null
  /** True once the user dismissed the fullscreen scroll viewer for this text. */
  viewedFull: boolean
  /** Non-success outcome banner (error / already_analyzed / too_big), else null. */
  result: { kind: AiResultKind, message: string } | null
  /** Retries already consumed; with `maxRetries` decides whether retry is offered. */
  retryCount: number
  maxRetries: number
  onRetry: () => void
  onSkipOrContinue: () => void
}

export const AiAnalysisResultStep: FC<AiAnalysisResultStepProps> = ({
  analysisText,
  viewedFull,
  result,
  retryCount,
  maxRetries,
  onRetry,
  onSkipOrContinue,
}) => {
  const retriesLeft = maxRetries - retryCount
  const canRetry = retriesLeft > 0
  const retryLabel = retriesLeft === 1
    ? '🔄  I fixed it, retry build (last retry)'
    : `🔄  I fixed it, retry build (${retriesLeft} retries left)`
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">AI analysis</Text>
      {analysisText && !viewedFull && <Text>{analysisText}</Text>}
      {analysisText && viewedFull && (
        <Text dimColor>📖  Analysis already shown above (scroll your terminal back to re-read it).</Text>
      )}
      {result && <AiResultBanner kind={result.kind} message={result.message} />}
      <Text color="yellow">⚠ AI can make mistakes. Verify against the full log before applying the fix.</Text>
      {!canRetry && (
        <Text dimColor>{`You've used all ${maxRetries} retries. Exit and re-run the wizard for another attempt.`}</Text>
      )}
      <Select
        options={canRetry
          ? [
              { label: retryLabel, value: 'retry' },
              { label: '⏭   Continue (skip retry)', value: 'skip' },
            ]
          : [
              { label: '✔  Continue', value: 'continue' },
            ]}
        onChange={(value) => {
          if (value === 'retry')
            onRetry()
          else
            onSkipOrContinue()
        }}
      />
    </Box>
  )
}
