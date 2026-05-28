import type { FC } from 'react'
import type { BuildOnboardingRecoveryAdvice } from '../../recovery.js'
import type { AiResultKind } from '../components.js'
// src/build/onboarding/ui/steps/ios-shared.tsx
//
// Pure presentational step bodies shared across the `build init` onboarding
// wizard (ui/app.tsx): the project-level frames (welcome / platform-select /
// adding-platform / no-platform / build-complete / error) plus the AI
// build-analysis prompt / running / result frames. Each component is
// "props in → JSX out": every dynamic value and event handler is an explicit,
// typed prop. The parent wizard owns ALL state, routing, async work, telemetry
// (trackAiAnalysisChoice) and terminal-size measurement; these components only
// render and forward callbacks. They never touch `useStdout` /
// `measureElement`.
//
// The frame-fit contract (see ui/components.tsx + test/helpers/frame-fit.mjs)
// requires every step body to render within BODY_BUDGET_ROWS (13) rows at the
// reference widths (80 + 60). The two budget offenders here are:
//   • error — renders variable-length recovery advice (the recovery helper can
//     match several branches at once, so summary/commands/docs all grow). The
//     error string is clamped, the advice lists are capped to a couple of rows
//     each with a "… +N more" line, docs is dropped (the actionable bits are
//     summary + commands + the Select), and the decorative blank lines are
//     removed so the "what failed" line + recovery action stay on screen.
//   • ai-analysis-result — the success analysis text rendered inline here is
//     always SHORT (long analyses are routed to the fullscreen scroll step by
//     the parent BEFORE this frame); the verbose caution + "retries used"
//     notice are kept terse and the decorative blank lines dropped.
// Verified in test-frame-fit-ios-shared.mjs.
import { Select } from '@inkjs/ui'
import { Box, Text } from 'ink'
import React from 'react'
import { AiResultBanner, ErrorLine, SpinnerLine, SuccessLine } from '../components.js'

// A single Select option. Mirrors the shape @inkjs/ui's Select expects so the
// parent can build option lists and pass them straight through. Matches the
// other step files' SelectOption.
export interface SelectOption {
  label: string
  value: string
}

// How many recovery summary / command lines to render before collapsing the
// rest into a "… +N more" line. The recovery helper (recovery.ts) pushes ~2
// lines per matched branch and a composite error string matches several
// branches at once, so an uncapped list blows the 13-row budget at 60 cols
// (each summary line itself wraps to 2-3 rows). Showing ONE summary line + ONE
// command + a "… +N more" count keeps the actionable bits — the "what failed"
// error, the support-bundle path, and the recovery Select — on screen even in
// the composite worst case. The summary's first line is the most relevant
// (recovery.ts orders the matched branch's headline first).
const RECOVERY_VISIBLE_SUMMARY = 1
const RECOVERY_VISIBLE_COMMANDS = 1

// Upper bound on the rendered length of the error string. Onboarding errors are
// usually short, but an Apple/Capgo backend error (or a profile-mismatch
// message) can wrap to many rows at 60 cols and shove the recovery Select off
// screen; clamping keeps it to ~2 wrapped rows at 60 cols. The full error is
// also written to the support bundle, so the clamp is purely cosmetic.
const ERROR_MAX_CHARS = 110

// The single visible summary line is clamped to ONE rendered row (the recovery
// summary lines from recovery.ts run ~100 chars and would wrap to 2 rows at 60
// cols). Clamped to the narrow reference width minus the 2-col `marginLeft`
// indent + the "• " bullet so it never wraps even at 60 cols. Commands are
// already short and the support-bundle path is left whole (it's the actionable
// artifact the user must copy — it may wrap to 2 rows, which the budget
// accounts for).
const SUMMARY_LINE_MAX_CHARS = 54

function collapse(message: string): string {
  return message.replace(/\s+/g, ' ').trim()
}

function clamp(message: string, max: number): string {
  const collapsed = collapse(message)
  if (collapsed.length <= max)
    return collapsed
  return `${collapsed.slice(0, max - 1)}…`
}

// ── welcome ─────────────────────────────────────────────────────────────────
export const WelcomeStep: FC = () => (
  <Box marginTop={1} justifyContent="center">
    <SpinnerLine text="Detecting project..." />
  </Box>
)

// ── platform-select ───────────────────────────────────────────────────────────
// `appId` drives the "detected project" detail. The parent owns the routing
// (iOS → credential flow; Android → exit-with-instructions).
export interface PlatformSelectStepProps {
  appId: string
  onChange: (value: string) => void | Promise<void>
}

export const PlatformSelectStep: FC<PlatformSelectStepProps> = ({ appId, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <SuccessLine text="Detected Capacitor project" detail={appId} />
    <Text bold>Which platform do you want to set up?</Text>
    <Select
      options={[
        { label: '🍎  iOS', value: 'ios' },
        { label: '🤖  Android', value: 'android' },
      ]}
      onChange={onChange}
    />
  </Box>
)

// ── no-platform ────────────────────────────────────────────────────────────────
// The iOS native folder is missing. `iosDir` names the missing directory,
// `addIosCommand`/`syncIosCommand` are the suggested fixes (shown terse), and
// the option labels embed `addIosCommand`. The parent owns run/recheck/exit.
export interface NoPlatformStepProps {
  iosDir: string
  addIosCommand: string
  syncIosCommand: string
  onChange: (value: string) => void
}

export const NoPlatformStep: FC<NoPlatformStepProps> = ({ iosDir, addIosCommand, syncIosCommand, onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <ErrorLine text={`No ${iosDir}/ directory found.`} />
    <Text>Onboarding needs a generated native iOS project before creating credentials.</Text>
    <Text dimColor>{`Suggested: ${addIosCommand} && ${syncIosCommand}`}</Text>
    <Select
      options={[
        { label: `🛠  Run ${addIosCommand} now`, value: 'run' },
        { label: '🔄  I already fixed it, re-check', value: 'recheck' },
        { label: '✖  Exit onboarding', value: 'exit' },
      ]}
      onChange={onChange}
    />
  </Box>
)

// ── adding-platform ─────────────────────────────────────────────────────────────
// Spinner shown while `addIosCommand` runs. `doctorCommand` is the fallback hint.
export interface AddingPlatformStepProps {
  addIosCommand: string
  doctorCommand: string
}

export const AddingPlatformStep: FC<AddingPlatformStepProps> = ({ addIosCommand, doctorCommand }) => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text={`Running ${addIosCommand}...`} />
    <Text dimColor>{`If this fails, try ${doctorCommand} and keep the support bundle path from the error screen.`}</Text>
  </Box>
)

// ── ai-analysis-prompt ──────────────────────────────────────────────────────────
// Build failed; offer an AI diagnosis. The parent routes debug →
// ai-analysis-running, skip → build-complete (and fires the 'skip' telemetry).
export interface AiAnalysisPromptStepProps {
  onChange: (value: string) => void | Promise<void>
}

export const AiAnalysisPromptStep: FC<AiAnalysisPromptStepProps> = ({ onChange }) => (
  <Box flexDirection="column" marginTop={1}>
    <ErrorLine text="Build failed." />
    <Text>We can analyze the build log with Capgo AI (Kimi K2.5) and suggest a fix.</Text>
    <Select
      options={[
        { label: '🤖  Debug with AI', value: 'debug' },
        { label: '⏭   Skip', value: 'skip' },
      ]}
      onChange={onChange}
    />
  </Box>
)

// ── ai-analysis-running ─────────────────────────────────────────────────────────
export const AiAnalysisRunningStep: FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <SpinnerLine text="Analyzing build log with Capgo AI (Kimi K2.5)..." />
  </Box>
)

// ── ai-analysis-result ──────────────────────────────────────────────────────────
// Renders the diagnosis (or fallback banner), then a retry/skip Select. The
// parent computes whether retries remain and owns ALL telemetry + state-reset
// on retry; this component only renders and forwards the chosen value.
//
// Display rules (preserved from the original IIFE):
//   • success + short text not yet scrolled → render `analysisText` inline.
//   • success + already viewed in the scroll viewer → a compact "shown above"
//     marker (the parent sets `viewedFull` when returning from the scroll step).
//   • a non-success outcome (`result`) → the coloured AiResultBanner.
// The "⚠ AI can make mistakes…" caution always shows. When no retries remain a
// terse "used all N retries" notice + a single "Continue" option replace the
// retry/skip pair.
//
// `maxRetries` is the parent's MAX_AI_RETRIES; `retriesLeft` is the remaining
// count (0 ⇒ `canRetry` false). The success `analysisText` rendered here is
// always SHORT — the parent routes long analyses to the fullscreen scroll step
// before this frame — so it never threatens the budget on its own.
export interface AiAnalysisResultStepProps {
  analysisText: string | null
  viewedFull: boolean
  result: { kind: AiResultKind, message: string } | null
  canRetry: boolean
  retriesLeft: number
  maxRetries: number
  onChange: (value: string) => void | Promise<void>
}

export const AiAnalysisResultStep: FC<AiAnalysisResultStepProps> = ({
  analysisText,
  viewedFull,
  result,
  canRetry,
  retriesLeft,
  maxRetries,
  onChange,
}) => {
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
      <Text color="yellow">⚠ AI can make mistakes. Verify the diagnosis against the full log before applying the fix.</Text>
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
        onChange={onChange}
      />
    </Box>
  )
}

// ── error ───────────────────────────────────────────────────────────────────────
// The main fit risk: recovery advice is variable-length (recovery.ts can match
// several branches for one composite error, growing summary/commands/docs). We
// keep a clamped one-line "what failed" + the single most relevant recovery
// summary line + the first helpful command (each with a "… +N more" count) +
// the recovery Select, all with the original decorative blank lines dropped.
// `docs` is intentionally not rendered (the Select + commands are the
// actionable parts; docs URLs are long and would wrap past the budget). The
// support-bundle path is rendered whole (it's the artifact the user must copy);
// it may wrap to 2 rows, which the budget accounts for. `showRetry` gates the
// Select (the parent only sets a retryStep on recoverable errors); the parent
// owns retry/restart/exit.
export interface ErrorStepProps {
  error: string
  recoveryAdvice: BuildOnboardingRecoveryAdvice | null
  supportBundlePath: string | null
  showRetry: boolean
  onChange: (value: string) => void | Promise<void>
}

export const ErrorStep: FC<ErrorStepProps> = ({ error, recoveryAdvice, supportBundlePath, showRetry, onChange }) => {
  const summary = recoveryAdvice?.summary ?? []
  const commands = recoveryAdvice?.commands ?? []
  const hiddenSummary = Math.max(0, summary.length - RECOVERY_VISIBLE_SUMMARY)
  const visibleSummary = summary.slice(0, RECOVERY_VISIBLE_SUMMARY)
  const hiddenCommands = Math.max(0, commands.length - RECOVERY_VISIBLE_COMMANDS)
  const visibleCommands = commands.slice(0, RECOVERY_VISIBLE_COMMANDS)
  return (
    <Box flexDirection="column" marginTop={1}>
      <ErrorLine text={clamp(error, ERROR_MAX_CHARS)} />
      {visibleSummary.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {visibleSummary.map(line => (
            <Text key={`recovery-summary-${line}`}>{`• ${clamp(line, SUMMARY_LINE_MAX_CHARS)}`}</Text>
          ))}
          {hiddenSummary > 0 && <Text dimColor>{`… +${hiddenSummary} more`}</Text>}
        </Box>
      )}
      {visibleCommands.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {visibleCommands.map(command => (
            <Text key={`recovery-command-${command}`} dimColor>{collapse(command)}</Text>
          ))}
          {hiddenCommands > 0 && <Text dimColor>{`… +${hiddenCommands} more`}</Text>}
        </Box>
      )}
      {supportBundlePath && (
        <Text dimColor>{`Support bundle: ${supportBundlePath}`}</Text>
      )}
      {showRetry && (
        <Select
          options={[
            { label: '🔄  Try again', value: 'retry' },
            { label: '↩️   Restart onboarding', value: 'restart' },
            { label: '❌  Exit', value: 'exit' },
          ]}
          onChange={onChange}
        />
      )}
    </Box>
  )
}

// ── build-complete ──────────────────────────────────────────────────────────────
// Final success screen. `buildUrl` (when a build was kicked off) and
// `ciSecretUploadSummary` (when env vars were uploaded) are optional details.
// `buildRequestCommand` is shown as the "run anytime" hint. The bordered box is
// kept (this is a terminal frame, not an interactive step that risks clipping).
export interface BuildCompleteStepProps {
  buildUrl: string
  ciSecretUploadSummary: string | null
  buildRequestCommand: string
}

export const BuildCompleteStep: FC<BuildCompleteStepProps> = ({ buildUrl, ciSecretUploadSummary, buildRequestCommand }) => (
  <Box flexDirection="column" marginTop={1}>
    <Box
      borderStyle="round"
      borderColor="green"
      paddingX={3}
      flexDirection="column"
      alignItems="center"
    >
      <Text bold color="green">🎉  You're all set!</Text>
      {buildUrl
        ? (
            <>
              <Text>Your iOS app is building in the cloud.</Text>
              <Text>
                Track it at
                {' '}
                <Text color="cyan" underline>{buildUrl}</Text>
              </Text>
            </>
          )
        : (
            <Text>Your iOS credentials are saved and ready to use.</Text>
          )}
      {ciSecretUploadSummary && <Text>{`${ciSecretUploadSummary}.`}</Text>}
      <Text dimColor>
        Run
        {' '}
        <Text bold color="white">{buildRequestCommand}</Text>
        {' '}
        anytime to start a build.
      </Text>
    </Box>
  </Box>
)
