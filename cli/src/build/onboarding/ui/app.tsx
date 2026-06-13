import type { DOMElement } from 'ink'
import type { FC } from 'react'
import type { BuildCredentials } from '../../../schemas/build.js'
import type { BuildLogger } from '../../request.js'
import type { BuildOnboardingWorkflowDecision, BuildOnboardingWorkflowEvent, WorkflowDiffTelemetry } from '../analytics.js'
import type { AscAppLike, GatePath } from '../app-verification.js'
import type { AscApp, AscProfileSummary } from '../apple-api.js'
import type { CiSecretEntry, CiSecretSetupAdvice, CiSecretTarget } from '../ci-secrets.js'
import type { DiffLine } from '../diff-utils.js'
import type { DiscoveredProfile, IdentityProfileMatch, SigningIdentity } from '../macos-signing.js'
import type { BuilderOnboardingAction } from '../telemetry.js'
import type { ApiKeyData, CertificateData, EnrichedIdentityAvailability, OnboardingErrorCategory, OnboardingProgress, OnboardingResult, OnboardingStep, ProfileData } from '../types.js'
import type { BuildScriptChoice, PackageManager } from '../workflow-generator.js'
import type { AiResultKind } from './components.js'
import type { NoMatchReason } from './steps/ios-import.js'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { Alert, ProgressBar, Select } from '@inkjs/ui'
import { Box, measureElement, Newline, Text, useApp, useInput, useStdout } from 'ink'
import open from 'open'
// src/build/onboarding/ui/app.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { releaseCapturedLogs, runCapgoAiAnalysis } from '../../../ai/analyze.js'
import { renderMarkdown } from '../../../ai/render-markdown.js'
import { createStreamingMarkdownRenderer } from '../../../ai/stream-markdown.js'
import { aiAnalysisResultFromPostAnalyze, trackAiAnalysisChoice, trackAiAnalysisResult } from '../../../ai/telemetry.js'
import { trackEvent } from '../../../analytics/track.js'
import { writeOnboardingSupportBundle, writeSupportBundleFiles } from '../../../onboarding-support.js'
import { formatRunnerCommand, splitRunnerCommand } from '../../../runner-command.js'
import { copyToClipboard, revealInFinder } from '../../../support/clipboard.js'
import { contactSupport } from '../../../support/contact-support.js'
import { appendInternalLog, getInternalLogPath } from '../../../support/internal-log.js'
import { redactSecrets } from '../../../support/redact.js'
import { uploadSupportLogs } from '../../../support/support-upload.js'
import { createSupabaseClient, findBuildCommandForProjectType, findProjectType, findSavedKeySilent, getOrganizationId, getPackageScripts, getPMAndCommand } from '../../../utils.js'
import { loadSavedCredentials, updateSavedCredentials } from '../../credentials.js'
import { parseMobileprovisionDetailed } from '../../mobileprovision-parser.js'
import { writeReleaseBundleId } from '../../pbxproj-parser.js'
import { handleCustomMsg } from '../../qr.js'
import { requestBuildInternal } from '../../request.js'
import { isAiAnalysisTooTall, resolveAiResultRoute } from '../ai-fit.js'
import { getWorkflowDiffTelemetry, trackBuildOnboardingWorkflowEvent } from '../analytics.js'
import { classifyAppVerification, evaluateGate } from '../app-verification.js'
import { CertificateLimitError, classifyCertAvailability, computeCertSha1, createCertificate, createProfile, deleteProfile, DuplicateProfileError, ensureBundleId, findCertIdBySha1, generateJwt, listApps, listBundleIds, listDistributionCerts, listProfilesForCert, revokeCertificate, verifyApiKey } from '../apple-api.js'
import { resolveHelperBinary, runAscKeyHelper } from '../asc-key/helper.js'
import { sanitizeBuildLogLines } from '../build-log.js'
import { detectIosBundleIds } from '../bundle-id-detector.js'
import { createCiSecretEntries, detectCiSecretTargets, getCiSecretRepoLabelAsync, getCiSecretTargetLabel, listExistingCiSecretKeysAsync, uploadCiSecretsAsync } from '../ci-secrets.js'
import { createP12, DEFAULT_P12_PASSWORD, generateCsr } from '../csr.js'
import { diffLines } from '../diff-utils.js'
import { defaultExportPath, exportCredentialsToEnv } from '../env-export.js'
import { mapIosOnboardingError } from '../error-categories.js'
import { canUseFilePicker, openFilePicker, openMobileprovisionPicker } from '../file-picker.js'
import { bundleIdMatches, exportP12FromKeychain, filterProfilesForApp, isMacOS, listSigningIdentities, matchIdentitiesToProfiles, scanProvisioningProfiles } from '../macos-signing.js'
import { IOS_MIN_ROWS, terminalFitsOnboarding } from '../min-terminal-size.js'
import { deleteProgress, extractKeyIdFromP8Path, getImportEntryStep, getResumeStep, loadProgress, saveProgress } from '../progress.js'
import { getBuildOnboardingRecoveryAdvice } from '../recovery.js'
import { trackBuilderOnboardingAction, trackBuilderOnboardingStep } from '../telemetry.js'
import {
  getPhaseLabel,

  STEP_PROGRESS,
} from '../types.js'
import { generateWorkflow, WORKFLOW_PATH as WORKFLOW_GEN_PATH } from '../workflow-generator.js'
import { buildScriptPickerOptions, normalizePackageManager } from '../workflow-ui-helpers.js'
import { WORKFLOW_PATH, writeWorkflowFile } from '../workflow-writer.js'
import { CompletedStepsLog } from './completed-steps-log.js'
import { BOX_HEADER_ROWS, COMPACT_HEADER_ROWS, DiffSummary, Divider, FilteredTextInput, FullscreenAiViewer, FullscreenBuildOutput, FullscreenDiffViewer, Header, isBuildCompleteDismissKey, SecretsTable, SpinnerLine, SuccessLine, Table, WIZARD_PADDING_ROWS } from './components.js'
import { logBudgetRows } from './frame-fit.js'
import { TerminalTooSmallPrompt } from './min-size-gate.js'
import {
  AskBuildStep,
  AskCiSecretsStep,
  CiSecretsFailedStep,
  CiSecretsSetupStep,
  CiSecretsTargetSelectStep,
  ConfirmCiSecretOverwriteStep,
  DetectingCiSecretsStep,
} from './steps/ios-ci.js'
import {
  ApiKeyInstructionsStep,
  AscKeyGeneratingStep,
  BackingUpStep,
  CertLimitPromptStep,
  CreatingCertificateStep,
  CreatingProfileStep,
  CredentialsExistStep,
  DeletingDuplicateProfilesStep,
  DuplicateProfilePromptStep,
  InputIssuerIdStep,
  InputKeyIdStep,
  InputP8PathStep,
  P8CreateMethodSelectStep,
  P8MethodSelectStep,
  P8SourceSelectStep,
  RevokingCertificateStep,
  SavingCredentialsStep,
  SetupMethodSelectStep,
  VerifyingKeyStep,
} from './steps/ios-credentials.js'
import {
  ImportCreateProfileOnlyStep,
  ImportDistributionModeStep,
  ImportExportingStep,
  ImportExportWarningStep,
  ImportNoMatchRecoveryStep,
  ImportPickIdentityStep,
  ImportPickProfileStep,
  ImportScanningStep,
} from './steps/ios-import.js'
import {
  AddingPlatformStep,
  AiAnalysisPromptStep,
  AiAnalysisResultStep,
  AiAnalysisRunningStep,
  BuildCompleteStep,
  ErrorStep,
  estimateErrorBodyRows,
  formatErrorViewerLines,
  NoPlatformStep,
  PlatformSelectStep,
  WelcomeStep,
} from './steps/ios-shared.js'

// Braille spinner frames for the per-row "Profile" cell during prefetch.
// Module-scoped so the array reference is stable and never triggers
// re-renders by accident.
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const

// Upper bound on "I fixed it, retry build" attempts after an AI diagnosis.
// Three total attempts (initial + two retries) caps the AI cost when a model
// suggestion doesn't actually fix the failure mode while still giving the user
// a couple of in-wizard chances to iterate.
const MAX_AI_RETRIES = 2

const OUTPUT_LINE_SPLIT_RE = /\r?\n/
const CARRIAGE_RETURN_RE = /\r/g

interface LogEntry { text: string, color?: string }

interface AppProps {
  /**
   * Capgo lookup key (progress files, saved credentials, Capgo SaaS build
   * API). Resolved by `getAppId()`, which prefers
   * `config.plugins.CapacitorUpdater.appId` over `config.appId` so dev-tunnel
   * sandboxes can override the Capgo-side identifier without renaming the
   * iOS bundle. Do NOT use for Apple-side operations — see
   * `iosBundleIdInitial`.
   */
  appId: string
  /**
   * Default value for the iOS bundle ID used for Apple-side operations
   * (cert lookup, profile filtering, ensureBundleId, createProfile, and the
   * provisioning_map key). Sourced from `config.appId` directly — what
   * `cap sync` writes into project.pbxproj's PRODUCT_BUNDLE_IDENTIFIER.
   * When pbxproj's Release id and config.appId disagree, the wizard adopts the
   * authoritative Release id (verify-app confirms it remotely). command.ts
   * falls back to `appId` if config.appId is missing, so this prop is always a
   * valid string.
   */
  iosBundleIdInitial: string
  initialProgress: OnboardingProgress | null
  /** Resolved iOS directory from capacitor.config (defaults to 'ios') */
  iosDir: string
  /** Optional Capgo API key passed via -a/--apikey flag; takes precedence over saved key */
  apikey?: string
  // Capgo API gateway override (--supa-host); prod when omitted.
  supaHost?: string
  /**
   * Reports the wizard outcome to the shell when it reaches build-complete, so
   *  the caller prints an accurate post-exit message + durable summary instead of
   *  always claiming success. Never fires on cancel/missing-platform exits.
   */
  onResult?: (result: OnboardingResult) => void
}

async function runRunnerCommand(runner: string, args: string[]): Promise<{ success: boolean, output: string[] }> {
  let command = runner
  let runnerArgs: string[] = []
  try {
    ({ command, args: runnerArgs } = splitRunnerCommand(runner))
  }
  catch (error) {
    return { success: false, output: [error instanceof Error ? error.message : String(error)] }
  }

  return new Promise((resolve) => {
    const child = spawn(command, [...runnerArgs, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const output: string[] = []

    const append = (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      for (const rawLine of text.split(OUTPUT_LINE_SPLIT_RE)) {
        const line = rawLine.replaceAll(CARRIAGE_RETURN_RE, '').trim()
        if (line)
          output.push(line)
      }
    }

    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    child.once('error', (error) => {
      output.push(error.message)
      resolve({ success: false, output })
    })
    child.once('close', (code) => {
      resolve({ success: code === 0, output })
    })
  })
}

const OnboardingApp: FC<AppProps> = ({ appId, iosBundleIdInitial, initialProgress, iosDir, apikey, supaHost, onResult }) => {
  const { exit } = useApp()
  // Pass helper availability so an automated-path resume only targets
  // asc-key-generating when the helper can actually run (else manual instructions).
  const startStep = getResumeStep(initialProgress, isMacOS() && resolveHelperBinary() !== null)

  // When there's saved progress AND the resume target isn't trivially 'welcome',
  // land on the resume-prompt fork so the user can see what's saved and decide
  // whether to continue or restart from scratch — instead of being silently
  // teleported to the middle of the wizard with no chance to bail out cleanly.
  // The trivial case (no progress, or resume target is welcome) keeps the
  // existing zero-friction path.
  const [step, setStep] = useState<OnboardingStep>(
    initialProgress !== null && startStep !== 'welcome'
      ? 'resume-prompt'
      : startStep === 'welcome' ? 'welcome' : startStep,
  )

  // ─── iOS bundle id ─────────────────────────────────────────────────────
  //
  // `appId` (prop) is the Capgo lookup key — what `getAppId()` resolves to,
  // which prefers `config.plugins.CapacitorUpdater.appId` over `config.appId`
  // for dev-tunnel sandboxes. It owns the progress-file key, credentials
  // store key, and `capgo build request` command path.
  //
  // `iosBundleId` is what we send to Apple — sourced from `config.appId`
  // directly because `cap sync` only ever writes the top-level value into
  // `PRODUCT_BUNDLE_IDENTIFIER`. They diverge in real-world dev-tunnel
  // setups where capacitor.config carries a suffixed appId; using the
  // resolved key for Apple ops causes "No profile targets X" errors.
  //
  // Trust the saved override only when it was confirmed for the SAME
  // `config.appId` we're seeing this run. If the user renamed the app
  // between CLI runs the previously-saved override is stale relative to
  // the new files — fall back to `iosBundleIdInitial` so redirectIfMismatch /
  // verify-app re-resolve the bundle id instead of silently using the old value.
  const savedOverrideIsFresh = initialProgress?.iosBundleIdOverride !== undefined
    && initialProgress.iosBundleIdContextAppId === iosBundleIdInitial
  const [iosBundleId, setIosBundleId] = useState<string>(
    savedOverrideIsFresh && initialProgress?.iosBundleIdOverride
      ? initialProgress.iosBundleIdOverride
      : iosBundleIdInitial,
  )
  // Distinct from `iosBundleId !== iosBundleIdInitial` because the user is
  // allowed to pick the capacitor value at the confirm step — we still want
  // to suppress the question for the rest of the session in that case.
  // Stale overrides (context drift between runs) don't count as confirmed.
  const [appIdConfirmed, setAppIdConfirmed] = useState<boolean>(savedOverrideIsFresh)

  // ─── verify-app (remote App Store Connect verification) ────────────────
  //
  // Runs after verifying-key succeeds, app_store mode only (create-new is
  // always app_store). Confirms — via the ASC API — that an App Store app
  // exists whose bundleId == the project's Release PRODUCT_BUNDLE_IDENTIFIER
  // before we commit to that bundle id for cert/profile creation. See
  // app-verification.ts for the pure classify/gate logic.
  //
  // Where to go once verify-app passes (e.g. creating-certificate on the
  // create-new path, or the identity/profile picker on import).
  const [pendingVerifyNext, setPendingVerifyNext] = useState<OnboardingStep | null>(null)
  // True while the initial parallel apps+bundleIds fetch is in flight.
  const [verifyAppLoading, setVerifyAppLoading] = useState(false)
  // The authoritative Release build id resolved fresh from pbxproj for this
  // verification. Empty string when no Release config could be resolved.
  const [verifyReleaseBundleId, setVerifyReleaseBundleId] = useState('')
  // The Debug-config bundle id when it differs from Release (else ''). Drives a
  // persistent, bordered warning box on the verify-app step so the user always
  // sees which id Capgo Builder actually signs — a scrolling gray log line was
  // being missed.
  const [verifyDebugBundleId, setVerifyDebugBundleId] = useState('')
  // Apps that exist in the user's App Store Connect account (picker source +
  // Path B re-poll). Refreshed live on each Path B Continue.
  const [verifyApps, setVerifyApps] = useState<AscApp[]>([])
  // Registered Developer-portal bundle ids (diagnostic only — sharpens Path B
  // wording: "identifier already exists" vs "will be registered").
  const [verifyRegisteredIds, setVerifyRegisteredIds] = useState<string[]>([])
  // Which resolution path the gate is enforcing once the user has chosen
  // (Path A fix-build-id, Path B create-app). null = still showing the picker.
  const [verifyPath, setVerifyPath] = useState<GatePath | null>(null)
  // The existing app the user picked in Path A (its bundleId is the target the
  // user must make PRODUCT_BUNDLE_IDENTIFIER match).
  const [verifyChosenApp, setVerifyChosenApp] = useState<AscAppLike | null>(null)
  // 1-based count of blocked Continue attempts — drives the escalating warning
  // box so a repeatedly-blocked gate never looks frozen.
  const [verifyAttempt, setVerifyAttempt] = useState(0)
  // Path B only: when a Continue re-poll still finds no app, we flip this so
  // the next render asks before re-opening the browser (never auto-reopen).
  const [verifyAskReopen, setVerifyAskReopen] = useState(false)
  // Bumped on every gate Select action so the gate Select remounts with a fresh
  // key. @inkjs/ui's Select re-fires onChange on EVERY render once it stays
  // mounted after a selection (its internal onChange effect deps include the
  // inline options/onChange identities, and previousValue !== value stays true)
  // — which otherwise loops the gate (e.g. "attempt 3427"). Every other Select in
  // the wizard dodges this by navigating away on select; the gate stays on-step,
  // so we force a remount to reset the Select's internal value.
  const [gateActionSeq, setGateActionSeq] = useState(0)
  // Guards the one-shot Shown event + the initial fetch effect from re-firing
  // on every re-render while we're parked on verify-app.
  const verifyShownRef = useRef(false)
  const verifyFetchStartedRef = useRef(false)
  // Detection is synchronous (small files, no network); useMemo captures the
  // result for the lifetime of the component. redirectIfMismatch reads this to
  // decide whether to adopt the Release id (on mismatch). verify-app re-detects
  // FRESH from disk on each Continue, bypassing this memo.
  const detectedIds = useMemo(
    () => detectIosBundleIds({ cwd: process.cwd(), iosDir, capacitorAppId: iosBundleIdInitial }),
    [iosDir, iosBundleIdInitial],
  )
  // Shared sites that fan out into Apple-side work (end of import-scanning,
  // end of verifying-key) wrap their setStep call with this.
  //
  // The Release-config PRODUCT_BUNDLE_IDENTIFIER is authoritative for Apple
  // signing, and a differing capacitor.config.appId (the Capgo app key) is
  // EXPECTED — not an error — so we no longer interrupt with the confirm-app-id
  // prompt (which fired even before the .p8 was provided). Instead we silently
  // adopt the detected Release id for cert/profile/provisioning work and
  // continue. For app_store the authoritative check is verify-app (remote App
  // Store Connect verification); for ad_hoc the Release id is simply the build
  // id, used as-is.
  const redirectIfMismatch = (target: OnboardingStep): OnboardingStep => {
    if (appIdConfirmed)
      return target
    if (!detectedIds.mismatch)
      return target
    setIosBundleId(detectedIds.recommended.value)
    setAppIdConfirmed(true)
    if (detectedIds.recommended.value !== iosBundleIdInitial) {
      addLog(`ℹ Using "${detectedIds.recommended.value}" (your Xcode Release bundle ID) for Apple operations. capacitor.config.appId ("${iosBundleIdInitial}") is the Capgo app key and is left unchanged.`)
    }
    return target
  }

  // Telemetry: resolve org id once + emit per-step events
  const stepTimingRef = useRef<{ step: OnboardingStep | null, startedAt: number }>({
    step: null,
    startedAt: Date.now(),
  })
  // Buffer of telemetry events that occurred before `resolvedOrgId` landed.
  // Drained in order when the org id becomes available. Without this buffer,
  // any step transitions during the async org-id resolution (which involves
  // two HTTP round-trips: createSupabaseClient + getOrganizationId) would be
  // dropped from the funnel.
  const pendingTelemetryRef = useRef<Array<{
    step: OnboardingStep
    durationMs?: number
    durationStep?: OnboardingStep
    errorCategory?: OnboardingErrorCategory
  }>>([])
  const pendingActionTelemetryRef = useRef<Array<{
    step: OnboardingStep
    action: BuilderOnboardingAction
    tags?: Record<string, boolean | number | string>
  }>>([])
  const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(null)
  const resolvedApiKeyRef = useRef<string | null>(apikey ?? null)
  const orgIdResolvedRef = useRef(false)
  // Captures the mapped error category at handleError time so the telemetry
  // useEffect can pass it through without re-mapping a reconstructed Error
  // (which would have lost the .status / .phase / instanceof discriminators).
  const errorCategoryRef = useRef<OnboardingErrorCategory | undefined>(undefined)

  useEffect(() => {
    if (resolvedApiKeyRef.current)
      return
    const saved = findSavedKeySilent()
    if (saved)
      resolvedApiKeyRef.current = saved
  }, [])

  useEffect(() => {
    if (orgIdResolvedRef.current || !resolvedApiKeyRef.current)
      return
    orgIdResolvedRef.current = true

    let cancelled = false
    void (async () => {
      const supabase = await createSupabaseClient(resolvedApiKeyRef.current!, undefined, undefined, true)
        .catch(() => null)
      if (!supabase || cancelled)
        return
      const orgId = await getOrganizationId(supabase, appId).catch(() => null)
      if (orgId && !cancelled)
        setResolvedOrgId(orgId)
    })()

    return () => {
      cancelled = true
    }
  }, [appId])

  const [log, setLog] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [retryStep, setRetryStep] = useState<OnboardingStep | null>(null)
  // askOverwrite removed — credential check happens at start now
  const [duplicateProfiles, setDuplicateProfiles] = useState<Array<{ id: string, name: string, profileType: string }>>([])
  const [existingCerts, setExistingCerts] = useState<Array<{ id: string, name: string, serialNumber: string, expirationDate: string }>>([])
  const [certToRevoke, setCertToRevoke] = useState<string | null>(null)
  const pickerOpenedRef = useRef(false)
  const exitRequestedRef = useRef(false)
  // overwriteConfirmedRef removed — credential check happens at start now

  // Collected data — restore p8Path from progress if resuming
  const [p8Path, setP8Path] = useState(initialProgress?.p8Path || '')
  const [p8Content, _setP8Content] = useState('')
  // Resume order: verified key → explicitly saved keyId → re-derive from the saved
  // .p8 filename. The last fallback fixes the case where a previous session picked
  // the .p8 (saving only p8Path) and quit before confirming the Key ID step — the
  // field used to come back empty (showing the placeholder) instead of the real id.
  const [keyId, setKeyId] = useState(
    initialProgress?.completedSteps.apiKeyVerified?.keyId
    || initialProgress?.keyId
    || extractKeyIdFromP8Path(initialProgress?.p8Path || '')
    || '',
  )
  const [issuerId, setIssuerId] = useState(initialProgress?.completedSteps.apiKeyVerified?.issuerId || initialProgress?.issuerId || '')

  // Terminal dimensions, tracked in state so the wizard RE-RENDERS on resize.
  // This matters for the AI-analysis fit check: if the analysis fit inline
  // when the terminal was large and the user then shrinks it, we must
  // re-evaluate and route into the scrollable viewer — otherwise the
  // overflowing content is clipped by the alt buffer with no way to scroll.
  const { stdout } = useStdout()
  const [termSize, setTermSize] = useState<{ rows: number, cols: number }>({
    rows: stdout?.rows ?? 24,
    cols: stdout?.columns ?? 80,
  })
  useEffect(() => {
    if (!stdout)
      return
    const handler = (): void => setTermSize({ rows: stdout.rows ?? 24, cols: stdout.columns ?? 80 })
    stdout.on('resize', handler)
    return () => {
      stdout.off('resize', handler)
    }
  }, [stdout])
  const terminalRows = termSize.rows
  const terminalCols = termSize.cols

  // Measured height of the wizard body (everything below the Header). Drives
  // every fit decision from the LIVE rendered height — no hardcoded row
  // thresholds. The measurement is tagged with the step it was taken for, so
  // a stale measurement from a previous (taller) step can never wedge a new
  // (shorter) step into the too-small state: when the step changes the tagged
  // measurement no longer matches and `bodyHeight` falls back to null until
  // the new body is measured. `measureElement` only reports after a render,
  // so on the first frame of a step `bodyHeight` is null and we optimistically
  // render the box header; the next frame corrects if it doesn't fit
  // (one-frame flash, only on small terminals).
  const bodyRef = useRef<DOMElement | null>(null)
  // Body heights cached per (step, cols). A body's height in ROWS depends on
  // the step, its content, and the terminal WIDTH (wrapping) — but NOT on the
  // terminal HEIGHT. So once a step's comfortable height is measured at the
  // current width, a VERTICAL resize reuses it and the dense / header /
  // too-small decisions are made SYNCHRONOUSLY on the first frame. That kills
  // the measure-then-correct "flash" that used to fire on every resize: the
  // old code keyed `dense` off the live row count, so each resize reset to
  // comfortable, rendered (often overflowing), measured, then flipped back to
  // dense — a visible round-trip per resize tick. We cache the comfortable and
  // dense forms separately (each has its own height).
  const [bodyHeights, setBodyHeights] = useState<{ key: string, comfortable: number | null, dense: number | null }>(
    { key: '', comfortable: null, dense: null },
  )
  const fitKey = `${step}|${terminalCols}`
  const heights = bodyHeights.key === fitKey ? bodyHeights : { key: fitKey, comfortable: null, dense: null }

  // Collapse to the dense (compact-spacing) form only when the comfortable body
  // can't fit even with the one-line header. Derived synchronously from the
  // cached comfortable height; null (first frame of a step, or just after a
  // width change) renders comfortable so we can measure it.
  // Always render the comfortable form. The startup size gate (MinSizeGate)
  // guarantees the terminal is large enough, so the adaptive dense fallback is
  // unreachable — forcing it false removes the fragile measure→decide coupling
  // and the degraded small-terminal UX. (The dense branches in the step
  // components + the measure machinery are now dead code, cleaned up next.)
  const dense = false

  // Measure whichever form is on screen and cache it (only when missing or
  // changed — so this settles and doesn't re-render in a loop).
  useEffect(() => {
    if (!bodyRef.current)
      return
    const { height } = measureElement(bodyRef.current)
    if (height <= 0)
      return
    const form = dense ? 'dense' : 'comfortable'
    setBodyHeights((prev) => {
      const base = prev.key === fitKey ? prev : { key: fitKey, comfortable: null, dense: null }
      if (base[form] === height)
        return prev
      return { ...base, [form]: height }
    })
  })

  // Header degrades box → one-line from the COMFORTABLE height (the upper
  // bound), so the choice is synchronous and never overflows. When dense is
  // active the comfortable body already didn't fit the one-line header, so this
  // is always true then — dense always pairs with the one-line header.
  const headerCompact = heights.comfortable != null
    && (heights.comfortable + BOX_HEADER_ROWS + WIZARD_PADDING_ROWS > terminalRows)
  const bodyHeight = dense ? heights.dense : heights.comfortable

  // Rows available for the completed-steps log. The log renders OUTSIDE the
  // measured body (so its growth never inflates the dense/fit decision) and
  // fills only what the current step leaves: terminal minus header, padding,
  // the measured step body, and the log's own top margin. capLogRows then packs
  // the most recent entries and summarizes the rest — so a long history never
  // pushes the current step off-screen or trips the resize prompt. Before the
  // body is measured (bodyHeight null) we show all entries and let the next
  // frame settle (same one-frame entry behaviour as the fit decision).
  const logHeaderRows = headerCompact ? COMPACT_HEADER_ROWS : BOX_HEADER_ROWS
  const logMaxRows = bodyHeight != null
    ? logBudgetRows(terminalRows, logHeaderRows, bodyHeight)
    : Number.POSITIVE_INFINITY

  // Refs to avoid stale closures in useEffect async handlers
  const p8ContentRef = useRef(p8Content)
  const p8PathRef = useRef(p8Path)
  const keyIdRef = useRef(keyId)
  const issuerIdRef = useRef(issuerId)
  // Lets the asc-key-generating effect's cleanup kill the guided helper child
  // when the user quits the TUI (otherwise the helper's pipes hang the CLI).
  const ascHelperAbortRef = useRef<AbortController | null>(null)

  // Wrapper that keeps both state and ref in sync
  const setP8Content = useCallback((val: string) => {
    p8ContentRef.current = val
    _setP8Content(val)
  }, [])

  // Keep refs in sync when state changes (for state set directly)
  useEffect(() => {
    p8PathRef.current = p8Path
  }, [p8Path])
  useEffect(() => {
    keyIdRef.current = keyId
  }, [keyId])
  useEffect(() => {
    issuerIdRef.current = issuerId
  }, [issuerId])

  // Emit telemetry on every step transition (including initial mount).
  // Sequencing:
  //   1. If `resolvedOrgId` just became available, drain the backlog first.
  //   2. Skip same-step re-renders (orgId-lands triggers a re-fire — we don't
  //      want to re-emit the current step, only drain the backlog).
  //   3. Otherwise compute the new event, then either emit immediately (orgId
  //      available) or queue it (orgId still loading).
  useEffect(() => {
    if (!resolvedApiKeyRef.current)
      return

    const previous = stepTimingRef.current
    const isDuplicateStep = previous.step !== null && previous.step === step && step !== 'error'

    // (1) Drain the backlog if org id is now available, even when the current
    // step is a duplicate (e.g., this effect fired because resolvedOrgId moved
    // from null to a real value, not because step changed).
    if (resolvedOrgId && pendingTelemetryRef.current.length > 0) {
      for (const queued of pendingTelemetryRef.current) {
        void trackBuilderOnboardingStep({
          apikey: resolvedApiKeyRef.current,
          appId,
          orgId: resolvedOrgId,
          platform: 'ios',
          ...queued,
        })
      }
      pendingTelemetryRef.current = []
    }
    if (resolvedOrgId && pendingActionTelemetryRef.current.length > 0) {
      for (const queued of pendingActionTelemetryRef.current) {
        void trackBuilderOnboardingAction({
          apikey: resolvedApiKeyRef.current,
          appId,
          orgId: resolvedOrgId,
          platform: 'ios',
          ...queued,
        })
      }
      pendingActionTelemetryRef.current = []
    }

    // (2) Now safely skip the duplicate-step path.
    if (isDuplicateStep)
      return

    const now = Date.now()
    // Initial step (previous.step === null) and same-step error re-entries have
    // no meaningful previous-step duration.
    const durationStep = previous.step === null || previous.step === step
      ? undefined
      : previous.step
    const durationMs = durationStep === undefined
      ? undefined
      : now - previous.startedAt

    const eventPayload = {
      step,
      durationMs,
      durationStep,
      errorCategory: step === 'error' ? errorCategoryRef.current : undefined,
    }

    stepTimingRef.current = { step, startedAt: now }

    // (3) Either fire immediately or buffer.
    if (resolvedOrgId) {
      void trackBuilderOnboardingStep({
        apikey: resolvedApiKeyRef.current,
        appId,
        orgId: resolvedOrgId,
        platform: 'ios',
        ...eventPayload,
      })
    }
    else {
      pendingTelemetryRef.current.push(eventPayload)
    }
  }, [step, appId, resolvedOrgId, error])

  // Emit a named "Builder Onboarding Action" event (distinct from the per-step
  // funnel). Mirrors the Android helper: fires immediately once the org id is
  // resolved, otherwise buffers until the resolver lands (drained in the
  // telemetry effect above). Never throws — telemetry must not break the wizard.
  const trackAction = useCallback(
    (
      action: BuilderOnboardingAction,
      tags?: Record<string, boolean | number | string>,
      actionStep: OnboardingStep = step,
    ): void => {
      if (!resolvedApiKeyRef.current)
        return

      const payload = { step: actionStep, action, tags }
      if (resolvedOrgId) {
        void trackBuilderOnboardingAction({
          apikey: resolvedApiKeyRef.current,
          appId,
          orgId: resolvedOrgId,
          platform: 'ios',
          ...payload,
        })
      }
      else {
        pendingActionTelemetryRef.current.push(payload)
      }
    },
    [appId, resolvedOrgId, step],
  )
  const [teamId, setTeamId] = useState(initialProgress?.completedSteps.certificateCreated?.teamId || '')
  const [certData, setCertData] = useState<CertificateData | null>(initialProgress?.completedSteps.certificateCreated || null)
  const [profileData, setProfileData] = useState<ProfileData | null>(initialProgress?.completedSteps.profileCreated || null)
  const [buildUrl, setBuildUrl] = useState('')
  const [buildOutput, setBuildOutput] = useState<string[]>([])
  const [supportBundlePath, setSupportBundlePath] = useState<string | null>(null)
  // ── Contact-support confirmation gate. `supportConfirmMessage` holds the
  // platform-aware copy passed up by contactSupport(); the Select resolves
  // `supportConfirmResolveRef` with the user's yes/no choice. `support-confirm`
  // always returns to the 'error' step afterwards so the failure menu stays
  // reachable whether the user proceeds or cancels.
  const [supportConfirmMessage, setSupportConfirmMessage] = useState<string>('')
  const supportConfirmResolveRef = useRef<((proceed: boolean) => void) | null>(null)
  // The exact bundle that will be sent — shown in a scrollable viewer when the
  // user picks "View logs first" from the confirm step.
  const [supportLogLines, setSupportLogLines] = useState<string[]>([])
  const supportLogPathRef = useRef<string>('')
  // Message for the support spinner step — reused for both "preparing the bundle"
  // (gzip/trim can take a moment on a large build) and the network upload.
  const [supportBusyText, setSupportBusyText] = useState('Uploading your logs to Capgo support…')
  // ── AI-analysis sub-flow (entered only when the build fails and logs were
  // captured). `aiJobId` is set when entering 'ai-analysis-prompt'; the running
  // step reads it to call runCapgoAiAnalysis; the result step renders one of
  // these two state strings depending on the PostAnalyzeResult kind.
  // `aiRetryCount` tracks how many "I fixed it, retry" attempts the user has
  // used so we can cap them at MAX_AI_RETRIES.
  // `aiViewedFull` flips true once the user has dismissed the scrollable
  // FullscreenAiViewer for the current analysis — prevents 'ai-analysis-result'
  // from immediately re-routing back into the scroll step on every render.
  const [aiJobId, setAiJobId] = useState<string | null>(null)
  const [aiAnalysisText, setAiAnalysisText] = useState<string | null>(null)
  // Live ANSI preview of the streaming analysis, shown in the running step.
  // Throttled (~250ms) so per-token updates don't re-render the whole tree.
  const [aiStreamPreview, setAiStreamPreview] = useState('')
  // Non-success outcome (already_analyzed / too_big / error) rendered as a
  // prominent coloured banner. Mutually exclusive with `aiAnalysisText` — a
  // successful analysis sets the text and clears this; every other outcome
  // clears the text and sets this. Kept as one object so kind + message can
  // never drift out of sync.
  const [aiResult, setAiResult] = useState<{ kind: AiResultKind, message: string } | null>(null)
  const [aiRetryCount, setAiRetryCount] = useState(0)
  const [aiViewedFull, setAiViewedFull] = useState(false)
  const [errorViewedFull, setErrorViewedFull] = useState(false)
  const [ciSecretEntries, setCiSecretEntries] = useState<CiSecretEntry[]>([])
  const [ciSecretTargets, setCiSecretTargets] = useState<CiSecretTarget[]>([])
  const [ciSecretTarget, setCiSecretTarget] = useState<CiSecretTarget | null>(null)
  const [ciSecretSetupAdvice, setCiSecretSetupAdvice] = useState<CiSecretSetupAdvice[]>([])
  const [ciSecretExistingKeys, setCiSecretExistingKeys] = useState<string[]>([])
  // Concrete `owner/repo` for GitHub (or group/project for GitLab). Resolved
  // in checking-ci-secrets via `gh repo view`. Shown in confirm-secrets-push
  // so the user knows EXACTLY which repo they're about to mutate — never let
  // `gh secret set` run without an explicit "yes, push to <repo>" gate.
  const [ciSecretRepoLabel, setCiSecretRepoLabel] = useState<string | null>(null)
  // Sub-phase text rendered next to the spinner during `checking-ci-secrets`
  // and `uploading-ci-secrets`. Updated as each gh command starts so the user
  // sees actual progress instead of a single static "Checking…" line that
  // freezes for several seconds while gh works.
  const [ciSecretCheckPhase, setCiSecretCheckPhase] = useState<string>('Resolving GitHub repository…')
  const [ciSecretUploadProgress, setCiSecretUploadProgress] = useState<{ current: number, total: number, key: string } | null>(null)
  // Package manager chosen by the user at pick-package-manager. We DETECT via
  // getPMAndCommand() but the user gets the final say — they may have multiple
  // lockfiles, prefer a different runner, or be on an exotic setup.
  const [selectedPackageManager, setSelectedPackageManager] = useState<PackageManager | null>(null)
  // preview-workflow-file viewer state. The large diff is only shown in the
  // bounded `view-workflow-diff` live Ink screen.
  const [previewDiff, setPreviewDiff] = useState<DiffLine[]>([])
  const [previewExistingPath, setPreviewExistingPath] = useState<string | null>(null)
  const [previewIsNew, setPreviewIsNew] = useState(true)
  const [previewTelemetry, setPreviewTelemetry] = useState<WorkflowDiffTelemetry | null>(null)
  const [ciSecretError, setCiSecretError] = useState<string | null>(null)
  const [ciSecretUploadSummary, setCiSecretUploadSummary] = useState<string | null>(null)
  // GitHub Actions workflow setup state. setupMode tracks the 3-way choice at
  // ask-github-actions-setup. After a successful secrets upload, with-workflow
  // continues into pick-build-script + writing-workflow-file; secrets-only
  // exits via build-complete; declined branches to ask-export-env.
  const [setupMode, setSetupMode] = useState<'undecided' | 'with-workflow' | 'secrets-only' | 'declined'>('undecided')
  const [availableScripts, setAvailableScripts] = useState<Record<string, string>>({})
  const [recommendedScript, setRecommendedScript] = useState<string | null>(null)
  const [buildScriptChoice, setBuildScriptChoice] = useState<BuildScriptChoice | null>(null)
  const [workflowWrittenPath, setWorkflowWrittenPath] = useState<string | null>(null)
  const [envExportPath, setEnvExportPath] = useState<string | null>(null)
  const [envExportError, setEnvExportError] = useState<string | null>(null)
  const [envExportTargetPath, setEnvExportTargetPath] = useState<string>('')
  // The raw saved credentials, retained in memory so the .env export can read
  // the same field set that doSaveCredentials wrote to disk — without CAPGO_TOKEN
  // (which only belongs in the CI-secrets push, not in a .env meant for the
  // developer's local reference).
  const [savedCredentials, setSavedCredentials] = useState<Partial<BuildCredentials> | null>(null)

  // Import-existing sub-flow state (macOS only)
  const [importMatches, setImportMatches] = useState<IdentityProfileMatch[]>([])
  // Setter only — the value isn't read in render (we use importMatches for
  // display) but we keep the state hook so future refs stay stable and any
  // pending update calls in import-scanning useEffect remain valid.
  const [, setImportProfiles] = useState<DiscoveredProfile[]>([])
  const [chosenIdentity, setChosenIdentity] = useState<SigningIdentity | null>(null)
  const [chosenProfile, setChosenProfile] = useState<DiscoveredProfile | null>(null)
  // Hydrate importDistribution from progress so resumed sessions don't lose
  // the user's earlier choice. Without this, `doSaveCredentials`'s
  // `needsAscKey = !importMode || importDistribution === 'app_store'` would
  // take the wrong branch (e.g. saving ad_hoc credentials with APPLE_KEY_*
  // fields).
  const [importDistribution, setImportDistribution] = useState<'app_store' | 'ad_hoc' | null>(
    initialProgress?.importDistribution ?? null,
  )
  const [importedP12Password, setImportedP12Password] = useState<string>('')
  /**
   * Tracks whether we're in the import flow so saving-credentials knows which
   * writer to use AND so `verifying-key` routes back to import-pick-identity
   * instead of creating-certificate.
   *
   * MUST be hydrated from progress — without this, a CLI restart mid-import-flow
   * lands the user back at `verifying-key` (or wherever getResumeStep chose)
   * with importMode=false, which silently re-routes them into the create-new
   * path. That's the exact failure mode Codex caught: a resumed app_store
   * import would re-verify .p8, then try to CREATE a new distribution cert
   * via Apple — exactly the cert-limit blow-up users hit before this fix.
   */
  const [importMode, setImportMode] = useState(initialProgress?.setupMethod === 'import-existing')
  /**
   * When the user hits no-match recovery in ad_hoc mode and needs to provide a
   * .p8 inline for an action, this records the action to resume *after* the
   * .p8 → verifying-key chain completes. `null` means there's no pending action
   * (i.e. .p8 was the entry point for app_store, not a recovery side-trip).
   */
  // The 'fetching-profile' variant was removed alongside the Rescan
  // recovery option (commit 36a7c282) — the file picker covers that path.
  const [pendingRecoveryAction, setPendingRecoveryAction] = useState<'create-profile-only' | null>(null)
  // Why the wizard ended up at `import-no-match-recovery`. Set right before
  // each setStep call that routes there so the step can render an Alert
  // sentence that names the actual cause (Apple-no-cert, bundle mismatch,
  // distribution mismatch, …) instead of the legacy "no profile on disk"
  // wording that contradicted the yellow log line for the Apple-side
  // routes. Back-nav into the recovery menu (file picker cancel, "open
  // portal anyway", explainer back) intentionally does NOT overwrite this
  // — the user is bouncing through, not changing the underlying cause.
  // `null` falls back to the legacy wording so the back-compat default
  // matches every untracked call site.
  const [noMatchReason, setNoMatchReason] = useState<NoMatchReason | null>(null)
  // Guard against re-opening the native picker on every re-render. Reset
  // whenever we leave the import-provide-profile-path step.
  const mobileprovisionPickerOpenedRef = useRef(false)
  // Per-identity Apple-side availability — keyed by Keychain SHA1. Populated
  // by the `import-validating-all-certs` step useEffect when we have a
  // verified API key. Empty map = no eager check performed (e.g. ad_hoc
  // users without .p8); the picker falls back to a single-list layout.
  const [identityAvailability, setIdentityAvailability] = useState<Record<string, EnrichedIdentityAvailability>>({})
  // Per-identity Apple-side PROFILE prefetch state. Fires in parallel right
  // after the eager batch cert validation completes — see the trigger at the
  // tail of `import-validating-all-certs` below. Discriminated union (not
  // `any`) so the cell-render branch narrows via `state.kind` without casts.
  // The `available` variant carries no payload because the profiles get
  // injected directly into `importMatches` (the existing `matchCount > 0`
  // check then naturally renders the cell as green AVAILABLE — see the
  // table-row builder near line ~3066).
  const [profilePrefetch, setProfilePrefetch] = useState<Record<string, { kind: 'pending' | 'available' | 'unavailable' | 'timeout' | 'error' }>>({})
  // Braille-spinner frame counter for the per-row "checking…" cell. Ticks
  // only while at least one prefetch is still pending — gated by the
  // dedicated useEffect below — so the interval is cleaned up the instant
  // every cell has resolved.
  const [spinnerFrame, setSpinnerFrame] = useState(0)
  // Guard against the prefetch trigger re-firing on every re-render of the
  // `import-validating-all-certs` effect. The effect re-runs on `step`
  // changes, but we want fetches to fire exactly once per eager-batch pass.
  // Cleared by `resetForFreshStart` so a Restart can re-trigger cleanly.
  const prefetchTriggeredRef = useRef(false)
  // Generation counter for in-flight prefetches. Captured per fetch closure
  // at fire time; checked before any setState. Bumped by resetForFreshStart
  // to invalidate prior in-flight work without setStating into a fresh
  // wizard. We CANNOT reuse the step-useEffect's `cancelled` flag here —
  // that flag is tripped the instant we `setStep('import-pick-identity')`
  // because React runs the previous effect's cleanup BEFORE the next
  // effect's body. Tying prefetch lifetime to the cleanup would mean every
  // fetch resolves after the cleanup has already cancelled it, so the
  // spinner would spin forever. The generation counter only changes on
  // explicit resets, so prefetches outlive step transitions.
  const prefetchGenerationRef = useRef(0)
  // Result of the per-identity Apple-side cert lookup for the currently
  // chosen identity. `undefined` = not yet checked; `null` = Apple has no
  // matching cert; `string` = Apple's resource id (reused downstream).
  // Set by the import-checking-apple-cert handler; cleared on each pick.
  // The value isn't currently read elsewhere — the underscore-prefixed
  // declaration is kept so future code paths (e.g. an enhanced recovery
  // menu that gates "Create new" on whether Apple actually has the cert)
  // can wire in without re-introducing state.
  const [_appleCertIdForChosen, setAppleCertIdForChosen] = useState<string | null | undefined>(undefined)
  /**
   * Records which step triggered the shared `duplicate-profile-prompt` so the
   * `deleting-duplicate-profiles` handler routes the retry correctly. Without
   * this, an import-flow duplicate (raised from `import-create-profile-only`)
   * would retry `creating-profile` — the create-new path — which can't
   * succeed in import mode because `certData.certificateId` is never set.
   */
  const [duplicateProfileOrigin, setDuplicateProfileOrigin] = useState<'creating-profile' | 'import-create-profile-only'>('creating-profile')

  const addLog = useCallback((text: string, color = 'green') => {
    // Mirror every activity-log line into the support bundle's internal log.
    appendInternalLog(text)
    setLog((prev) => {
      // Drop a consecutive duplicate: completed-step breadcrumbs are idempotent,
      // so the same line twice in a row is always spam, never information. Guards
      // against the log filling with repeats if a hydration replay / re-render
      // fires it more than once. (Mirrors the Android sibling.)
      const last = prev[prev.length - 1]
      if (last && last.text === text && last.color === color)
        return prev
      return [...prev, { text, color }]
    })
  }, [])

  // Persist every step transition so the support bundle carries the full onboarding
  // trace, not just whatever screen the user was on when they hit Email support.
  useEffect(() => {
    appendInternalLog(`step → ${step}`)
  }, [step])

  /**
   * Field-update breadcrumb: write/replace a single log entry identified by a
   * stable prefix, so navigating back and re-picking the same field doesn't
   * stack duplicate lines. Unlike `addLog`'s consecutive-dedupe, this scans
   * the WHOLE log for any entry starting with `prefix` — so even when other
   * lines have been emitted between picks, only one "Distribution · …" /
   * "Key ID · …" / "Issuer ID · …" entry survives.
   *
   * Pre-merge our PR shipped this for Key ID / Issuer ID edits; the rewrite
   * dropped it. Restored here to fix the "Distribution · ad_hoc twice"
   * report after the user back-navigates the import flow.
   */
  const upsertLog = useCallback((prefix: string, text: string, color = 'green') => {
    setLog((prev) => {
      const idx = prev.findIndex(e => e.text.startsWith(prefix))
      if (idx >= 0) {
        if (prev[idx].text === text && prev[idx].color === color)
          return prev
        const next = [...prev]
        next[idx] = { text, color }
        return next
      }
      // No existing entry — append, with the same consecutive-dedupe guard.
      const last = prev[prev.length - 1]
      if (last && last.text === text && last.color === color)
        return prev
      return [...prev, { text, color }]
    })
  }, [])

  // Best-effort PostHog telemetry for the verify-app step. Mirrors
  // builder-cta.ts's trackEvent usage (channel 'bundle') and ALWAYS sets
  // `step` (the Builder dashboard filters null steps out of funnels via
  // JSONExtractString — an unset step silently drops the event). Never
  // blocks or throws into the wizard.
  const trackVerifyEvent = useCallback((
    event: string,
    icon: string,
    tags: Record<string, string | number | boolean> = {},
  ) => {
    void trackEvent({
      channel: 'bundle',
      event,
      icon,
      apikey: resolvedApiKeyRef.current ?? apikey ?? undefined,
      appId,
      orgId: resolvedOrgId ?? undefined,
      tags: { step: 'ios-app-verify', platform: 'ios', mode: 'app_store', ...tags },
    })
  }, [appId, apikey, resolvedOrgId])

  // Persist the verified Release build id as the iosBundleIdOverride. After the
  // gate passes the wired-in value is always a build id that both the project
  // produces AND the App Store has, so cert/profile creation, ensureBundleId and
  // the provisioning_map all key off the right identifier. Also snapshots the
  // current config.appId so a later run can detect context drift and re-verify.
  // Marks the app id as confirmed so redirectIfMismatch doesn't re-adopt later.
  const persistVerifyOverride = useCallback(async (releaseBundleId: string) => {
    setIosBundleId(releaseBundleId)
    setAppIdConfirmed(true)
    const existing = await loadProgress(appId) || {
      platform: 'ios' as const,
      appId,
      startedAt: new Date().toISOString(),
      completedSteps: {},
    }
    existing.iosBundleIdOverride = releaseBundleId
    existing.iosBundleIdContextAppId = iosBundleIdInitial
    await saveProgress(appId, existing)
  }, [appId, iosBundleIdInitial])

  const pm = getPMAndCommand()
  const addIosCommand = formatRunnerCommand(pm.runner, ['cap', 'add', 'ios'])
  const syncIosCommand = formatRunnerCommand(pm.runner, ['cap', 'sync', 'ios'])
  const doctorCommand = formatRunnerCommand(pm.runner, ['@capgo/cli@latest', 'doctor'])
  const buildInitCommand = formatRunnerCommand(pm.runner, ['@capgo/cli@latest', 'build', 'init'])
  const buildRequestCommand = formatRunnerCommand(pm.runner, ['@capgo/cli@latest', 'build', 'request', appId, '--platform', 'ios'])
  const loginCommand = formatRunnerCommand(pm.runner, ['@capgo/cli@latest', 'login'])

  const trackWorkflowEvent = (
    event: BuildOnboardingWorkflowEvent,
    options: { decision?: BuildOnboardingWorkflowDecision, diff?: DiffLine[], isNew?: boolean } = {},
  ) => {
    const telemetry = options.diff
      ? getWorkflowDiffTelemetry(options.diff, options.isNew ?? previewIsNew)
      : (previewTelemetry ?? getWorkflowDiffTelemetry(previewDiff, options.isNew ?? previewIsNew))

    trackBuildOnboardingWorkflowEvent({
      event,
      appId,
      platform: 'ios',
      apikey,
      packageManager: selectedPackageManager ?? normalizePackageManager(pm.pm),
      buildScriptType: buildScriptChoice?.type,
      decision: options.decision,
      ...telemetry,
    })
  }

  const exitOnboarding = useCallback((message?: string) => {
    if (exitRequestedRef.current)
      return
    exitRequestedRef.current = true
    if (message)
      addLog(message, 'yellow')
    setTimeout(exit, 50)
  }, [addLog, exit])

  // Open browser on Ctrl+O (FilteredTextInput ignores ctrl keys, so no conflict)
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      process.kill(process.pid, 'SIGINT')
      return
    }

    // build-complete is the terminal success screen; it deliberately does not
    // auto-exit (that would wipe the frame on the alt-screen before it can be
    // read). Dismiss on Enter/Esc/q so it lasts until the user is ready.
    if (step === 'build-complete' && isBuildCompleteDismissKey(input, key)) {
      exit()
      return
    }

    if (key.ctrl && input === 'o' && (step === 'api-key-instructions' || step === 'input-issuer-id')) {
      open('https://appstoreconnect.apple.com/access/integrations/api')
    }

    // preview-workflow-file: Esc skips without writing. Arrows/Enter are
    // handled by the Ink Select below the diff.
    if (step === 'preview-workflow-file' && key.escape) {
      trackWorkflowEvent('workflow-preview-action', { decision: 'escape' })
      setPreviewDiff([])
      setStep('build-complete')
    }
  })

  /** Save partial progress so the user can resume mid-flow */
  const savePartialProgress = useCallback(async (updates: { p8Path?: string, keyId?: string, issuerId?: string }) => {
    const existing = await loadProgress(appId) || {
      platform: 'ios' as const,
      appId,
      startedAt: new Date().toISOString(),
      completedSteps: {},
    }
    // Build a new object rather than mutating the loaded one (immutability).
    const next = { ...existing }
    if (updates.p8Path !== undefined)
      next.p8Path = updates.p8Path
    if (updates.keyId !== undefined)
      next.keyId = updates.keyId
    if (updates.issuerId !== undefined)
      next.issuerId = updates.issuerId
    await saveProgress(appId, next)
  }, [appId])

  // Persist which .p8 source the user picked in the create-new fork so a
  // quit-and-resume routes back to the same path (see getResumeStep): an
  // `automated` user resumes on the guided helper, a `manual` user on the .p8
  // instructions. Best-effort — a missing progress file just means a fresh run.
  const persistP8CreateMethod = useCallback(async (method: 'automated' | 'manual') => {
    const existing = await loadProgress(appId)
    if (!existing)
      return
    await saveProgress(appId, { ...existing, p8CreateMethod: method })
  }, [appId])

  /**
   * Reset everything for a fresh-start onboarding pass. Called from:
   *   • the ErrorStep restart handler (existing user-facing "Restart" option),
   *   • the resume-prompt restart handler (new mount-time "start over" branch).
   *
   * Wipes the on-disk progress file AND every piece of in-memory state that
   * could otherwise leak across into the next attempt (chosen identity/profile,
   * import distribution, ASC key inputs' cert/profile outputs, the eager
   * per-cert availability map, file-picker guards, error/retry plumbing, and
   * the iOS bundle id confirmation gate). Does NOT addLog or setStep — the
   * caller picks the user-facing message and the next step so each call site
   * can phrase its breadcrumb differently.
   */
  const resetForFreshStart = useCallback(async () => {
    await deleteProgress(appId).catch(() => { /* best-effort */ })
    // Import-flow state
    setImportMode(false)
    setImportMatches([])
    setImportProfiles([])
    setChosenIdentity(null)
    setChosenProfile(null)
    setImportDistribution(null)
    setImportedP12Password('')
    setPendingRecoveryAction(null)
    // ASC API key inputs (state + their refs). Without this a Restart
    // that follows a partial .p8 flow would carry the previous run's
    // p8 path / Key ID / Issuer ID into the next pass. The state
    // setters trigger the existing useEffect([state]) sync to the
    // refs on the next render — but resetForFreshStart is called
    // immediately before setStep('welcome') which fires the React
    // render that triggers them. We also set the refs directly here
    // so any sync code between this call and the next render (e.g.
    // a subsequent setStep on an alternate restart path) sees clean
    // values rather than stale.
    setP8Path('')
    setP8Content('') // wrapper updates p8ContentRef too
    setKeyId('')
    setIssuerId('')
    setTeamId('')
    p8PathRef.current = ''
    keyIdRef.current = ''
    issuerIdRef.current = ''
    // Eager per-identity Apple-side availability cache. The previous restart
    // handler missed this — after restart the picker would still see the prior
    // run's per-cert reasons. Reset so the next batch validation starts clean.
    setIdentityAvailability({})
    // Per-identity PROFILE prefetch state + its one-shot guard. Without the
    // ref reset, a Restart followed by a re-enter would early-out of the
    // prefetch trigger and leave every AVAILABLE row stuck rendering as
    // UNAVAILABLE (no prefetch fires, no profiles injected).
    setProfilePrefetch({})
    prefetchTriggeredRef.current = false
    // Bump the generation so any prefetch fetches still in flight from a
    // pre-restart pass invalidate themselves before they hit setState —
    // otherwise they'd write stale 'available'/'unavailable' entries into
    // the freshly-emptied prefetch map AFTER the user has already restarted.
    prefetchGenerationRef.current += 1
    // Credential outputs
    setCertData(null)
    setProfileData(null)
    // Error / retry plumbing
    setError(null)
    errorCategoryRef.current = undefined
    setRetryCount(0)
    setSupportBundlePath(null)
    // File-picker re-open guards
    pickerOpenedRef.current = false
    mobileprovisionPickerOpenedRef.current = false
    // iOS bundle id resolution — reset so a restart re-resolves the authoritative
    // Release bundle id from scratch (redirectIfMismatch / verify-app set these
    // again) rather than keeping a stale override from the aborted run.
    setIosBundleId(iosBundleIdInitial)
    setAppIdConfirmed(false)
    // No-match recovery context — without this a restart would carry the
    // previous run's reason into the next pass and surface the wrong
    // bundle/distribution/profile-source wording in the recovery alert.
    setNoMatchReason(null)
    // After a Restart, if the user re-enters the import flow and picks
    // Ad Hoc again, they should see the support hint fresh — otherwise
    // the previous session's emission would mute a hint that's now
    // newly relevant.
    adHocHintShownRef.current = false
    // verify-app (remote App Store verification) — reset the one-shot guards and
    // all step state so a Restart that re-enters verify-app re-runs the initial
    // fetch instead of finding verifyFetchStartedRef already true and freezing on
    // a blank/stale gate.
    verifyShownRef.current = false
    verifyFetchStartedRef.current = false
    setPendingVerifyNext(null)
    setVerifyAppLoading(false)
    setVerifyReleaseBundleId('')
    setVerifyDebugBundleId('')
    setVerifyApps([])
    setVerifyRegisteredIds([])
    setVerifyPath(null)
    setVerifyChosenApp(null)
    setVerifyAttempt(0)
    setVerifyAskReopen(false)
    setGateActionSeq(0)
  }, [appId, iosBundleIdInitial])

  // Extract Key ID from .p8 filename — delegates to the module-level helper so
  // the resume initializer and the live-pick handlers share one implementation.
  const extractKeyIdFromPath = extractKeyIdFromP8Path

  /**
   * Get a fresh JWT token, re-reading the .p8 file if needed.
   * Uses refs to avoid stale closure issues.
   */
  /**
   * Special error to signal the UI should redirect to .p8 input.
   */
  class NeedP8Error extends Error {
    constructor() {
      super('Need .p8 file')
      this.name = 'NeedP8Error'
    }
  }

  async function getFreshToken(): Promise<string> {
    let content = p8ContentRef.current
    if (!content && p8PathRef.current) {
      try {
        content = await readFile(p8PathRef.current, 'utf-8')
        setP8Content(content)
      }
      catch (err) {
        appendInternalLog(`saved .p8 no longer readable, re-prompting: ${err instanceof Error ? err.message : String(err)}`)
        // Saved p8Path was moved, deleted, or is no longer readable since
        // the previous run. Convert to NeedP8Error so handleError routes
        // the user back to api-key-instructions for a clean re-prompt
        // rather than surfacing a raw ENOENT support-bundle screen.
        throw new NeedP8Error()
      }
    }
    if (!content) {
      throw new NeedP8Error()
    }
    return generateJwt(keyIdRef.current, issuerIdRef.current, content)
  }

  // Has the ad-hoc support hint been logged this session? Both the
  // hydration replay (used when resuming a saved ad_hoc run via the
  // Continue button) AND the distribution-mode onChange (used when the
  // user picks Ad Hoc fresh) want to surface it — but addLog's dedupe
  // only suppresses CONSECUTIVE duplicates, so an interleaved log line
  // (e.g. `✔ Distribution · ad_hoc` between the two emissions) breaks
  // the dedupe and the hint prints twice. A session-scoped ref handles
  // both call sites uniformly.
  const adHocHintShownRef = useRef(false)
  const logAdHocSupportHint = useCallback(() => {
    if (adHocHintShownRef.current)
      return
    adHocHintShownRef.current = true
    addLog('ℹ️  Ad-hoc is more involved than App Store — you also need to register every device on Apple.', 'yellow')
    addLog('   Want hands-on help? Email support@capgo.app and we\'ll walk you through it.', 'yellow')
  }, [addLog])

  // Re-emit the breadcrumb entries the user "earned" before this session
  // — partial inputs (p8 path, key id, issuer id), completed steps
  // (apiKeyVerified, certificateCreated, profileCreated), and the
  // ad-hoc-needs-help hint when applicable. Wrapped in a useCallback so
  // both the mount-time path AND the resume-prompt "Continue" handler can
  // call it. We DON'T want this firing while the user is still on the
  // resume-prompt screen — the side log would fill with stale entries
  // BEFORE the user has chosen Continue vs Restart, and picking Restart
  // would leave those entries dangling next to a fresh wizard. addLog's
  // consecutive-dedupe protects against accidental double calls.
  const hydrateCompletedLog = useCallback(() => {
    if (!initialProgress)
      return
    // Distribution mode is the upstream-most import-flow field — surface it
    // first so the resumed breadcrumb mirrors the order a user would see on
    // a fresh run (Distribution → Key file → Key ID → Issuer ID → …).
    // Without this the hydration replay was emitting the ad-hoc support hint
    // (which is gated on importDistribution === 'ad_hoc') WITHOUT first
    // emitting the "✔ Distribution · ad_hoc" line that explains why the
    // hint exists — surprising the user with the support breadcrumb out
    // of context.
    if (initialProgress.importDistribution)
      upsertLog('✔ Distribution · ', `✔ Distribution · ${initialProgress.importDistribution}`)
    if (initialProgress.p8Path)
      upsertLog('✔ Key file selected · ', `✔ Key file selected · ${initialProgress.p8Path}`)
    if (initialProgress.keyId && !initialProgress.completedSteps.apiKeyVerified)
      upsertLog('✔ Key ID · ', `✔ Key ID · ${initialProgress.keyId}`)
    if (initialProgress.issuerId && !initialProgress.completedSteps.apiKeyVerified)
      upsertLog('✔ Issuer ID · ', `✔ Issuer ID · ${initialProgress.issuerId}`)
    const { completedSteps } = initialProgress
    if (completedSteps.apiKeyVerified)
      addLog(`✔ API Key verified — Key: ${completedSteps.apiKeyVerified.keyId}`)
    if (completedSteps.certificateCreated)
      addLog(`✔ Distribution certificate created — Expires ${completedSteps.certificateCreated.expirationDate}`)
    if (completedSteps.profileCreated)
      addLog(`✔ Provisioning profile created — "${completedSteps.profileCreated.profileName}"`)
    if (initialProgress.importDistribution === 'ad_hoc' && !completedSteps.profileCreated)
      logAdHocSupportHint()
  }, [initialProgress, addLog, logAdHocSupportHint])

  // Mount-time hydration. Suppressed when the initial step is the
  // resume-prompt fork — that path defers hydration to the user's
  // explicit Continue choice (see the resume-prompt onChange below).
  // The trivial-progress paths (welcome / no progress) still hydrate
  // here so any partial input the user had keeps its breadcrumb.
  const skipMountHydrationRef = useRef(step === 'resume-prompt')
  useEffect(() => {
    if (skipMountHydrationRef.current)
      return
    hydrateCompletedLog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleError = useCallback((err: unknown, failedStep: OnboardingStep) => {
    // If we need the .p8 file, redirect to the input step
    if (err instanceof NeedP8Error) {
      addLog('ℹ️  We need your .p8 key file to continue.', 'yellow')
      setStep('api-key-instructions')
      return
    }
    // Capture the mapped category BEFORE we collapse err to a string.
    // The telemetry useEffect will read this ref instead of re-mapping a
    // reconstructed `new Error(message)` (which has no discriminators).
    errorCategoryRef.current = mapIosOnboardingError(err, failedStep)
    const message = err instanceof Error ? err.message : String(err)
    const nextRetryCount = retryCount + 1
    const bundlePath = writeOnboardingSupportBundle({
      kind: 'build-init',
      appId,
      currentStep: failedStep,
      packageManager: pm.pm,
      cwd: process.cwd(),
      error: message,
      commands: [buildInitCommand, doctorCommand],
      docs: ['https://capgo.app/docs/cli/cloud-build/ios/'],
      logs: [
        ...log.slice(-12).map(entry => entry.text),
        ...buildOutput.slice(-12),
      ],
    })
    setSupportBundlePath(bundlePath)
    setError(message)
    setRetryStep(failedStep)
    setRetryCount(nextRetryCount)
    if (nextRetryCount > 1) {
      addLog(`⚠ Attempt ${nextRetryCount} failed. Recovery steps and a support bundle are available below.`, 'yellow')
    }
    setStep('error')
  }, [retryCount, addLog, appId, buildInitCommand, buildOutput, doctorCommand, log, pm.pm])

  // Show the contact-support confirmation gate as an Ink step and resolve once
  // the user picks Yes/Cancel. Returns a promise so contactSupport() can await
  // the user's decision before doing anything (writing logs / opening mail).
  const askSupportConfirm = useCallback((message: string, logPath: string): Promise<boolean> => {
    setSupportConfirmMessage(message)
    supportLogPathRef.current = logPath
    setStep('support-confirm')
    return new Promise<boolean>((resolve) => {
      supportConfirmResolveRef.current = resolve
    })
  }, [])

  // Read the verbose internal log (raw provider/API errors, secret-redacted) so
  // it can be folded into the support bundle's "Internal log" section.
  const readInternalLogLines = useCallback((): string[] => {
    const internalLogPath = getInternalLogPath()
    if (!internalLogPath)
      return []
    try {
      return readFileSync(internalLogPath, 'utf8').split('\n')
    }
    catch {
      return []
    }
  }, [])

  // Drive the contact-support flow: confirm gate → write bundle → copy the
  // .log.gz path → reveal in Finder (macOS) → open a pre-filled mailto. Every
  // step but "write the bundle" is best-effort; failures degrade gracefully and
  // we return to the step we came from (error menu / AI prompt / AI result).
  const handleSupport = useCallback(async (returnTo: 'error' | 'ai-analysis-prompt' | 'ai-analysis-result' = 'error') => {
    // Redact the error before it goes into the pre-filled email body — the body
    // is plain outbound text (unlike the attached bundle, which is redacted on
    // write), so an un-sanitized error could leak tokens/identifiers.
    const sanitizedError = redactSecrets(error ?? 'unknown error')
    await contactSupport({
      subject: `Capgo Builder support — ${appId} (ios)`,
      body: `Hi Capgo team,\n\nMy build failed and I'd like help.\n\nApp: ${appId}\nPlatform: ios\nError: ${sanitizedError}`,
      confirm: async (msg, logPath) => askSupportConfirm(msg, logPath),
      buildFiles: async () => {
        // Show a spinner while we render + gzip (and, for a huge build, trim to fit
        // the 10 MB upload cap) — that work is synchronous, so yield once first to
        // let Ink paint the message before it runs.
        setSupportBusyText('Preparing your logs to send…')
        setStep('support-uploading')
        await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
        return writeSupportBundleFiles({
          kind: 'build-init',
          appId,
          error: error ?? 'unknown error',
          // Full activity trail + the COMPLETE build log (buildOutput holds every
          // line streamed from the remote builder — never truncate it, or support
          // gets a useless 12-line snippet and can't diagnose the failure).
          logs: log.map(entry => entry.text),
          sections: [
            { title: 'Build output (full)', lines: buildOutput },
            { title: 'Internal log', lines: readInternalLogLines() },
            // When the user escalates after running AI, fold the analysis into the
            // bundle so support sees what the AI already concluded (spec §2).
            ...(aiAnalysisText ? [{ title: 'AI analysis', lines: aiAnalysisText.split('\n') }] : []),
          ],
        })
      },
      copyPath: p => copyToClipboard(p).ok,
      reveal: p => revealInFinder(p),
      openUrl: u => open(u),
      print: msg => addLog(msg, 'cyan'),
      upload: (gzPath) => {
        setSupportBusyText('Uploading your logs to Capgo support…')
        setStep('support-uploading') // show a spinner while the (network) upload runs
        return uploadSupportLogs({
          apiHost: supaHost ?? 'https://api.capgo.app',
          apikey: resolvedApiKeyRef.current ?? apikey ?? '',
          appId,
          jobId: aiJobId ?? undefined,
          gzPath,
        })
      },
    })
    setStep(returnTo)
  }, [appId, apikey, aiJobId, error, log, buildOutput, aiAnalysisText, askSupportConfirm, readInternalLogLines, addLog])

  // ── Credential save logic ──

  async function doSaveCredentials(): Promise<Parameters<typeof updateSavedCredentials>[2]> {
    // For import mode in ad_hoc distribution, no .p8 is needed at all.
    const needsAscKey = !importMode || importDistribution === 'app_store'

    let keyContent = p8ContentRef.current
    if (needsAscKey) {
      // Re-read .p8 for APPLE_KEY_CONTENT (use refs for fresh values)
      if (!keyContent && p8PathRef.current) {
        try {
          keyContent = await readFile(p8PathRef.current, 'utf-8')
          setP8Content(keyContent)
        }
        catch {
          throw new Error('Could not read .p8 file. Please provide the path again.')
        }
      }
      // Defensive guard: do NOT silently save credentials missing the ASC
      // API key. Without this, an empty p8ContentRef + empty p8PathRef
      // (legacy or malformed progress) would skip the `APPLE_KEY_*` writes
      // below and leave the user with a working-looking save and no key.
      if (!keyContent)
        throw new Error('Internal error: app_store distribution requires a .p8 key but none was provided. Re-run `build init` and provide the key file.')
    }

    // Use the bundle ID from the imported profile when available; falls back
    // to the iOS bundle id (config.appId) for the create-new path. Whichever
    // we end up writing here becomes the provisioning_map key, which the iOS
    // build system looks up by PRODUCT_BUNDLE_IDENTIFIER at sign time — so
    // the Capgo lookup key would be wrong here whenever it diverges from
    // config.appId (e.g. dev-tunnel sandboxes).
    //
    // Wildcard profiles (bundleId like `com.example.*` or bare `*`) are valid
    // for many concrete app ids — but Xcode resolves the map by the concrete
    // PRODUCT_BUNDLE_IDENTIFIER, so we substitute the resolved iosBundleId in
    // that case. The chosenProfile?.bundleId branch is only reached on the
    // importMode path; the create-new path already falls through to
    // iosBundleId, so the wildcard substitution doesn't affect it.
    const importedBundleId = chosenProfile?.bundleId
    const isWildcardProfile = Boolean(importedBundleId && importedBundleId.includes('*'))
    const provisioningBundleId = importMode && importedBundleId && !isWildcardProfile ? importedBundleId : iosBundleId
    const provisioningMap: Record<string, { profile: string, name: string }> = {
      [provisioningBundleId]: {
        profile: profileData!.profileBase64,
        name: profileData!.profileName,
      },
    }

    // Import mode uses the random passphrase generated at export time;
    // create-new uses the well-known DEFAULT_P12_PASSWORD that csr.ts produces.
    const p12Password = importMode && importedP12Password ? importedP12Password : DEFAULT_P12_PASSWORD
    const distribution = importMode ? (importDistribution || 'app_store') : 'app_store'

    const credentials = {
      BUILD_CERTIFICATE_BASE64: certData!.p12Base64,
      P12_PASSWORD: p12Password,
      CAPGO_IOS_PROVISIONING_MAP: JSON.stringify(provisioningMap),
      APP_STORE_CONNECT_TEAM_ID: teamId || certData!.teamId,
      CAPGO_IOS_DISTRIBUTION: distribution,
    } as Parameters<typeof updateSavedCredentials>[2]

    if (needsAscKey && keyContent) {
      credentials.APPLE_KEY_ID = keyIdRef.current
      credentials.APPLE_ISSUER_ID = issuerIdRef.current
      credentials.APPLE_KEY_CONTENT = Buffer.from(keyContent).toString('base64')
    }

    await updateSavedCredentials(appId, 'ios', credentials)

    await deleteProgress(appId)
    addLog('✔ Credentials saved')
    return credentials
  }

  // ── Async step handlers ──

  useEffect(() => {
    let cancelled = false

    if (step === 'welcome') {
      // Platform was already chosen in command.ts before this Ink app rendered.
      // Skip the legacy platform-select Select and go straight to the iOS-specific
      // checks that platform-select used to gatekeep:
      //   1. If ios/ doesn't exist → no-platform recovery flow
      //   2. If iOS credentials already exist → credentials-exist confirmation
      //   3. Otherwise → api-key-instructions
      setTimeout(() => {
        if (cancelled)
          return
        if (!existsSync(join(process.cwd(), iosDir))) {
          setStep('no-platform')
          return
        }
        ;(async () => {
          const existing = await loadSavedCredentials(appId)
          if (cancelled)
            return
          if (existing?.ios)
            setStep('credentials-exist')
          else if (isMacOS())
            // Fresh iOS, no creds: offer the import-vs-create fork (create-new →
            // the guided .p8 helper). Only macOS can drive the helper; other
            // hosts go straight to the manual .p8 instructions.
            setStep('setup-method-select')
          else
            setStep('api-key-instructions')
        })()
      }, 800)
    }

    if (step === 'backing-up') {
      ;(async () => {
        const credPath = join(homedir(), '.capgo-credentials', 'credentials.json')
        const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const backupPath = join(homedir(), '.capgo-credentials', `credentials-${date}.copy.json`)
        try {
          await copyFile(credPath, backupPath)
          if (cancelled)
            return
          addLog(`✔ Backup saved · ${backupPath}`)
        }
        catch (err) {
          appendInternalLog(`credentials backup failed: ${err instanceof Error ? err.message : String(err)}`)
          if (cancelled)
            return
          addLog('⚠ Could not backup credentials (file may not exist yet)', 'yellow')
        }
        // After backup, offer the setup-method fork on macOS so the user can
        // pick between import and create-new. Non-macOS goes straight to ASC.
        if (isMacOS()) {
          setStep('setup-method-select')
        }
        else {
          setStep('api-key-instructions')
        }
      })()
    }

    if (step === 'platform-select') {
      // Check if ios/ exists — if not, skip Select and go straight to error
      if (!existsSync(join(process.cwd(), iosDir))) {
        setStep('no-platform')
      }
    }

    if (step === 'no-platform') {
      pickerOpenedRef.current = false
    }

    if (step === 'adding-platform') {
      ;(async () => {
        const result = await runRunnerCommand(pm.runner, ['cap', 'add', 'ios'])
        if (cancelled)
          return

        if (result.success && existsSync(join(process.cwd(), iosDir))) {
          addLog(`✔ Native iOS platform created with ${addIosCommand}`)
          setError(null)
          errorCategoryRef.current = undefined
          setRetryCount(0)
          // Re-run the welcome → platform check inline rather than detouring
          // through the legacy platform-select step.
          ;(async () => {
            const existing = await loadSavedCredentials(appId)
            if (cancelled)
              return
            if (existing?.ios)
              setStep('credentials-exist')
            else if (isMacOS())
              // Fresh iOS, no creds: route through the import-vs-create fork
              // (create-new → the guided .p8 helper) on macOS.
              setStep('setup-method-select')
            else
              setStep('api-key-instructions')
          })()
          return
        }

        const detail = result.output.length > 0
          ? `\n${result.output.slice(-6).join('\n')}`
          : ''
        handleError(new Error(`Could not add the iOS platform automatically.${detail}`), 'adding-platform')
      })()
    }

    // ── Import-existing sub-flow (macOS only) ──

    if (step === 'import-scanning') {
      ;(async () => {
        try {
          const [identities, profiles] = await Promise.all([
            listSigningIdentities(),
            scanProvisioningProfiles(),
          ])
          if (cancelled)
            return
          const distOnly = identities.filter(i => i.type === 'distribution')
          if (distOnly.length === 0) {
            handleError(
              new Error(
                'No iOS Distribution identities found in your default Keychain. '
                + 'If you have certificates in a custom keychain, the v1 import flow does not support that — '
                + 'use "Create new" instead, or run `build credentials save` directly.',
              ),
              'import-scanning',
            )
            return
          }
          const matches = matchIdentitiesToProfiles(distOnly, profiles)
          setImportProfiles(profiles)
          setImportMatches(matches)
          addLog(`✔ Found ${distOnly.length} distribution identity${distOnly.length === 1 ? '' : 'ies'} and ${profiles.length} profile${profiles.length === 1 ? '' : 's'} on this Mac`)
          // Skip questions the user already answered on a previous attempt:
          // if importDistribution + (for app_store) apiKeyVerified are
          // already saved in progress, jump past distribution-mode and the
          // .p8 input chain. See progress.ts → getImportEntryStep for the
          // full decision table and tests.
          //
          // redirectIfMismatch then silently adopts the authoritative Release
          // PRODUCT_BUNDLE_IDENTIFIER when it differs from config.appId (no
          // prompt) before Apple-side filtering kicks in.
          setStep(redirectIfMismatch(getImportEntryStep(await loadProgress(appId))))
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'import-scanning')
        }
      })()
    }

    // Eager batch validation: classify every scanned distribution identity
    // against Apple's API up-front so the picker can show two tables
    // (Available + Unavailable) with concrete reasons. Only reached when
    // there's at least one match — see the verifying-key fan-out comment
    // and getImportEntryStep for the entry conditions.
    if (step === 'import-validating-all-certs' && importMatches.length > 0) {
      ;(async () => {
        try {
          const token = await getFreshToken()
          // Single team-wide cert fetch + SHA1 index. Previously this was a
          // Promise.all(findCertBySha1) fan-out: each lookup internally
          // refetched the entire /certificates list, so N identities meant
          // N identical downloads + N×M SHA1 hashes and N concurrent hits
          // against Apple's rate limiter. Indexing once by SHA1 turns that
          // into one download + M hashes + N O(1) map lookups.
          //
          // includeContent:true so we still get the cert DER needed to
          // compute the SHA1 key; the AscDistributionCert record we store
          // in the map is the same shape findCertBySha1 used to return —
          // name, expirationDate, serialNumber — so the manual-portal
          // walkthrough disambiguators remain available downstream.
          //
          // One try/catch around the single fetch: either the cert list
          // lands or it doesn't. The previous per-identity error capture
          // is now redundant because a single network blip uniformly
          // affects all lookups in this batch.
          const allCerts = await listDistributionCerts(token, { includeContent: true })
          if (cancelled)
            return
          const bySha1 = new Map<string, typeof allCerts[number]>()
          for (const cert of allCerts) {
            if (!cert.certificateContent)
              continue
            bySha1.set(computeCertSha1(cert.certificateContent), cert)
          }
          const results = importMatches.map((m) => {
            const cert = bySha1.get(m.identity.sha1.toLowerCase()) ?? null
            return { sha1: m.identity.sha1, cert, error: null as unknown }
          })
          const map: Record<string, EnrichedIdentityAvailability> = {}
          let availableCount = 0
          for (const r of results) {
            const classified = classifyCertAvailability({
              appleCertId: r.cert ? r.cert.id : null,
              lookupError: r.error,
            })
            const entry: EnrichedIdentityAvailability = {
              available: classified.available,
              reason: classified.reason,
              reasonText: classified.reasonText,
              appleCertId: classified.appleCertId,
              ...(r.cert && classified.available
                ? {
                    appleCertName: r.cert.name,
                    appleCertExpirationDate: r.cert.expirationDate,
                    appleCertSerialNumber: r.cert.serialNumber,
                  }
                : {}),
            }
            map[r.sha1] = entry
            if (entry.available)
              availableCount++
          }
          setIdentityAvailability(map)
          addLog(`✔ Apple validation complete — ${availableCount} available, ${results.length - availableCount} unavailable`)

          // Profile prefetch trigger — fires in parallel for every identity
          // whose batch validation yielded an Apple-side certId. Identities
          // marked unavailable (no appleCertId) are not prefetched: they're
          // already in the UNAVAILABLE table and clicking them re-routes via
          // import-checking-apple-cert.
          //
          // The one-shot ref guards against this useEffect re-running on
          // re-renders triggered by our own setImportMatches injections.
          // Once flipped true it stays true until resetForFreshStart wipes it.
          if (!prefetchTriggeredRef.current) {
            prefetchTriggeredRef.current = true
            // Snapshot the current generation so every in-flight fetch can
            // self-invalidate on resetForFreshStart. Captured by reference
            // semantics — the closures read prefetchGenerationRef.current
            // when they resolve, not the closed-over value here.
            const myGen = prefetchGenerationRef.current
            const toPrefetch = importMatches.filter(m => map[m.identity.sha1]?.available && map[m.identity.sha1]?.appleCertId)
            if (toPrefetch.length > 0) {
              const pendingSeed: Record<string, { kind: 'pending' }> = {}
              for (const m of toPrefetch)
                pendingSeed[m.identity.sha1] = { kind: 'pending' }
              setProfilePrefetch(prev => ({ ...prev, ...pendingSeed }))

              // Fire each fetch independently — one slow / failing cert must
              // not delay or poison the others. Token is captured from the
              // outer scope (already fetched for the batch validation).
              for (const m of toPrefetch) {
                const sha1 = m.identity.sha1
                const certId = map[sha1].appleCertId!
                const teamId = m.identity.teamId
                ;(async () => {
                  try {
                    const raced = await Promise.race<AscProfileSummary[] | '__timeout__'>([
                      listProfilesForCert(token, certId),
                      new Promise<'__timeout__'>(resolve => setTimeout(resolve, 7000, '__timeout__')),
                    ])
                    // Check generation, NOT the step-tied `cancelled` —
                    // setStep('import-pick-identity') below trips cancelled
                    // before we ever resolve, so a `cancelled` check here
                    // would discard every prefetch result and spin forever.
                    if (prefetchGenerationRef.current !== myGen)
                      return
                    if (raced === '__timeout__') {
                      setProfilePrefetch(prev => ({ ...prev, [sha1]: { kind: 'timeout' } }))
                      return
                    }
                    // Map AscProfileSummary[] → DiscoveredProfile[] using the
                    // SAME shape import-checking-apple-cert builds (see ~1328).
                    const synthesized: DiscoveredProfile[] = raced.map(p => ({
                      path: '',
                      uuid: p.id,
                      name: p.name,
                      applicationIdentifier: '',
                      bundleId: p.bundleIdentifier,
                      teamId,
                      expirationDate: p.expirationDate,
                      profileType: (p.profileType === 'IOS_APP_STORE' ? 'app_store' : p.profileType === 'IOS_APP_ADHOC' ? 'ad_hoc' : 'unknown') as DiscoveredProfile['profileType'],
                      certificateSha1s: [sha1],
                      profileBase64: p.profileContent,
                    } as DiscoveredProfile & { profileBase64: string }))
                    const usableHere = filterProfilesForApp(synthesized, iosBundleId, importDistribution)
                    if (usableHere.length === 0) {
                      // Apple returned zero (or none usable for this app +
                      // distribution). Cell renders UNAVAILABLE; clicking it
                      // re-routes through import-checking-apple-cert so the
                      // user still gets the rich "why" messaging there.
                      setProfilePrefetch(prev => ({ ...prev, [sha1]: { kind: 'unavailable' } }))
                      return
                    }
                    // Inject synthesized profiles into importMatches so the
                    // existing matchCount > 0 check in the row builder lights
                    // the cell green without needing a second branch.
                    setImportMatches(prev => prev.map(mm => mm.identity.sha1 === sha1
                      ? { ...mm, profiles: [...mm.profiles, ...synthesized] }
                      : mm,
                    ))
                    setProfilePrefetch(prev => ({ ...prev, [sha1]: { kind: 'available' } }))
                  }
                  catch (err) {
                    appendInternalLog(`profile prefetch failed (background): ${err instanceof Error ? err.message : String(err)}`)
                    if (prefetchGenerationRef.current !== myGen)
                      return
                    // Per-fetch error sandbox: any one cert's failure stays
                    // contained. The user can still click the row and the
                    // existing import-checking-apple-cert handler will retry
                    // with the cached cert id.
                    setProfilePrefetch(prev => ({ ...prev, [sha1]: { kind: 'error' } }))
                  }
                })()
              }
            }
          }

          setStep('import-pick-identity')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'import-validating-all-certs')
        }
      })()
    }

    // Per-identity Apple-side check + auto-fetch profile. Runs when the
    // user picks an identity that has no matching on-disk profile — we
    // try to recover from Apple before showing the recovery menu. Trusts
    // the cached appleCertId from the eager batch validation when present;
    // falls back to a fresh findCertIdBySha1 lookup otherwise.
    if (step === 'import-checking-apple-cert' && chosenIdentity) {
      ;(async () => {
        try {
          const token = await getFreshToken()
          let certId: string | null = identityAvailability[chosenIdentity.sha1]?.appleCertId ?? null
          if (certId === null) {
            certId = await findCertIdBySha1(token, chosenIdentity.sha1)
          }
          if (cancelled)
            return
          if (!certId) {
            addLog(
              `⚠ Apple lookup returned no match for "${chosenIdentity.name}". `
              + `Open Developer Portal or use a different identity.`,
              'yellow',
            )
            setAppleCertIdForChosen(null)
            setNoMatchReason('apple-no-cert-match')
            setStep('import-no-match-recovery')
            return
          }
          setAppleCertIdForChosen(certId)
          addLog(`✔ Apple recognizes this certificate (ASC id ${certId.slice(0, 8)}…)`)

          // Auto-fetch profiles for this cert. Sends the user straight to
          // import-pick-profile when Apple has a matching profile waiting,
          // skipping the recovery menu entirely on the happy path.
          const profiles = await listProfilesForCert(token, certId)
          if (cancelled)
            return
          if (profiles.length === 0) {
            addLog('ℹ️  Apple has the cert but no profiles linked to it yet — use "Create a new App Store profile" to add one.', 'yellow')
            setNoMatchReason('apple-no-profiles-linked')
            setStep('import-no-match-recovery')
            return
          }
          // Synthesize so filterProfilesForApp + the picker can consume
          // them the same way as on-disk profiles.
          const synthesized: DiscoveredProfile[] = profiles.map(p => ({
            path: '',
            uuid: p.id,
            name: p.name,
            applicationIdentifier: '',
            bundleId: p.bundleIdentifier,
            teamId: chosenIdentity.teamId,
            expirationDate: p.expirationDate,
            profileType: (p.profileType === 'IOS_APP_STORE' ? 'app_store' : p.profileType === 'IOS_APP_ADHOC' ? 'ad_hoc' : 'unknown') as DiscoveredProfile['profileType'],
            certificateSha1s: [chosenIdentity.sha1],
            profileBase64: p.profileContent,
          } as DiscoveredProfile & { profileBase64: string }))
          setImportMatches(prev => prev.map(m => m.identity.sha1 === chosenIdentity.sha1
            ? { ...m, profiles: [...m.profiles, ...synthesized] }
            : m,
          ))
          const usableHere = filterProfilesForApp(synthesized, iosBundleId, importDistribution)
          if (usableHere.length === 0) {
            const otherBundleIds = Array.from(new Set(synthesized.map(p => p.bundleId).filter(b => b && b !== iosBundleId)))
            const sameBundleWrongDist = synthesized.filter(p => p.bundleId === iosBundleId)
            if (otherBundleIds.length > 0) {
              // Split into two log lines instead of one long "X (found: Y, Z)" line —
              // when the bundle ids are long the opening paren slides off the terminal
              // and the trailing ")" looks orphaned. The Profiles-returned-for line
              // also stands alone better than nested parenthetical metadata.
              addLog(`⚠ Apple returned ${profiles.length} profile${profiles.length === 1 ? '' : 's'} for this cert but none target "${iosBundleId}".`, 'yellow')
              addLog(`  Apple linked them to: ${otherBundleIds.join(', ')}. Use "Create a new App Store profile" to add one for "${iosBundleId}".`, 'yellow')
              setNoMatchReason('apple-bundle-mismatch')
            }
            else if (sameBundleWrongDist.length > 0) {
              // Bundle matches but distribution mode does not — surface the actual mismatch
              // instead of the generic "none match this app" line, which falsely suggests
              // the bundle id is wrong and sends users hunting for the wrong fix.
              const foundDist = Array.from(new Set(sameBundleWrongDist.map(p => p.profileType))).join(', ')
              addLog(`⚠ Apple has ${sameBundleWrongDist.length} profile${sameBundleWrongDist.length === 1 ? '' : 's'} for "${iosBundleId}" but none are ${importDistribution} (found: ${foundDist}).`, 'yellow')
              addLog(`  Re-run with the matching distribution, or use "Create a new App Store profile" to add one.`, 'yellow')
              setNoMatchReason('apple-distribution-mismatch')
            }
            else {
              addLog(`⚠ Apple returned ${profiles.length} profile${profiles.length === 1 ? '' : 's'} for this cert but none match this app.`, 'yellow')
              setNoMatchReason('apple-other')
            }
            setStep('import-no-match-recovery')
            return
          }
          addLog(`✔ Apple has ${usableHere.length} matching profile${usableHere.length === 1 ? '' : 's'} for "${iosBundleId}" — opening the picker`)
          setStep('import-pick-profile')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'import-checking-apple-cert')
        }
      })()
    }

    if (step === 'import-exporting') {
      ;(async () => {
        try {
          if (!chosenIdentity || !chosenProfile)
            throw new Error('Internal error: no identity or profile chosen for export.')
          const exported = await exportP12FromKeychain(chosenIdentity.sha1)
          if (cancelled)
            return
          // Build cert + profile records to drop into doSaveCredentials. We
          // synthesize a CertificateData record (Apple-API-only fields stay empty).
          const importedCertData: CertificateData = {
            certificateId: '',
            expirationDate: chosenProfile.expirationDate,
            teamId: chosenIdentity.teamId,
            p12Base64: exported.base64,
          }
          // chosenProfile.path can be empty when the profile was synthesized
          // from an Apple API response (D2 path) — in that case, profileBase64
          // is already set in chosenProfile.profileContent-equivalent.
          const profileBase64 = chosenProfile.path
            ? Buffer.from(await readFile(chosenProfile.path)).toString('base64')
            : (chosenProfile as DiscoveredProfile & { profileBase64?: string }).profileBase64 || ''
          const importedProfileData: ProfileData = {
            profileId: chosenProfile.uuid,
            profileName: chosenProfile.name,
            profileBase64,
          }
          setCertData(importedCertData)
          setProfileData(importedProfileData)
          if (chosenIdentity.teamId)
            setTeamId(chosenIdentity.teamId)
          setImportedP12Password(exported.passphrase)
          addLog(`✔ Exported "${chosenIdentity.name}" from Keychain`)
          // .p8 was handled upfront for app_store via the distribution-mode
          // fork; ad_hoc never needs it. So we go straight to save.
          setStep('saving-credentials')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'import-exporting')
        }
      })()
    }

    if (step === 'asc-key-generating') {
      ;(async () => {
        try {
          // Launch the guided macOS helper; it streams stats to PostHog and
          // returns the captured credentials on its terminal result line. The
          // abort controller (aborted in this effect's cleanup) terminates the
          // helper window if the user quits the TUI, so the CLI doesn't hang.
          const abort = new AbortController()
          ascHelperAbortRef.current = abort
          const outcome = await runAscKeyHelper({ apikey, signal: abort.signal })
          if (cancelled)
            return
          if (!outcome.ok) {
            const reason = outcome.errorCode === 'USER_CANCELLED'
              ? 'Guided key creation was cancelled.'
              : `Guided key creation failed (${outcome.errorCode}): ${outcome.message}`
            // Back to the fork so the user can retry, say "I have a .p8", or
            // create it by hand.
            handleError(new Error(reason), 'p8-source-select')
            return
          }
          const { credentials } = outcome
          // The helper also saved the .p8 to the fastlane/ASC conventional path.
          const helperP8Path = join(homedir(), '.appstoreconnect', 'private_keys', `AuthKey_${credentials.keyId}.p8`)
          // Apple never re-issues the key, so don't rely solely on the helper's
          // best-effort copy: write the captured key to disk ourselves (0600) if
          // it isn't already there. This makes quit-and-resume safe — verifying-key
          // reads p8Path and always finds the file.
          try {
            if (!existsSync(helperP8Path)) {
              await mkdir(dirname(helperP8Path), { recursive: true })
              await writeFile(helperP8Path, credentials.privateKey, { mode: 0o600 })
            }
          }
          catch (err) {
            appendInternalLog(`could not write captured .p8 to ${helperP8Path}: ${err instanceof Error ? err.message : String(err)}`)
          }
          setP8Content(credentials.privateKey) // wrapper also updates p8ContentRef
          setKeyId(credentials.keyId)
          setIssuerId(credentials.issuerId)
          setP8Path(helperP8Path)
          // Persist all three (incl. p8Path) so a resume AFTER the key was
          // captured lands on verifying-key — not back on the helper re-run.
          await savePartialProgress({ keyId: credentials.keyId, issuerId: credentials.issuerId, p8Path: helperP8Path })
          if (cancelled)
            return
          addLog('✔ App Store Connect API key created via guided helper')
          setStep('verifying-key')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'p8-source-select')
        }
        finally {
          // The run settled — drop our controller so the unmount-only cleanup
          // can't abort a stale, already-resolved controller.
          ascHelperAbortRef.current = null
        }
      })()
    }

    // The legacy `import-fetching-profile` step (used by the "Rescan Apple
    // API" recovery option) was removed in favour of the per-identity
    // auto-fetch built into the upcoming `import-checking-apple-cert` step
    // and the `📁 Use a .mobileprovision file from disk` recovery option.
    // Auto-fetch runs once after the user picks an identity; the file picker
    // covers the "I just created a profile in the portal, here it is on
    // disk" workflow. Two parallel rescan paths confused users so we kept
    // only the file picker. (See commit 36a7c282 and the no-match recovery
    // menu's order comment.)

    // ── import-provide-profile-path ──
    // User picked "📁 Use a .mobileprovision file from disk" from the
    // no-match recovery menu. Open the native picker, validate the file
    // (bundle id + distribution + cert SHA1), and feed it into the
    // import-pick-profile path as a freshly-synthesized DiscoveredProfile.
    if (step === 'import-provide-profile-path') {
      if (mobileprovisionPickerOpenedRef.current)
        return
      mobileprovisionPickerOpenedRef.current = true
      ;(async () => {
        try {
          if (!chosenIdentity)
            throw new Error('Internal error: no identity chosen for .mobileprovision import.')
          const filePath = await openMobileprovisionPicker()
          if (cancelled)
            return
          if (!filePath) {
            // User cancelled the picker — bounce back to the recovery menu.
            setStep('import-no-match-recovery')
            return
          }
          // Parse + run our three invariant checks (bundle id, distribution,
          // cert SHA1) before persisting anything. Errors route through
          // handleError so the user gets the support-bundle screen with a
          // clear "this file is wrong because X" message.
          let detail
          try {
            detail = parseMobileprovisionDetailed(filePath)
          }
          catch (err) {
            handleError(
              new Error(`Couldn't parse "${filePath}": ${err instanceof Error ? err.message : String(err)}`),
              'import-provide-profile-path',
            )
            return
          }
          if (!bundleIdMatches(detail.bundleId, iosBundleId)) {
            handleError(
              new Error(
                `This .mobileprovision is for bundle ID "${detail.bundleId}" but the current app is "${iosBundleId}". `
                + `Pick a profile that targets the right app (wildcard profiles like "com.example.*" are accepted), or use "Create a new App Store profile" in the recovery menu.`,
              ),
              'import-provide-profile-path',
            )
            return
          }
          // parseMobileprovisionDetailed already returns Capgo's distribution
          // enum (app_store/ad_hoc/development/enterprise/unknown) — no need
          // to remap from Apple's IOS_APP_* constants here.
          if (importDistribution && detail.profileType !== importDistribution) {
            handleError(
              new Error(
                `This .mobileprovision is a ${detail.profileType} profile but you picked ${importDistribution} distribution. `
                + `Pick a profile that matches, or restart and pick the matching distribution mode.`,
              ),
              'import-provide-profile-path',
            )
            return
          }
          if (!detail.certificateSha1s.includes(chosenIdentity.sha1)) {
            const shownSha1s = detail.certificateSha1s.map(s => `${s.slice(0, 8)}…`).join(', ') || '(none listed)'
            handleError(
              new Error(
                `This .mobileprovision doesn't trust your chosen certificate "${chosenIdentity.name}". `
                + `Allowed certs in the profile (SHA1): ${shownSha1s}; your cert starts with ${chosenIdentity.sha1.slice(0, 8)}…. `
                + `Either pick a different cert at the identity step, or re-create this profile in the Apple Developer Portal and tick the right one.`,
              ),
              'import-provide-profile-path',
            )
            return
          }
          // All checks pass — synthesize a DiscoveredProfile and route
          // straight to the picker. The on-disk `path` is preserved so
          // import-exporting reads the profile bytes from it directly,
          // exactly like a profile we found via scanProvisioningProfiles.
          const synthesized: DiscoveredProfile = {
            path: filePath,
            uuid: detail.uuid,
            name: detail.name,
            applicationIdentifier: detail.applicationIdentifier,
            bundleId: detail.bundleId,
            teamId: chosenIdentity.teamId,
            expirationDate: detail.expirationDate,
            profileType: detail.profileType,
            certificateSha1s: detail.certificateSha1s,
          }
          setImportMatches(prev => prev.map(m => m.identity.sha1 === chosenIdentity.sha1
            ? { ...m, profiles: [...m.profiles, synthesized] }
            : m,
          ))
          addLog(`✔ Loaded profile from file · ${detail.name}`)
          setStep('import-pick-profile')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'import-provide-profile-path')
        }
      })()
    }

    if (step === 'import-create-profile-only') {
      ;(async () => {
        try {
          if (!chosenIdentity)
            throw new Error('Internal error: no identity chosen for profile creation.')
          // Defensive: D2 only synthesizes app_store profiles right now (the
          // underlying apple-api.ts createProfile hardcodes IOS_APP_STORE).
          // The no-match-recovery menu already hides "Create" for ad_hoc, but
          // if some code path bypasses the menu we still refuse rather than
          // silently produce a mismatched provisioning_map / distribution
          // pair in credentials.json.
          if (importDistribution === 'ad_hoc') {
            throw new Error(
              'Creating a new profile via Apple is not implemented for ad_hoc distribution yet. '
              + 'Use "Fetch matching profile from Apple" or "Open Apple Developer Portal" instead.',
            )
          }
          const token = await getFreshToken()
          const certId = await findCertIdBySha1(token, chosenIdentity.sha1)
          if (cancelled)
            return
          if (!certId) {
            throw new Error(
              `Apple does not have a certificate matching "${chosenIdentity.name}". `
              + `Cannot create a profile without an Apple-side cert ID. Use "Create new" path instead.`,
            )
          }
          const { bundleIdResourceId } = await ensureBundleId(token, iosBundleId)
          if (cancelled)
            return
          const profile = await createProfile(token, bundleIdResourceId, certId, iosBundleId)
          if (cancelled)
            return
          // Use the freshly-created profile directly as the chosen profile.
          const synthesized = {
            path: '',
            uuid: profile.profileId,
            name: profile.profileName,
            applicationIdentifier: '',
            bundleId: iosBundleId,
            teamId: chosenIdentity.teamId,
            expirationDate: profile.expirationDate,
            profileType: 'app_store' as const,
            certificateSha1s: [chosenIdentity.sha1],
            profileBase64: profile.profileContent,
          } as DiscoveredProfile & { profileBase64: string }
          setChosenProfile(synthesized)
          // Also append to importMatches so the picker shows the new profile
          // if the user clicks Back from import-export-warning. Without this,
          // import-pick-profile renders from importMatches (which doesn't
          // include the freshly-created one) and the user gets stuck in a
          // loop with no way to select what they just created.
          setImportMatches(prev => prev.map(m => m.identity.sha1 === chosenIdentity.sha1
            ? { ...m, profiles: [...m.profiles, synthesized] }
            : m,
          ))
          addLog(`✔ Created new profile "${profile.profileName}" on Apple, linked to your existing cert`)
          setStep('import-export-warning')
        }
        catch (err) {
          if (cancelled)
            return
          if (err instanceof DuplicateProfileError) {
            // Route to the shared duplicate-profile-prompt, but record where
            // to RESUME after the deletion so the retry runs the import-side
            // re-creation (which goes back through findCertIdBySha1) instead
            // of the create-new path's creating-certificate→creating-profile
            // chain (which can't succeed in import mode — no certData).
            setDuplicateProfileOrigin('import-create-profile-only')
            setDuplicateProfiles(err.profiles)
            setStep('duplicate-profile-prompt')
          }
          else {
            handleError(err, 'import-create-profile-only')
          }
        }
      })()
    }

    if (step === 'p8-method-select' && !pickerOpenedRef.current) {
      pickerOpenedRef.current = true
      ;(async () => {
        try {
          const selected = await openFilePicker()
          if (cancelled)
            return
          if (selected) {
            const content = await readFile(selected, 'utf-8')
            if (cancelled)
              return
            setP8Path(selected)
            setP8Content(content)
            const extracted = extractKeyIdFromPath(selected)
            if (extracted)
              setKeyId(extracted)
            upsertLog('✔ Key file selected · ', `✔ Key file selected · ${selected}`)
            // Persist the extracted keyId too — otherwise quitting before the
            // Key ID step loses it and resume shows the empty placeholder.
            void savePartialProgress({ p8Path: selected, keyId: extracted || undefined })
            setStep('input-key-id')
          }
          else {
            // User cancelled picker — fall back to manual
            setStep('input-p8-path')
          }
        }
        catch (err) {
          if (cancelled)
            return
          handleError(new Error(`Could not read file: ${err instanceof Error ? err.message : String(err)}`), 'api-key-instructions')
        }
      })()
    }

    if (step === 'verifying-key') {
      ;(async () => {
        try {
          // Log the EXACT identifiers we're verifying with so support can compare
          // them against App Store Connect — these are the very things the failure
          // message tells the user to check (the .p8 itself is redacted on write).
          appendInternalLog(`apple key verify: keyId=${keyIdRef.current}, issuerId=${issuerIdRef.current}`)
          const token = await getFreshToken()
          const verifyResult = await verifyApiKey(token)
          if (cancelled)
            return
          if (verifyResult.teamId)
            setTeamId(verifyResult.teamId)
          const apiKeyData: ApiKeyData = { keyId: keyIdRef.current, issuerId: issuerIdRef.current }
          // Merge into existing progress instead of constructing fresh. The
          // previous fresh-object approach wiped setupMethod / importDistribution
          // (set by import-distribution-mode upstream), so a CLI restart after
          // verifying-key succeeded but before saving-credentials would lose
          // the import-flow context and resume into create-new — exactly the
          // class of resume regression we already fixed once via the importMode
          // hydration patch in commit 81a6f1c7. Same root cause, different
          // site: every saveProgress must preserve fields it doesn't own.
          const existing = await loadProgress(appId)
          const progress: OnboardingProgress = {
            ...(existing ?? {
              platform: 'ios' as const,
              appId,
              startedAt: new Date().toISOString(),
              completedSteps: {},
            }),
            p8Path: p8PathRef.current,
            completedSteps: {
              ...(existing?.completedSteps ?? {}),
              apiKeyVerified: apiKeyData,
            },
          }
          await saveProgress(appId, progress)
          addLog(`✔ API Key verified — Key: ${keyId}`)
          setRetryCount(0)
          // Branch on flow mode:
          //  - import + pending recovery action → resume the action
          //  - import (no pending action, app_store entry point) → continue to identity pick
          //  - create-new (default) → continue to certificate creation
          if (importMode && pendingRecoveryAction) {
            const action = pendingRecoveryAction
            setPendingRecoveryAction(null)
            setStep(`import-${action}` as OnboardingStep)
          }
          else if (importMode) {
            // After p8 verification we're about to use the bundle id for
            // Apple-side filtering; redirectIfMismatch silently adopts the
            // authoritative Release bundle id when it differs from
            // capacitor.config.appId (no prompt), then returns the target step.
            //
            // Eager batch validation runs BEFORE the picker renders when
            // there's at least one match — runs a single ASC cert fetch and
            // indexes by SHA1 so the picker can split identities into
            // Available / Unavailable tables with concrete reasons rather
            // than a flat list with surprises on pick.
            const importTarget: OnboardingStep = importMatches.length > 0 ? 'import-validating-all-certs' : 'import-pick-identity'
            // Import + app_store carries the SAME wrong/missing-app risk as
            // create-new — the local Release bundle id may not match any App Store
            // app — and a verified .p8 is present here, so run verify-app first and
            // resume at the identity/profile picker once the invariant holds.
            // ad_hoc import never uploads to TestFlight (and may have entered a
            // one-shot .p8 via no-match recovery) → skip verify-app entirely.
            if (importDistribution === 'app_store') {
              setPendingVerifyNext(importTarget)
              setStep(redirectIfMismatch('verify-app'))
            }
            else {
              setStep(redirectIfMismatch(importTarget))
            }
          }
          else {
            // Create-new path (always app_store): before creating the cert,
            // run the remote App Store verification step. The single invariant
            // it enforces — an ASC app exists whose bundleId == the Release
            // build id — catches a wrong/missing app early instead of failing
            // silently at TestFlight upload. We route through verify-app and
            // tell it to continue to creating-certificate once the invariant
            // holds (verify-app itself goes straight through on an exact match
            // or an ASC fetch failure).
            //
            // redirectIfMismatch runs first only to silently adopt the
            // authoritative Release bundle id when it differs from
            // capacitor.config.appId (no prompt); verify-app then does the
            // remote check.
            setPendingVerifyNext('creating-certificate')
            setStep(redirectIfMismatch('verify-app'))
          }
        }
        catch (err) {
          // Capture the raw failure (Apple HTTP detail is already logged by the
          // apple-api layer; this also catches local .p8/JWT-signing errors that
          // never reach an HTTP call).
          appendInternalLog(`apple key verify failed: ${err instanceof Error ? err.message : String(err)}`)
          if (!cancelled)
            handleError(err, 'verifying-key')
        }
      })()
    }

    // ── verify-app: remote App Store Connect verification ──────────────────
    //
    // Fetch /v1/apps + /v1/bundleIds in parallel with a fresh token, resolve
    // the authoritative Release build id FRESH from disk (never the memoized
    // initial detection at app.tsx:256), and classify the invariant. On an
    // exact match we log + persist the override + continue straight to the
    // pending target. On any ASC fetch failure (or an unresolvable Release
    // config) we warn and proceed — we can't verify a transient/unknown state
    // and blocking on it would trap the user (the local bundle-id resolution
    // still ran). Otherwise we stay parked on verify-app
    // and the render below drives the picker + gate. Guarded by a ref so the
    // fetch fires exactly once per entry into the step.
    if (step === 'verify-app' && !verifyFetchStartedRef.current) {
      verifyFetchStartedRef.current = true
      setVerifyAppLoading(true)
      ;(async () => {
        // Re-detect fresh from disk so the Release build id reflects any edit
        // the user made since the wizard started (and bypasses the memo).
        const fresh = detectIosBundleIds({ cwd: process.cwd(), iosDir, capacitorAppId: iosBundleIdInitial })
        const releaseBundleId = fresh.releaseResolved && fresh.pbxproj ? fresh.pbxproj.value : ''
        const debugReleaseDiffer = fresh.debugReleaseDiffer
        // Debug ≠ Release awareness note — informational only, never gates. Shown
        // as a persistent boxed warning on the verify-app step (via the state set
        // here) AND as a yellow log line for the exact-match pass-through, which
        // never renders the step.
        if (debugReleaseDiffer && fresh.debug && fresh.pbxproj) {
          setVerifyDebugBundleId(fresh.debug.value)
          addLog(
            `⚠ Debug builds "${fresh.debug.value}" but Release builds "${fresh.pbxproj.value}" — Capgo Builder signs the RELEASE ID "${fresh.pbxproj.value}".`,
            'yellow',
          )
        }
        else {
          setVerifyDebugBundleId('')
        }

        try {
          const token = await getFreshToken()
          const [apps, registeredBundleIds] = await Promise.all([listApps(token), listBundleIds(token)])
          if (cancelled)
            return

          setVerifyApps(apps)
          setVerifyRegisteredIds(registeredBundleIds)
          setVerifyReleaseBundleId(releaseBundleId)
          setVerifyAppLoading(false)

          if (!verifyShownRef.current) {
            verifyShownRef.current = true
            trackVerifyEvent('iOS App Verify Shown', '🔍', {
              app_count: apps.length,
              bundle_id_count: registeredBundleIds.length,
              debug_release_differ: debugReleaseDiffer,
            })
          }

          // No Release config resolvable → warn, skip gating. We never gate on
          // a Debug or plist fallback (spec: Release is authoritative).
          if (!releaseBundleId) {
            addLog('⚠ Could not resolve a Release PRODUCT_BUNDLE_IDENTIFIER from your Xcode project — skipping remote App Store verification.', 'yellow')
            trackVerifyEvent('iOS App Verify Result', '🔎', {
              result: 'no-release-config',
              app_count: apps.length,
              bundle_id_count: registeredBundleIds.length,
            })
            setStep(pendingVerifyNext ?? 'creating-certificate')
            setPendingVerifyNext(null)
            return
          }

          const { result, matchedApp } = classifyAppVerification({ releaseBundleId, apps, registeredBundleIds })
          trackVerifyEvent('iOS App Verify Result', '🔎', {
            result,
            app_count: apps.length,
            bundle_id_count: registeredBundleIds.length,
          })

          if (result === 'exact-match' && matchedApp) {
            addLog(`✓ Building "${matchedApp.name}" (${releaseBundleId}) — matches your App Store app.`)
            try {
              await persistVerifyOverride(releaseBundleId)
            }
            catch (err) {
              appendInternalLog(`failed to persist verify override (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
              // A disk error saving the override must not be reported as an ASC
              // network failure (the outer catch's message). Non-fatal — the user
              // may just be re-prompted on the next run.
              addLog('⚠ Verified the App Store app but could not save the bundle ID override to disk — you may be re-prompted next run.', 'yellow')
            }
            trackVerifyEvent('iOS App Verify Passed', '✅', { attempts: 0, path: 'exact-match' })
            setStep(pendingVerifyNext ?? 'creating-certificate')
            setPendingVerifyNext(null)
            return
          }
          // Not satisfied → stay on verify-app; the render drives the picker +
          // gate. Pre-seed the path for the no-apps cases (no picker needed).
          if (result !== 'wrong-build-id')
            setVerifyPath('create-app')
        }
        catch (err) {
          appendInternalLog(`verify-app: could not reach App Store Connect, skipping verification: ${err instanceof Error ? err.message : String(err)}`)
          // ASC fetch failure (auth / rate-limit / network): we can't verify a
          // transient failure, and blocking on it would trap the user. Warn
          // visibly and proceed — the local bundle-id resolution already ran.
          if (cancelled)
            return
          setVerifyAppLoading(false)
          addLog('⚠ Couldn\'t reach App Store Connect to verify your app; continuing without remote verification.', 'yellow')
          if (!verifyShownRef.current) {
            verifyShownRef.current = true
            trackVerifyEvent('iOS App Verify Shown', '🔍', { app_count: 0, bundle_id_count: 0, debug_release_differ: debugReleaseDiffer })
          }
          trackVerifyEvent('iOS App Verify Result', '🔎', { result: 'fetch-failed', app_count: 0, bundle_id_count: 0 })
          setStep(pendingVerifyNext ?? 'creating-certificate')
          setPendingVerifyNext(null)
        }
      })()
    }

    if (step === 'creating-certificate') {
      ;(async () => {
        try {
          const token = await getFreshToken()
          const { csrPem, privateKeyPem } = generateCsr()
          // Save private key to progress in case of crash
          const existing = await loadProgress(appId)
          if (existing) {
            existing._privateKeyPem = privateKeyPem
            await saveProgress(appId, existing)
          }
          const cert = await createCertificate(token, csrPem)
          if (cancelled)
            return
          const { p12Base64 } = createP12(cert.certificateContent, privateKeyPem)
          const certResult: CertificateData = {
            certificateId: cert.certificateId,
            expirationDate: cert.expirationDate,
            teamId: cert.teamId,
            p12Base64,
          }
          setCertData(certResult)
          if (cert.teamId)
            setTeamId(cert.teamId)
          // Update progress: save cert data, wipe private key
          const progress = await loadProgress(appId)
          if (progress) {
            progress.completedSteps.certificateCreated = certResult
            delete progress._privateKeyPem
            await saveProgress(appId, progress)
          }
          addLog(`✔ Distribution certificate created — Expires ${cert.expirationDate}`)
          setRetryCount(0)
          setStep('creating-profile')
        }
        catch (err) {
          if (cancelled)
            return
          if (err instanceof CertificateLimitError) {
            setExistingCerts(err.certificates)
            setStep('cert-limit-prompt')
          }
          else {
            handleError(err, 'creating-certificate')
          }
        }
      })()
    }

    if (step === 'revoking-certificate') {
      ;(async () => {
        try {
          if (!certToRevoke)
            return
          const token = await getFreshToken()
          await revokeCertificate(token, certToRevoke)
          if (cancelled)
            return
          addLog('✔ Old certificate revoked')
          setCertToRevoke(null)
          setExistingCerts([])
          // Retry creating
          setStep('creating-certificate')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'creating-certificate')
        }
      })()
    }

    if (step === 'creating-profile') {
      ;(async () => {
        try {
          const token = await getFreshToken()
          const { bundleIdResourceId } = await ensureBundleId(token, iosBundleId)
          const profile = await createProfile(token, bundleIdResourceId, certData!.certificateId, iosBundleId)
          if (cancelled)
            return
          const profileResult: ProfileData = {
            profileId: profile.profileId,
            profileName: profile.profileName,
            profileBase64: profile.profileContent,
          }
          setProfileData(profileResult)
          // Update progress
          const progress = await loadProgress(appId)
          if (progress) {
            progress.completedSteps.profileCreated = profileResult
            await saveProgress(appId, progress)
          }
          addLog(`✔ Provisioning profile created — "${profile.profileName}"`)
          setRetryCount(0)
          setStep('saving-credentials')
        }
        catch (err) {
          if (cancelled)
            return
          if (err instanceof DuplicateProfileError) {
            // Record origin so deleting-duplicate-profiles retries the
            // right path (create-new vs import D2).
            setDuplicateProfileOrigin('creating-profile')
            setDuplicateProfiles(err.profiles)
            setStep('duplicate-profile-prompt')
          }
          else {
            handleError(err, 'creating-profile')
          }
        }
      })()
    }

    if (step === 'deleting-duplicate-profiles') {
      ;(async () => {
        try {
          const token = await getFreshToken()
          // Delete all duplicate profiles
          for (const profile of duplicateProfiles) {
            await deleteProfile(token, profile.id)
          }
          if (cancelled)
            return
          addLog(`✔ Removed ${duplicateProfiles.length} old profile(s)`)
          setDuplicateProfiles([])
          // Retry the step that originally raised the duplicate — import D2
          // or the create-new path. duplicateProfileOrigin is set wherever
          // DuplicateProfileError is caught and routed here.
          setStep(duplicateProfileOrigin)
        }
        catch (err) {
          if (!cancelled)
            handleError(err, duplicateProfileOrigin)
        }
      })()
    }

    if (step === 'saving-credentials') {
      ;(async () => {
        try {
          const credentials = await doSaveCredentials()
          if (cancelled)
            return
          // Stash CI secret entries for later. We do NOT push to GitHub/GitLab
          // yet — the wizard now offers that step only AFTER a successful first
          // build, so users never end up with orphan secrets in a repo whose
          // build was never proven to work.
          //
          // Pass the API key so CAPGO_TOKEN gets included in the bundle — the
          // generated GitHub Actions workflow references ${{ secrets.CAPGO_TOKEN }}
          // for --apikey, and users who pick "secrets only" still benefit from
          // having it ready in their repo for a workflow they'll write later.
          const capgoKey = apikey ?? findSavedKeySilent()
          const entries = createCiSecretEntries(credentials, capgoKey ?? undefined)
          setCiSecretEntries(entries)
          // Stash the raw credentials so the .env-export branch can write the
          // same shape `build credentials manage`'s export writes — without the
          // CAPGO_TOKEN entry, which only belongs in CI secrets, not in a .env
          // meant as a local CI-setup reference.
          setSavedCredentials(credentials)
          setStep('ask-build')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'saving-credentials')
        }
      })()
    }

    if (step === 'detecting-ci-secrets') {
      ;(async () => {
        try {
          const discovery = detectCiSecretTargets()
          if (cancelled)
            return
          setCiSecretTargets(discovery.targets)
          setCiSecretSetupAdvice(discovery.setup)
          if (discovery.targets.length === 0) {
            if (discovery.setup.length > 0) {
              setStep('ci-secrets-setup')
              return
            }
            for (const note of discovery.notes)
              addLog(`ℹ ${note}`, 'yellow')
            setStep('build-complete')
            return
          }
          if (discovery.targets.length === 1) {
            const target = discovery.targets[0]
            setCiSecretTarget(target)
            // GitHub gets the new 3-option flow ("secrets + workflow" / "secrets only" / "no").
            // GitLab keeps the existing 2-option flow — workflow generation for GitLab CI is
            // out of scope for v1.
            setStep(target.provider === 'github' ? 'ask-github-actions-setup' : 'ask-ci-secrets')
            return
          }
          setStep('ci-secrets-target-select')
        }
        catch (err) {
          if (!cancelled) {
            setCiSecretError(err instanceof Error ? err.message : String(err))
            setStep('ci-secrets-failed')
          }
        }
      })()
    }

    if (step === 'checking-ci-secrets') {
      ;(async () => {
        try {
          if (!ciSecretTarget)
            throw new Error('No git hosting target selected.')
          // Phase 1: Resolve the target repo. Uses async runner so the
          // spinner keeps animating during the gh shell-out.
          setCiSecretCheckPhase('Resolving GitHub repository…')
          let repoLabel: string | null = null
          if (ciSecretTarget.provider === 'github') {
            repoLabel = await getCiSecretRepoLabelAsync(ciSecretTarget)
            if (cancelled)
              return
            if (!repoLabel) {
              setCiSecretRepoLabel(null)
              setCiSecretError('Could not resolve the GitHub repository. Run `gh repo view` from this directory, then try again.')
              setStep('ci-secrets-failed')
              return
            }
            setCiSecretRepoLabel(repoLabel)
          }
          // Phase 2: List existing secrets to figure out what NEW vs REPLACE
          // means. Uses a label that includes the resolved repo when we have it.
          setCiSecretCheckPhase(repoLabel
            ? `Checking existing env vars in ${repoLabel}…`
            : `Checking existing env vars in ${getCiSecretTargetLabel(ciSecretTarget)}…`)
          const existing = await listExistingCiSecretKeysAsync(ciSecretTarget, ciSecretEntries.map(entry => entry.key))
          if (cancelled)
            return
          setCiSecretExistingKeys(existing)
          // GitHub: ALWAYS gate on confirm-secrets-push (target repo + full
          // list). GitLab: legacy confirm-on-collision behaviour for v1.
          if (ciSecretTarget.provider === 'github') {
            setStep('confirm-secrets-push')
            return
          }
          setStep(existing.length > 0 ? 'confirm-ci-secret-overwrite' : 'uploading-ci-secrets')
        }
        catch (err) {
          if (!cancelled) {
            setCiSecretError(err instanceof Error ? err.message : String(err))
            setStep('ci-secrets-failed')
          }
        }
      })()
    }

    if (step === 'uploading-ci-secrets') {
      ;(async () => {
        try {
          if (!ciSecretTarget)
            throw new Error('No git hosting target selected.')
          await uploadCiSecretsAsync(
            ciSecretTarget,
            ciSecretEntries,
            ciSecretExistingKeys,
            undefined, // default async runner
            (current, total, key) => {
              if (!cancelled)
                setCiSecretUploadProgress({ current, total, key })
            },
          )
          if (cancelled)
            return
          setCiSecretUploadProgress(null)
          const summary = `Uploaded ${ciSecretEntries.length} env var${ciSecretEntries.length === 1 ? '' : 's'} to ${getCiSecretTargetLabel(ciSecretTarget)}`
          setCiSecretUploadSummary(summary)
          addLog(`✔ ${summary}`)
          // Branch on what the user picked at ask-github-actions-setup. The
          // GitLab path leaves setupMode='undecided' and falls through to
          // build-complete just like before.
          if (setupMode === 'with-workflow') {
            // Eager-load the package.json scripts and the project-type-aware
            // recommendation here so the pick-build-script screen can render
            // synchronously and the user doesn't see a loading flicker.
            try {
              const scripts = getPackageScripts() ?? {}
              setAvailableScripts(scripts)
              const projectType = await findProjectType({ quiet: true }).catch(() => null)
              if (projectType) {
                const recommended = await findBuildCommandForProjectType(projectType).catch(() => null)
                if (recommended && Object.hasOwn(scripts, recommended))
                  setRecommendedScript(recommended)
              }
            }
            catch (err) {
              appendInternalLog(`build-script detection failed, falling back to manual entry: ${err instanceof Error ? err.message : String(err)}`)
              // Detection is best-effort; pick-build-script falls back to the
              // empty scripts list + "type a custom command" / "skip" options.
            }
            // Land at pick-package-manager first — we DETECT via getPMAndCommand
            // but the user explicitly confirms before we generate a workflow.
            setStep('pick-package-manager')
            return
          }
          setStep('build-complete')
        }
        catch (err) {
          if (!cancelled) {
            setCiSecretError(err instanceof Error ? err.message : String(err))
            setStep('ci-secrets-failed')
          }
        }
      })()
    }

    if (step === 'preview-workflow-file') {
      ;(() => {
        try {
          if (!buildScriptChoice)
            throw new Error('Internal error: no build script choice recorded.')
          // Generate proposed content for the diff. Pure function — calling
          // it twice (once here, once in writing-workflow-file) is fine.
          const proposed = generateWorkflow({
            appId,
            defaultPlatform: 'ios',
            packageManager: selectedPackageManager ?? normalizePackageManager(pm.pm),
            buildScript: buildScriptChoice,
            secretKeys: ciSecretEntries.map(entry => entry.key),
          })
          const absolutePath = resolve(process.cwd(), WORKFLOW_GEN_PATH)
          let existing = ''
          let isNew = true
          if (existsSync(absolutePath)) {
            try {
              existing = readFileSync(absolutePath, 'utf8')
              isNew = false
            }
            catch (err) {
              appendInternalLog(`workflow file not readable, treating as new: ${err instanceof Error ? err.message : String(err)}`)
              // Treat unreadable file as "new" — the writing step will surface
              // any real failure to the user.
            }
          }
          if (cancelled)
            return
          const diff = diffLines(existing, proposed.content)
          const telemetry = getWorkflowDiffTelemetry(diff, isNew)
          setPreviewExistingPath(absolutePath)
          setPreviewIsNew(isNew)
          setPreviewTelemetry(telemetry)
          setPreviewDiff(diff)
          trackWorkflowEvent('workflow-preview-prepared', { diff, isNew })
        }
        catch (err) {
          if (!cancelled) {
            addLog(`⚠ Failed to build workflow preview: ${err instanceof Error ? err.message : String(err)}`, 'yellow')
            setStep('build-complete')
          }
        }
      })()
    }

    if (step === 'writing-workflow-file') {
      ;(() => {
        try {
          if (!buildScriptChoice)
            throw new Error('Internal error: no build script choice recorded.')
          const result = writeWorkflowFile(
            {
              appId,
              defaultPlatform: 'ios',
              packageManager: selectedPackageManager ?? normalizePackageManager(pm.pm),
              buildScript: buildScriptChoice,
              secretKeys: ciSecretEntries.map(entry => entry.key),
            },
            { overwrite: true },
          )
          if (cancelled)
            return
          if (result.kind === 'written') {
            setWorkflowWrittenPath(result.absolutePath)
            addLog(`✔ ${previewIsNew ? 'Wrote' : 'Overwrote'} ${WORKFLOW_PATH}`)
            trackWorkflowEvent('workflow-file-written', { decision: 'write' })
          }
          setTimeout(() => {
            if (!cancelled)
              setStep('build-complete')
          }, 150)
        }
        catch (err) {
          if (!cancelled) {
            addLog(`⚠ Failed to write workflow file: ${err instanceof Error ? err.message : String(err)}`, 'yellow')
            setTimeout(() => {
              if (!cancelled)
                setStep('build-complete')
            }, 150)
          }
        }
      })()
    }

    if (step === 'exporting-env') {
      ;(() => {
        try {
          const targetPath = envExportTargetPath || defaultExportPath(appId, 'ios')
          const result = exportCredentialsToEnv({
            appId,
            platform: 'ios',
            credentials: savedCredentials ?? {},
            targetPath,
          })
          if (cancelled)
            return
          if (result.kind === 'empty') {
            setEnvExportError('No credentials to export — saved state is empty.')
            setStep('build-complete')
            return
          }
          if (result.kind === 'exists') {
            setEnvExportTargetPath(result.path)
            setStep('confirm-env-export-overwrite')
            return
          }
          setEnvExportPath(result.path)
          addLog(`✔ Exported ${result.fieldCount} field${result.fieldCount === 1 ? '' : 's'} → ${result.path}`)
          setStep('build-complete')
        }
        catch (err) {
          if (!cancelled) {
            setEnvExportError(err instanceof Error ? err.message : String(err))
            setStep('build-complete')
          }
        }
      })()
    }

    if (step === 'overwrite-and-export-env') {
      ;(() => {
        try {
          const result = exportCredentialsToEnv({
            appId,
            platform: 'ios',
            credentials: savedCredentials ?? {},
            targetPath: envExportTargetPath,
            overwrite: true,
          })
          if (cancelled)
            return
          if (result.kind === 'written') {
            setEnvExportPath(result.path)
            addLog(`✔ Overwrote ${result.path} with ${result.fieldCount} field${result.fieldCount === 1 ? '' : 's'}`)
          }
          setStep('build-complete')
        }
        catch (err) {
          if (!cancelled) {
            setEnvExportError(err instanceof Error ? err.message : String(err))
            setStep('build-complete')
          }
        }
      })()
    }

    if (step === 'requesting-build') {
      ;(async () => {
        try {
          const capgoKey = apikey ?? findSavedKeySilent()
          if (!capgoKey) {
            setBuildOutput(prev => [...prev, '⚠ No Capgo API key found.'])
            setBuildOutput(prev => [...prev, `Run \`${loginCommand}\` first, then \`${buildRequestCommand}\`.`])
            setStep('build-complete')
            return
          }

          // Use BuildLogger callbacks — no stdout/stderr interception needed
          const buildLogger: BuildLogger = {
            info: (msg: string) => setBuildOutput(prev => [...prev, msg]),
            error: (msg: string) => setBuildOutput(prev => [...prev, `✖ ${msg}`]),
            warn: (msg: string) => setBuildOutput(prev => [...prev, `⚠ ${msg}`]),
            success: (msg: string) => setBuildOutput(prev => [...prev, `✔ ${msg}`]),
            buildLog: (msg: string) => setBuildOutput(prev => [...prev, ...sanitizeBuildLogLines(msg)]),
            uploadProgress: (percent: number) => {
              setBuildOutput((prev) => {
                const uploadLineIdx = prev.findIndex(l => l.startsWith('Uploading:'))
                const line = `Uploading: ${percent.toFixed(0)}%`
                if (uploadLineIdx >= 0) {
                  const next = [...prev]
                  next[uploadLineIdx] = line
                  return next
                }
                return [...prev, line]
              })
            },
            customMsg: async (kind: string, data: Record<string, unknown>) => {
              await handleCustomMsg(
                kind,
                data,
                (line: string) => setBuildOutput(prev => [...prev, line]),
                (line: string) => setBuildOutput(prev => [...prev, line]),
              )
            },
          }

          setBuildOutput([`Requesting build for ${appId} (ios)...`])
          const result = await requestBuildInternal(appId, {
            platform: 'ios',
            apikey: capgoKey,
            // The Ink TUI owns the terminal — @clack/prompts inside
            // requestBuildInternal would corrupt rendering. Caller-handled mode
            // surfaces the captured log path via result.aiAnalysis and lets us
            // render the AI flow with Ink-native components.
            supaHost,
            aiAnalysisMode: 'caller-handled',
          }, true, buildLogger) // silent=true, use our logger
          if (cancelled)
            return
          if (result.success) {
            const url = `https://capgo.app/app/${appId}/builds`
            setBuildUrl(url)
            setBuildOutput(prev => [...prev, '', `✔ Build queued — ${url}`])
            // Only offer to push CI secrets AFTER we've successfully queued a
            // build. If the build request failed (else branch) or we never had
            // any credentials to push (entries empty), skip straight to exit.
            if (ciSecretEntries.length > 0) {
              setStep('detecting-ci-secrets')
              return
            }
          }
          else {
            setBuildOutput(prev => [...prev, `⚠ ${result.error || 'unknown error'}`])
            // If logs were captured we can offer AI-assisted diagnosis. The
            // captured log file stays on disk until the user views the result
            // (or skips); 'ai-analysis-result' calls releaseCapturedLogs on exit.
            if (result.aiAnalysis?.ready && result.aiAnalysis.jobId) {
              setAiJobId(result.aiAnalysis.jobId)
              setStep('ai-analysis-prompt')
              return
            }
          }
          setStep('build-complete')
        }
        catch (err) {
          // Build failure is non-fatal — credentials are saved
          if (!cancelled) {
            setBuildOutput(prev => [...prev, `⚠ ${err instanceof Error ? err.message : String(err)}`])
            setBuildOutput(prev => [...prev, `Your credentials are saved. Run \`${buildRequestCommand}\` to try again.`])
            setStep('build-complete')
          }
        }
      })()
    }

    // AI analysis — entered only when requestBuildInternal returned with
    // aiAnalysis.ready=true. The captured log file is on disk; we call the
    // edge function, then transition to 'ai-analysis-result' which renders the
    // diagnosis (or a friendly fallback message) and waits for Enter.
    if (step === 'ai-analysis-running' && aiJobId) {
      ;(async () => {
        // Fire the Choice telemetry here (not in 'ai-analysis-prompt'): we only
        // know the user picked "Debug with AI" because we landed in `running`.
        await trackAiAnalysisChoice({
          apikey: resolvedApiKeyRef.current ?? apikey ?? '',
          orgId: resolvedOrgId ?? '',
          appId,
          platform: 'ios',
          jobId: aiJobId,
          choice: 'capgo_ai',
          triggeredBy: 'onboarding',
        }).catch(() => { /* telemetry never breaks the wizard */ })

        // Reset any stale preview from a previous attempt BEFORE streaming
        // starts — retries re-enter this step and must not flash old content.
        setAiStreamPreview('')
        // Stream the analysis into a throttled ANSI preview: each completed
        // markdown line is rendered (same renderer as the plain CLI) and the
        // accumulated text is flushed to state at most every 250ms.
        let streamedAnsi = ''
        let previewFlushTimer: ReturnType<typeof setTimeout> | null = null
        const mdStream = createStreamingMarkdownRenderer((t) => {
          streamedAnsi += t
          previewFlushTimer ??= setTimeout(() => {
            previewFlushTimer = null
            if (!cancelled)
              setAiStreamPreview(streamedAnsi)
          }, 250)
        }, true)

        const result = await runCapgoAiAnalysis({
          apiHost: supaHost ?? 'https://api.capgo.app',
          apikey: resolvedApiKeyRef.current ?? apikey ?? '',
          jobId: aiJobId,
          appId,
          onChunk: t => mdStream.feed(t),
        })

        // Publish the complete preview: flush renders the trailing partial
        // line (it may re-arm the publish timer via the write callback, so
        // flush FIRST, then cancel the timer, then set state once). The
        // result step replaces this in the same React batch; the reset at
        // the top of this block keeps retries clean.
        mdStream.flush()
        if (previewFlushTimer) {
          clearTimeout(previewFlushTimer)
          previewFlushTimer = null
        }
        if (!cancelled)
          setAiStreamPreview(streamedAnsi)

        if (cancelled)
          return

        const resultTag = aiAnalysisResultFromPostAnalyze(result)

        await trackAiAnalysisResult({
          apikey: resolvedApiKeyRef.current ?? apikey ?? '',
          orgId: resolvedOrgId ?? '',
          appId,
          platform: 'ios',
          jobId: aiJobId,
          result: resultTag,
          errorStatus: result.kind === 'error' ? result.status : undefined,
        }).catch(() => { /* telemetry never breaks the wizard */ })

        if (result.kind === 'ok') {
          // Render markdown to ANSI escapes; Ink <Text> passes them through.
          // Fall back to raw text if a future Ink version stops doing so.
          setAiAnalysisText(renderMarkdown(result.analysis, true))
          setAiResult(null)
        }
        else if (result.kind === 'already_analyzed') {
          setAiAnalysisText(null)
          setAiResult({ kind: 'already_analyzed', message: 'AI analysis was already requested for this build (only one per job).' })
        }
        else if (result.kind === 'too_big') {
          setAiAnalysisText(null)
          setAiResult({ kind: 'too_big', message: 'Build log is too large for Capgo AI (>10 MB). Try a local AI tool with the captured log.' })
        }
        else if (result.kind === 'upgrade_required') {
          setAiAnalysisText(null)
          setAiResult({ kind: 'error', message: result.message ?? 'AI build analysis requires a newer CLI. Please upgrade: npx @capgo/cli@latest' })
        }
        else {
          setAiAnalysisText(null)
          const detail = [
            result.status ? `(status ${result.status})` : null,
            result.message,
          ].filter(Boolean).join(' ')
          setAiResult({
            kind: 'error',
            message: result.partial
              ? `AI analysis was interrupted${detail ? `: ${detail}` : ''}. The captured log is saved for local AI.`
              : `AI analysis failed${detail ? `: ${detail}` : ''}.`,
          })
        }
        setStep('ai-analysis-result')
      })()
    }

    if (step === 'build-complete') {
      setBuildOutput([])
      // Report a successful outcome + the durable summary to the shell/caller, so
      // it can reprint the build URL + generated file paths to the PRIMARY buffer
      // (the alt-screen final frame is wiped on exit). This is the ONLY place that
      // fires 'completed'; every other exit stays 'cancelled' by default.
      onResult?.({
        outcome: 'completed',
        summary: {
          buildUrl: buildUrl || undefined,
          ciSecretUploadSummary,
          workflowFilePath: workflowWrittenPath,
          envExportPath,
          buildRequestCommand,
        },
      })
      // Best-effort cleanup of any leftover captured log file. Safe to call
      // even if we never entered the AI flow (operates only on jobs we know).
      if (aiJobId) {
        void releaseCapturedLogs(aiJobId).catch(() => { /* best-effort */ })
      }
      // Do NOT auto-exit here. On the alt-screen, exit() restores the primary
      // buffer and wipes this success frame instantly — the user never gets to
      // read it. Stay rendered; a keypress (handled in useInput) exits, after
      // which command.ts reprints the durable summary to the primary buffer.
      return () => {
        cancelled = true
      }
    }

    return () => {
      cancelled = true
    }
  }, [step])

  // Kill the guided helper child ONLY when the whole onboarding unmounts (the
  // user quit / Ctrl+C) — NOT on every step transition. Aborting per-step could
  // tear down a still-running helper if the step ever churned; an unmount-scoped
  // cleanup fires once, at real exit, and otherwise leaves a live run alone.
  useEffect(() => {
    return () => {
      ascHelperAbortRef.current?.abort()
    }
  }, [])

  // Spinner-frame ticker for the in-flight profile prefetch cells. Runs only
  // while at least one entry in profilePrefetch is `pending`; the cleanup
  // function clears the interval the instant the last row resolves, AND on
  // unmount. setSpinnerFrame uses a functional update so we don't need to
  // re-establish the effect when the frame index changes.
  useEffect(() => {
    const anyPending = Object.values(profilePrefetch).some(p => p.kind === 'pending')
    if (!anyPending)
      return
    const id = setInterval(() => {
      setSpinnerFrame(prev => (prev + 1) % SPINNER_FRAMES.length)
    }, 100)
    return () => clearInterval(id)
  }, [profilePrefetch])

  // Route between the inline AI-result render and the scrollable fullscreen
  // viewer based on the LIVE terminal size — BIDIRECTIONALLY. Depends on the
  // terminal dimensions so it re-evaluates on resize: shrinking past the inline
  // budget opens the viewer, and growing back so it fits again returns to the
  // inline render. (Previously this was one-way — once the viewer opened it
  // never went back, leaving the user stuck in the scroll view with empty
  // space after enlarging the window.) `resolveAiResultRoute` is the single
  // source of truth, driven by one predicate so it can't oscillate.
  useEffect(() => {
    if (step !== 'ai-analysis-result' && step !== 'ai-analysis-result-scroll')
      return
    const next = resolveAiResultRoute({
      current: step,
      text: aiAnalysisText,
      viewedFull: aiViewedFull,
      terminalRows,
      terminalCols,
    })
    if (next)
      setStep(next)
  }, [step, aiAnalysisText, aiViewedFull, terminalRows, terminalCols])

  // Reset the error-viewer "dismissed" pin whenever we leave the error step, so
  // a NEW error re-opens the scrollable viewer. While on the error step it
  // persists, so dismissing the viewer keeps the compact form across resizes.
  useEffect(() => {
    if (step !== 'error')
      setErrorViewedFull(false)
  }, [step])

  // ── Render ──

  const progress = STEP_PROGRESS[step] ?? 0
  const phaseLabel = getPhaseLabel(step)
  // Header is a normal conditional: visible on every interactive step
  // including the AI sub-flow; hidden on `requesting-build`, the scrollable
  // AI viewer, and the fullscreen workflow diff (those want the full
  // viewport). Whether it renders as the bordered box or the one-line form is
  // decided by `headerCompact` above, from the measured body height vs the
  // live terminal height.
  const isAiResultScroll = step === 'ai-analysis-result-scroll'
  const isAiStep = step === 'ai-analysis-prompt' || step === 'ai-analysis-running' || step === 'ai-analysis-result' || isAiResultScroll
  // Tall fullscreen-style steps from the post-build GitHub Actions / .env
  // export flow. They run WITHOUT Progress + Logs so transitions don't flash
  // chrome in and out and leftover content from a previous tall step doesn't
  // bleed into the next short step's live area.
  const tallStep = step === 'detecting-ci-secrets'
    || step === 'checking-ci-secrets'
    || step === 'ask-github-actions-setup'
    || step === 'confirm-secrets-push'
    || step === 'uploading-ci-secrets'
    || step === 'ci-secrets-target-select'
    || step === 'ci-secrets-setup'
    || step === 'ask-ci-secrets'
    || step === 'pick-package-manager'
    || step === 'pick-build-script'
    || step === 'pick-build-script-custom'
    || step === 'preview-workflow-file'
    || step === 'view-workflow-diff'
    || step === 'writing-workflow-file'
    || step === 'ask-export-env'
    || step === 'exporting-env'
    || step === 'confirm-env-export-overwrite'
    || step === 'overwrite-and-export-env'
    || step === 'ci-secrets-failed'
    || step === 'confirm-ci-secret-overwrite'
  const showHeader = step !== 'requesting-build' && step !== 'view-workflow-diff' && !isAiResultScroll
  const showProgress = step !== 'welcome' && step !== 'platform-select' && step !== 'adding-platform' && step !== 'no-platform' && step !== 'error' && step !== 'build-complete' && step !== 'requesting-build' && step !== 'ai-analysis-result' && step !== 'support-confirm' && step !== 'support-log-view' && step !== 'support-uploading' && !isAiResultScroll && !tallStep
  const showLog = step !== 'requesting-build' && step !== 'build-complete' && !isAiStep && !tallStep
  const recoveryAdvice = error
    ? getBuildOnboardingRecoveryAdvice(error, retryStep, pm.runner, appId)
    : null
  // The iOS error screen's recovery advice is unbounded (42–54 rows). Like the
  // AI analysis + build log, it routes through the scrollable FullscreenAiViewer
  // when it's taller than the viewport, so the Try again / Restart / Exit actions
  // (rendered by the compact ErrorStep after the viewer is dismissed) are never
  // pushed off-screen. The decision uses a STRUCTURAL estimate of the comfortable
  // ErrorStep body (NOT measureElement — measuring the rendered body would
  // feedback-loop: the collapsed body measures short → "fits" → renders full →
  // measures tall → collapses again, forever). ERROR_FRAME_CHROME_ROWS is the
  // fixed header + log + padding reserve, calibrated against the VT harness at
  // ~15 rows for the boxed header; the compact-header case is shorter, so this
  // errs toward scroll — never toward a clip. `errorViewedFull` pins the compact
  // inline form once the user dismisses the viewer (mirrors aiViewedFull).
  const ERROR_FRAME_CHROME_ROWS = 15
  const errorViewerLines = error ? formatErrorViewerLines(error, recoveryAdvice, supportBundlePath) : []
  const errorTooTall = step === 'error' && !!error
    && estimateErrorBodyRows(error, recoveryAdvice, supportBundlePath, terminalCols, !!retryStep, !!aiJobId) + ERROR_FRAME_CHROME_ROWS > terminalRows
  const isErrorScroll = errorTooTall && !errorViewedFull

  // The streaming build output is a fullscreen takeover too — same reasoning as
  // the AI viewer below. Rendered inside the measured body, its unbounded growth
  // inflated bodyHeight and tripped `tooSmall`, replacing a live build with a
  // resize prompt on a perfectly usable terminal. As an early return it
  // auto-tails inside a viewport that always fits, so the build phase never
  // reports "terminal too small". (Must precede the `tooSmall` guard.)
  if (step === 'requesting-build')
    return <FullscreenBuildOutput title="Building..." lines={buildOutput} terminalRows={terminalRows} />

  // Size gate (resize-reactive): below the enforced floor, render the resize
  // prompt from THIS mounted component so all in-progress state (current step,
  // entered values) is preserved — a shrink shows the prompt, a re-grow shows
  // the exact same step. It's an early return after all hooks (rules of hooks
  // hold). Crucially this does NOT unmount the app: gating at the shell instead
  // would tear the app down on resize and fire its exit/teardown effects (the
  // "onboarding complete" flash + quit). The startup gate guarantees the floor
  // before mount; this keeps it guaranteed across mid-flow resizes.
  if (!terminalFitsOnboarding(terminalCols, terminalRows, 'ios'))
    return <TerminalTooSmallPrompt cols={terminalCols} rows={terminalRows} minRows={IOS_MIN_ROWS} />

  // (The wizard never clips on a too-small terminal: the gate above replaces it
  // with the resize prompt instead.)

  // The fullscreen AI viewer is a takeover: render it as an EARLY RETURN so it
  // owns the whole terminal and bypasses the regular wizard frame above. It
  // fills the screen itself via minHeight.
  if (isAiResultScroll && aiAnalysisText) {
    return (
      <FullscreenAiViewer
        title="AI analysis"
        subtitle={`${aiAnalysisText.split('\n').length} lines — scrollable because the analysis is taller than your terminal`}
        lines={aiAnalysisText.split('\n')}
        terminalRows={terminalRows}
        onExit={() => {
          setAiViewedFull(true)
          setStep('ai-analysis-result')
        }}
      />
    )
  }

  // "View logs first" from the support confirm — a scrollable takeover of the
  // exact bundle that will be sent (secrets already redacted). Exit returns to
  // the confirm so the user can then send or cancel.
  if (step === 'support-log-view') {
    return (
      <FullscreenAiViewer
        title="Logs that will be sent to Capgo support"
        subtitle={`${supportLogLines.length} lines — secrets are already removed.`}
        lines={supportLogLines}
        terminalRows={terminalRows}
        exitHint="Press Esc or Enter to go back to the send / cancel prompt."
        onExit={() => setStep('support-confirm')}
      />
    )
  }

  // The iOS error screen is a fullscreen scroll takeover when its recovery
  // advice is taller than the viewport — same treatment as the AI viewer above,
  // so the Try again / Restart / Exit actions (in the compact ErrorStep shown
  // after dismiss) are never pushed off-screen. Placed after the size gate like
  // the AI viewer: below the floor the resize prompt wins.
  if (isErrorScroll && error) {
    return (
      <FullscreenAiViewer
        title="Build error"
        subtitle={`${errorViewerLines.length} lines — scrollable because the error details are taller than your terminal`}
        lines={errorViewerLines}
        terminalRows={terminalRows}
        onExit={() => setErrorViewedFull(true)}
      />
    )
  }

  // The workflow-file diff is a fullscreen takeover too (same reasoning as the
  // AI/build viewers): rendered inside the wizard Box it inherited the header +
  // padding (a large top gap) and a too-short viewport. As an early return it
  // owns the whole terminal and fills it.
  if (step === 'view-workflow-diff' && previewDiff.length > 0) {
    return (
      <FullscreenDiffViewer
        title={previewIsNew
          ? `🆕  Proposed new file — ${previewExistingPath ?? WORKFLOW_PATH}`
          : `✏️  Proposed changes — ${previewExistingPath ?? WORKFLOW_PATH}`}
        subtitle={previewIsNew
          ? 'Nothing exists on disk yet. Every line below is what would be written.'
          : 'Proposed diff vs the file on disk. Lines marked - would be removed, lines marked + would be added.'}
        lines={previewDiff}
        terminalRows={terminalRows}
        onExit={() => {
          trackWorkflowEvent('workflow-diff-closed', { decision: 'close' })
          setStep('preview-workflow-file')
        }}
      />
    )
  }

  // `minHeight={terminalRows}` makes the root fill the whole viewport. Ink
  // only does a full clear-the-screen redraw when the frame height is ≥ the
  // terminal height; for shorter frames it uses an incremental cursor-up
  // redraw whose line math breaks after the terminal SHRINKS, leaving stale
  // rows from the previous (taller) frame on screen. Filling the viewport
  // forces the full-clear path on every frame, so resizing down never leaves
  // ghost content behind.
  return (
    <Box flexDirection="column" minHeight={terminalRows} padding={1}>
      {showHeader && <Header compact={headerCompact} />}
      {/* Banner stays pinned to the top; this flex spacer pushes the rest (log +
          step body) to the bottom of the viewport. On a tight terminal it
          collapses to zero (content fills the height), so the frame-fit contract
          is unaffected; on a tall terminal it absorbs the extra rows, and since
          both the banner (top) and the content (bottom) are anchored, neither
          jumps as the step's content height changes between steps. */}
      <Box flexGrow={1} />
      {/* Completed-steps log — rendered OUTSIDE the measured body so its growth
          can't inflate the dense / fit decision. Capped (see logMaxRows) to the
          rows the current step leaves; CompletedStepsLog drops its leading gap
          when it collapses to a single line so no orphaned blank survives. */}
      {showLog && <CompletedStepsLog entries={log} maxRows={logMaxRows} />}
      {/* Body: the current step (+ its progress bar). Measured via `bodyRef` to
          drive the dense / box-vs-compact-header / too-small decisions. The log
          above is excluded so the body height stays independent of how many
          steps have completed. */}
      <Box flexDirection="column" ref={bodyRef}>
        {/* Progress bar */}
        {showProgress && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="cyan">{phaseLabel}</Text>
            <Box marginTop={1}>
              <ProgressBar value={progress} />
              <Text dimColor>
                {' '}
                {progress}
                %
              </Text>
            </Box>
            <Divider />
          </Box>
        )}

        {/* Resume-or-restart prompt — only reachable when initialProgress is
          non-null AND getResumeStep didn't resolve to 'welcome'. The initial
          step useState above wires this branch. */}
        {step === 'resume-prompt' && initialProgress && (() => {
          const { startedAt, setupMethod, importDistribution: savedDist, completedSteps, iosBundleIdOverride } = initialProgress
          // Defensive date parse: legacy / corrupted progress files can carry an
          // unparseable startedAt — show the raw string with a dim suffix instead
          // of crashing the wizard.
          let whenLabel: string
          try {
            const d = new Date(startedAt)
            if (Number.isNaN(d.getTime()))
              throw new Error('NaN')
            whenLabel = d.toLocaleString()
          }
          catch {
            whenLabel = `${startedAt} (could not parse)`
          }
          const setupLabel = setupMethod === 'import-existing'
            ? 'Import existing credentials'
            : 'Create new via Apple'
          const distLabel = savedDist === 'app_store'
            ? 'App Store'
            : savedDist === 'ad_hoc' ? 'Ad Hoc' : null
          const keyVerified = Boolean(completedSteps.apiKeyVerified)
          const certCreated = Boolean(completedSteps.certificateCreated)
          const profileCreated = Boolean(completedSteps.profileCreated)
          const showBundleOverride = Boolean(
            iosBundleIdOverride && iosBundleIdOverride !== iosBundleIdInitial,
          )
          const resumeLabel = getPhaseLabel(startStep) || startStep
          return (
            <Box flexDirection="column" marginTop={1} gap={1}>
              <Text bold color="cyan">{`↩️  Found in-progress onboarding for ${appId}`}</Text>
              <Text>Pick up where you left off, or start over from the welcome step.</Text>
              <Box flexDirection="column">
                <Text>{`•  Started: ${whenLabel}`}</Text>
                <Text>{`•  Setup method: ${setupLabel}`}</Text>
                {distLabel && <Text>{`•  Distribution mode: ${distLabel}`}</Text>}
                <Text>{`•  ASC API key verified: ${keyVerified ? `Yes (Key: ${completedSteps.apiKeyVerified!.keyId})` : 'No'}`}</Text>
                <Text>{`•  Certificate created: ${certCreated ? `Yes (expires ${completedSteps.certificateCreated!.expirationDate})` : 'No'}`}</Text>
                <Text>{`•  Profile created: ${profileCreated ? `Yes ("${completedSteps.profileCreated!.profileName}")` : 'No'}`}</Text>
                {showBundleOverride && <Text>{`•  Confirmed iOS bundle id: ${iosBundleIdOverride}`}</Text>}
                <Text dimColor>{`•  Resume target: ${resumeLabel}`}</Text>
              </Box>
              <Select
                options={[
                  { label: '▶️  Continue from where I left off', value: 'continue' },
                  { label: '🔄  Restart onboarding (wipe saved progress)', value: 'restart' },
                ]}
                onChange={async (value) => {
                // Record which branch the user took. The funnel already shows
                // the resume-prompt step + the next step (welcome on restart,
                // the resume target on continue), but the explicit choice tag
                // gives a clean continue-vs-restart split without inferring it.
                  trackAction('resume_prompt_decision', { choice: value })
                  if (value === 'continue') {
                  // Now that the user has committed to picking up where
                  // they left off, replay the breadcrumb log so they see
                  // the in-progress state they're resuming into. Held
                  // back at mount so the resume-prompt screen itself
                  // wasn't surrounded by stale "Distribution · ad_hoc",
                  // "Key file selected · …" entries while they were
                  // still deciding.
                    hydrateCompletedLog()
                    setStep(startStep)
                    return
                  }
                  await resetForFreshStart()
                  addLog('↩️  Restarted — fresh start', 'yellow')
                  setStep('welcome')
                }}
              />
            </Box>
          )
        })()}

        {/* Welcome */}
        {step === 'welcome' && <WelcomeStep />}

        {/* Platform select */}
        {step === 'platform-select' && (
          <PlatformSelectStep
            appId={appId}
            dense={dense}
            onChange={async (value) => {
              if (value === 'android') {
              // The Android flow lives in a separate Ink app — this iOS app
              // can't host it inline. Exit cleanly and tell the user to
              // re-run with --platform android.
                addLog('Re-run with `npx @capgo/cli@latest build init --platform android` to set up Android.', 'cyan')
                exitOnboarding()
                return
              }
              // Check for existing credentials before proceeding
              const existing = await loadSavedCredentials(appId)
              if (existing?.ios) {
                setStep('credentials-exist')
              }
              else if (isMacOS()) {
              // macOS users see the fork: import existing or create new
                setStep('setup-method-select')
              }
              else {
              // Non-macOS hosts can only create new (importing requires Keychain)
                setStep('api-key-instructions')
              }
            }}
          />
        )}

        {/* No platform directory */}
        {step === 'no-platform' && (
          <NoPlatformStep
            iosDir={iosDir}
            addIosCommand={addIosCommand}
            syncIosCommand={syncIosCommand}
            dense={dense}
            onChange={(value) => {
              if (value === 'run') {
                setStep('adding-platform')
              }
              else if (value === 'recheck') {
                if (existsSync(join(process.cwd(), iosDir))) {
                  addLog(`✔ Found ${iosDir}/ — resuming onboarding.`)
                  ;(async () => {
                    const existing = await loadSavedCredentials(appId)
                    if (existing?.ios)
                      setStep('credentials-exist')
                    else
                      setStep('api-key-instructions')
                  })()
                }
                else {
                  addLog(`⚠ ${iosDir}/ is still missing. Try ${addIosCommand} or ${doctorCommand}.`, 'yellow')
                }
              }
              else {
                addLog(`Exiting. Run \`${buildInitCommand}\` after the native iOS folder exists.`, 'yellow')
                exitOnboarding()
              }
            }}
          />
        )}

        {step === 'adding-platform' && (
          <AddingPlatformStep addIosCommand={addIosCommand} doctorCommand={doctorCommand} dense={dense} />
        )}

        {/* Existing credentials warning */}
        {step === 'credentials-exist' && (
          <CredentialsExistStep
            appId={appId}
            dense={dense}
            onChange={(value) => {
              if (value === 'backup') {
                setStep('backing-up')
              }
              else {
                addLog('Exiting onboarding.', 'yellow')
                exitOnboarding()
              }
            }}
          />
        )}

        {/* Backing up credentials */}
        {step === 'backing-up' && <BackingUpStep />}

        {/* Setup-method fork (macOS only) */}
        {step === 'setup-method-select' && (
          <SetupMethodSelectStep
            dense={dense}
            onChange={async (value) => {
            // Persist the fork choice to progress so resume after CLI close
            // routes to the right path. Without this, an interrupted import
            // run resumes into the create-new path's `creating-certificate`
            // step and triggers the cert-limit error.
              const existing = await loadProgress(appId) || {
                platform: 'ios' as const,
                appId,
                startedAt: new Date().toISOString(),
                completedSteps: {},
              }
              // New object, not in-place mutation (immutability). Re-entering the
              // create fork clears any prior .p8 source choice so quitting before
              // re-choosing doesn't resume onto a path the user has since left.
              await saveProgress(appId, {
                ...existing,
                setupMethod: value === 'import' ? 'import-existing' : 'create-new',
                p8CreateMethod: value === 'import' ? existing.p8CreateMethod : undefined,
              })

              if (value === 'import') {
                setImportMode(true)
                setStep('import-scanning')
              }
              else {
                setImportMode(false)
                // Only ask "do you already have a .p8?" when answering it
                // actually changes the path — i.e. when the guided macOS helper
                // is available to offer. Otherwise both answers funnel to the
                // same manual instructions, so skip straight there (the pre-fork
                // behaviour on every non-automatable host: non-macOS, or macOS
                // without the helper binary).
                if (isMacOS() && resolveHelperBinary() !== null)
                  setStep('p8-source-select')
                else
                  setStep('api-key-instructions')
              }
            }}
          />
        )}

        {/* Do you already have a .p8 file? */}
        {step === 'p8-source-select' && (
          <P8SourceSelectStep
            dense={dense}
            canAutomate={isMacOS() && resolveHelperBinary() !== null}
            onChange={async (value) => {
              if (value === 'have') {
                await persistP8CreateMethod('manual')
                setStep('api-key-instructions')
              }
              else if (isMacOS() && resolveHelperBinary() !== null) {
              // No key yet, and we can drive the guided helper. The method
              // (automated vs manual) is persisted at p8-create-method-select.
                setStep('p8-create-method-select')
              }
              else {
              // No automation available — fall back to the manual instructions.
                await persistP8CreateMethod('manual')
                setStep('api-key-instructions')
              }
            }}
          />
        )}

        {/* How to create the .p8: guided helper vs by hand (macOS only) */}
        {step === 'p8-create-method-select' && (
          <P8CreateMethodSelectStep
            dense={dense}
            onChange={async (value) => {
              if (value === 'automated') {
                // Remember the guided path so a quit-and-resume re-launches the
                // helper instead of dropping the user on the manual .p8 picker.
                await persistP8CreateMethod('automated')
                setStep('asc-key-generating')
              }
              else {
                await persistP8CreateMethod('manual')
                setStep('api-key-instructions')
              }
            }}
          />
        )}

        {/* Guided helper is running in its own window */}
        {step === 'asc-key-generating' && <AscKeyGeneratingStep />}

        {/* Import: scanning */}
        {step === 'import-scanning' && <ImportScanningStep />}

        {/* Verify the App Store Connect app exists for the Release build id.
          app_store mode only; reached after verifying-key. The single
          invariant: an ASC app exists whose bundleId
          == the Release PRODUCT_BUNDLE_IDENTIFIER. The exact-match and
          fetch-failure cases are handled in the effect above (they transition
          straight through); this render only drives the picker + the two
          resolution-path gates. */}
        {step === 'verify-app' && (
          <Box flexDirection="column">
            {verifyDebugBundleId && verifyReleaseBundleId
              ? (
                  <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
                    <Text bold color="yellow">⚠  Debug and Release use different bundle IDs</Text>
                    <Text>
                      {'Debug builds '}
                      <Text bold>{verifyDebugBundleId}</Text>
                      {'   ·   Release builds '}
                      <Text bold color="cyan">{verifyReleaseBundleId}</Text>
                    </Text>
                    <Text>
                      {'Capgo Builder signs the '}
                      <Text bold color="cyan">Release</Text>
                      {' ID → '}
                      <Text bold color="cyan">{verifyReleaseBundleId}</Text>
                    </Text>
                  </Box>
                )
              : null}
            {(() => {
              if (verifyAppLoading) {
                return (
                  <Box flexDirection="column" marginTop={1}>
                    <SpinnerLine text="Checking App Store Connect for your app..." />
                    <Text dimColor>Fetching your apps and registered bundle IDs to verify the build matches a real App Store app.</Text>
                  </Box>
                )
              }

              const releaseId = verifyReleaseBundleId

              // Final pass: persist the verified Release id as the override and
              // continue to the pending target (creating-certificate).
              const passGate = async (path: GatePath, resolvedId: string) => {
                await persistVerifyOverride(resolvedId)
                trackVerifyEvent('iOS App Verify Passed', '✅', { attempts: verifyAttempt, path })
                setStep(pendingVerifyNext ?? 'creating-certificate')
                setPendingVerifyNext(null)
              }

              // Path A Continue — re-read pbxproj FRESH from disk (never the memo)
              // and re-check the Release build id against the chosen app.
              const continueFixBuildId = async () => {
                const fresh = detectIosBundleIds({ cwd: process.cwd(), iosDir, capacitorAppId: iosBundleIdInitial })
                const newRelease = fresh.releaseResolved && fresh.pbxproj ? fresh.pbxproj.value : ''
                setVerifyReleaseBundleId(newRelease)
                const satisfied = Boolean(verifyChosenApp) && newRelease === verifyChosenApp!.bundleId
                const attempt = verifyAttempt + 1
                const gate = evaluateGate({ satisfied, attempt })
                if (gate.proceed) {
                  addLog(`✓ Building "${verifyChosenApp!.name}" (${newRelease}) — matches your App Store app.`)
                  await passGate('fix-build-id', newRelease)
                  return
                }
                setVerifyAttempt(attempt)
                trackVerifyEvent('iOS App Verify Gate Blocked', '🚧', { attempt, path: 'fix-build-id' })
              }

              // Path A auto-fix — rewrite the Release PRODUCT_BUNDLE_IDENTIFIER in the
              // Xcode project to the chosen App Store app's bundle id, then re-check
              // (which now passes and advances the gate). Only PRODUCT_BUNDLE_IDENTIFIER
              // assignments equal to the current build id are touched; capacitor.config
              // is never modified.
              const autoFixBuildId = async () => {
                if (!verifyChosenApp)
                  return
                const target = verifyChosenApp.bundleId
                try {
                  const { changed } = writeReleaseBundleId(process.cwd(), iosDir, releaseId, target)
                  if (changed > 0) {
                    addLog(`🔧 Updated PRODUCT_BUNDLE_IDENTIFIER → "${target}" in your Xcode project.`)
                    trackVerifyEvent('iOS App Verify Auto Fixed', '🔧', { attempt: verifyAttempt, path: 'fix-build-id' })
                  }
                  else {
                    addLog(`⚠ Couldn't find PRODUCT_BUNDLE_IDENTIFIER "${releaseId}" to update — edit it in Xcode, then re-check.`, 'yellow')
                  }
                }
                catch {
                  addLog('⚠ Could not write to your Xcode project — edit PRODUCT_BUNDLE_IDENTIFIER manually, then re-check.', 'yellow')
                }
                // Re-check against disk; passes the gate when the write succeeded.
                await continueFixBuildId()
              }

              // Path B Continue — re-poll /v1/apps and check for an app matching the
              // Release build id. Never re-opens the browser automatically.
              const continueCreateApp = async () => {
                // Show the step's loader while we re-poll ASC (an async network call) —
                // otherwise the re-check feels instant and the user can't tell it ran.
                setVerifyAppLoading(true)
                const attempt = verifyAttempt + 1
                try {
                  const token = await getFreshToken()
                  const apps = await listApps(token)
                  setVerifyApps(apps)
                  const satisfied = apps.some(a => a.bundleId === releaseId)
                  if (evaluateGate({ satisfied, attempt }).proceed) {
                    const matched = apps.find(a => a.bundleId === releaseId)
                    addLog(`✓ Building "${matched?.name ?? releaseId}" (${releaseId}) — matches your App Store app.`)
                    await passGate('create-app', releaseId)
                    return
                  }
                  // Still not found — count the attempt so the escalating box visibly
                  // advances, then ask before re-opening the browser.
                  setVerifyAttempt(attempt)
                  setVerifyAskReopen(true)
                  trackVerifyEvent('iOS App Verify Gate Blocked', '🚧', { attempt, path: 'create-app' })
                }
                catch {
                  // Couldn't reach ASC — still count the attempt so the user sees the
                  // re-check happened (not a silent no-op) and surface a connectivity
                  // message distinct from "app still missing".
                  setVerifyAttempt(attempt)
                  setVerifyAskReopen(true)
                  addLog('⚠ Couldn\'t reach App Store Connect to re-check — check your connection and try again.', 'yellow')
                  trackVerifyEvent('iOS App Verify Gate Blocked', '🚧', { attempt, path: 'create-app' })
                }
                finally {
                  setVerifyAppLoading(false)
                }
              }

              // Open the ASC new-app page. Registers the identifier first (idempotent)
              // so it is selectable in the form. Opens ONLY on explicit choice.
              const openCreatePage = async () => {
                try {
                  const token = await getFreshToken()
                  await ensureBundleId(token, releaseId)
                }
                catch {
                  // Registration is best-effort — the user can still create the app
                  // and pick/register the id in the web form.
                }
                trackVerifyEvent('iOS App Verify Create App Opened', '🌐', { attempt: verifyAttempt })
                try {
                  await open('https://appstoreconnect.apple.com/apps')
                }
                catch {
                  addLog('⚠ Could not open your browser. Visit https://appstoreconnect.apple.com/apps to create the app.', 'yellow')
                }
                setVerifyAskReopen(false)
              }

              const cancelGate = (path: GatePath) => {
                trackVerifyEvent('iOS App Verify Cancelled', '🚫', { attempt: verifyAttempt, path })
                addLog('Exiting onboarding.', 'yellow')
                exitOnboarding()
              }

              // Return to the app picker (verifyPath === null) to choose a different
              // App Store app or switch to "create a new app". Resets the per-attempt
              // gate state so the re-picked target starts fresh.
              const backToPicker = () => {
                setVerifyPath(null)
                setVerifyChosenApp(null)
                setVerifyAttempt(0)
                setVerifyAskReopen(false)
              }

              // Escalating border colour ramp so a repeatedly-blocked gate never
              // looks frozen (spec: each blocked Continue must look visibly
              // different). Tops out at red.
              const escalation = evaluateGate({ satisfied: false, attempt: verifyAttempt }).escalationLevel
              const gateBorder = escalation >= 3 ? 'red' : escalation === 2 ? 'yellow' : 'cyan'
              const attemptMarker = verifyAttempt > 0 ? ` (attempt ${verifyAttempt})` : ''

              // ── Path A: fix the build id ──────────────────────────────────────
              if (verifyPath === 'fix-build-id' && verifyChosenApp) {
                const wrong = releaseId
                const right = verifyChosenApp.bundleId
                return (
                  <Box flexDirection="column" marginTop={1}>
                    <Box flexDirection="column" borderStyle="round" borderColor={gateBorder} paddingX={1}>
                      <Text bold color={gateBorder}>{`Build ID doesn't match "${verifyChosenApp.name}"${attemptMarker}`}</Text>
                      <Newline />
                      <Text>
                        {'Your project builds '}
                        <Text bold color="red">{wrong || '(no Release build ID resolved)'}</Text>
                        {', but the App Store app you picked is '}
                        <Text bold color="green">{right}</Text>
                        .
                      </Text>
                      <Newline />
                      <Text>
                        {'Set '}
                        <Text bold>PRODUCT_BUNDLE_IDENTIFIER</Text>
                        {' (Release) to '}
                        <Text bold color="cyan">{right}</Text>
                        {' — pick "Update … for me" below to do it automatically, or edit it in Xcode yourself and re-check.'}
                      </Text>
                      <Text dimColor>capacitor.config.appId can stay as-is — only the Release PRODUCT_BUNDLE_IDENTIFIER must match.</Text>
                    </Box>
                    <Newline />
                    <Select
                      key={`gate-a-${gateActionSeq}`}
                      options={[
                        { label: '🔧 Update PRODUCT_BUNDLE_IDENTIFIER for me', value: 'autofix' },
                        { label: '✅ I\'ve edited it myself — re-check', value: 'continue' },
                        { label: '↩  Back — pick a different app', value: 'back' },
                        { label: '❌ Cancel onboarding', value: 'cancel' },
                      ]}
                      onChange={(value) => {
                        setGateActionSeq(s => s + 1)
                        if (value === 'autofix')
                          void autoFixBuildId()
                        else if (value === 'continue')
                          void continueFixBuildId()
                        else if (value === 'back')
                          backToPicker()
                        else
                          cancelGate('fix-build-id')
                      }}
                    />
                  </Box>
                )
              }

              // ── Path B: create the app ────────────────────────────────────────
              if (verifyPath === 'create-app') {
                const alreadyRegistered = verifyRegisteredIds.includes(releaseId)
                // After a blocked re-poll we ASK before re-opening the browser.
                if (verifyAskReopen) {
                  return (
                    <Box flexDirection="column" marginTop={1}>
                      <Box flexDirection="column" borderStyle="round" borderColor={gateBorder} paddingX={1}>
                        <Text bold color={gateBorder}>{`Still no App Store app for ${releaseId}${attemptMarker}`}</Text>
                        <Newline />
                        <Text>
                          {`We re-checked App Store Connect and didn't find an app whose bundle ID is `}
                          <Text bold color="cyan">{releaseId}</Text>
                          .
                        </Text>
                        <Text dimColor>Create the app on appstoreconnect.com (the API cannot create apps), then re-check.</Text>
                      </Box>
                      <Newline />
                      <Select
                        key={`gate-b-reopen-${gateActionSeq}`}
                        options={[
                          { label: '🔁 I\'ve created it — re-check', value: 'recheck' },
                          { label: '🌐 Re-open the create-app page', value: 'reopen' },
                          { label: '❌ Cancel onboarding', value: 'cancel' },
                        ]}
                        onChange={(value) => {
                          setGateActionSeq(s => s + 1)
                          if (value === 'recheck')
                            void continueCreateApp()
                          else if (value === 'reopen')
                            void openCreatePage()
                          else
                            cancelGate('create-app')
                        }}
                      />
                    </Box>
                  )
                }
                return (
                  <Box flexDirection="column" marginTop={1}>
                    <Box flexDirection="column" borderStyle="round" borderColor={gateBorder} paddingX={1}>
                      <Text bold color={gateBorder}>{`No App Store app exists for ${releaseId}${attemptMarker}`}</Text>
                      <Newline />
                      <Text>
                        {'Your project builds '}
                        <Text bold color="cyan">{releaseId}</Text>
                        {`, but there's no App Store Connect app with that bundle ID yet. An app_store build needs one to upload to.`}
                      </Text>
                      <Newline />
                      <Text dimColor>
                        {alreadyRegistered
                          ? `The identifier ${releaseId} is already registered in your Developer account — select it when creating the app.`
                          : `We'll register the identifier ${releaseId} (so it's selectable) when you open the create-app page.`}
                      </Text>
                      <Text dimColor>The App Store Connect API cannot create apps — this is a one-time manual step on the web.</Text>
                    </Box>
                    <Newline />
                    <Select
                      key={`gate-b-${gateActionSeq}`}
                      options={[
                        { label: '🌐 Open App Store Connect to create the app', value: 'open' },
                        { label: '🔁 I\'ve already created it — re-check', value: 'recheck' },
                        ...(verifyApps.length > 0 ? [{ label: '↩  Back — pick an existing app', value: 'back' }] : []),
                        { label: '❌ Cancel onboarding', value: 'cancel' },
                      ]}
                      onChange={(value) => {
                        setGateActionSeq(s => s + 1)
                        if (value === 'open')
                          void openCreatePage()
                        else if (value === 'recheck')
                          void continueCreateApp()
                        else if (value === 'back')
                          backToPicker()
                        else
                          cancelGate('create-app')
                      }}
                    />
                  </Box>
                )
              }

              // ── Picker (wrong-build-id): account has apps, none match the build
              //    id. Let the user pick the intended app (→ Path A) or declare the
              //    build id correct and create a new app (→ Path B). ──────────────
              return (
                <Box flexDirection="column" marginTop={1}>
                  <Alert variant="warning">
                    {`No App Store app matches the bundle ID your project builds (${releaseId}).`}
                  </Alert>
                  <Newline />
                  <Text dimColor>
                    {`An app_store build signs the Release PRODUCT_BUNDLE_IDENTIFIER and uploads to the App Store app with the same bundle ID. None of your apps use ${releaseId}, so the upload would be rejected. Which app are you building?`}
                  </Text>
                  <Newline />
                  <Select
                    options={[
                      ...verifyApps.map(a => ({
                        label: `${a.name} — ${a.bundleId}`,
                        value: a.bundleId,
                      })),
                      { label: '➕ None of these — my build ID is correct, create a new app', value: '__create_new__' },
                    ]}
                    onChange={(value) => {
                      if (value === '__create_new__') {
                        trackVerifyEvent('iOS App Verify Picked', '👆', { matches_build_id: false, chose_create_new: true })
                        setVerifyPath('create-app')
                        return
                      }
                      const chosen = verifyApps.find(a => a.bundleId === value) ?? null
                      trackVerifyEvent('iOS App Verify Picked', '👆', {
                        matches_build_id: value === releaseId,
                        chose_create_new: false,
                      })
                      if (chosen && chosen.bundleId === releaseId) {
                        // Already matches — pass straight through (defensive; the
                        // exact-match case is normally handled in the effect).
                        addLog(`✓ Building "${chosen.name}" (${releaseId}) — matches your App Store app.`)
                        void (async () => {
                          try {
                            await passGate('fix-build-id', releaseId)
                          }
                          catch {
                            addLog('⚠ Could not save the verified bundle ID; you may be re-prompted next run.', 'yellow')
                          }
                        })()
                        return
                      }
                      setVerifyChosenApp(chosen)
                      setVerifyPath('fix-build-id')
                    }}
                  />
                </Box>
              )
            })()}
          </Box>
        )}

        {/* Import: distribution mode (now FIRST visible step in import flow) */}
        {step === 'import-distribution-mode' && (
          <ImportDistributionModeStep
            dense={dense}
            onChange={async (value) => {
              if (value === '__cancel__') {
                setImportMode(false)
                // Clear the persisted import-distribution and setupMethod since
                // the user is bailing to the create-new path.
                const existing = await loadProgress(appId)
                if (existing) {
                  existing.setupMethod = 'create-new'
                  delete existing.importDistribution
                  await saveProgress(appId, existing)
                }
                setStep('api-key-instructions')
                return
              }
              const mode = value as 'app_store' | 'ad_hoc'
              setImportDistribution(mode)
              // Persist so a CLI restart at any later step (incl. verifying-key
              // or saving-credentials) knows we're in app_store vs ad_hoc.
              // Codex caught a bug where without this, resumed sessions
              // re-entered the create-new path via the stale `importMode=false`
              // default — fixed here by hydrating both fields on mount.
              const existing = await loadProgress(appId) || {
                platform: 'ios' as const,
                appId,
                startedAt: new Date().toISOString(),
                completedSteps: {},
              }
              existing.setupMethod = 'import-existing'
              existing.importDistribution = mode
              await saveProgress(appId, existing)
              upsertLog('✔ Distribution · ', `✔ Distribution · ${mode}`)
              if (mode === 'app_store') {
              // Need .p8 for TestFlight upload AND for any profile auto-recovery.
              // After verifying-key the import-mode branch routes back to import-pick-identity.
              // Skip the .p8 input chain entirely if the key was already
              // verified on a previous attempt (resume) — otherwise we
              // re-ask "How do you want to provide the .p8 file?" even
              // though APPLE_KEY_CONTENT is already known. Use the same
              // routing decision as the post-scan entry point.
                setStep(getImportEntryStep(existing))
              }
              else {
              // ad_hoc skips .p8; can opt into it later from no-match recovery.
              // Surface the support hint up-front rather than waiting until
              // the user is mid-recovery in the portal-explanation step —
              // they've now committed to the harder path and deserve to
              // know help is available before they hit a wall. The helper
              // is idempotent across the session, so re-picking Ad Hoc
              // after a back-navigation doesn't re-emit.
                logAdHocSupportHint()
                setStep('import-pick-identity')
              }
            }}
          />
        )}

        {/* Import: validating all certs with Apple — eager batch */}
        {step === 'import-validating-all-certs' && (
          <Box flexDirection="column" marginTop={1}>
            <SpinnerLine text={`Validating ${importMatches.length} certificate${importMatches.length === 1 ? '' : 's'} with Apple...`} />
            <Text dimColor>Splitting into Available / Unavailable so we only offer options that can succeed.</Text>
          </Box>
        )}

        {/* Import: per-identity Apple check + auto-fetch profile */}
        {step === 'import-checking-apple-cert' && chosenIdentity && (
          <Box flexDirection="column" marginTop={1}>
            <SpinnerLine text={`Checking Apple for matching profiles for "${chosenIdentity.name}"...`} />
            <Text dimColor>Looking up the cert + listing its profiles so we either auto-import or only show recovery options that can succeed.</Text>
          </Box>
        )}

        {/* Import: pick identity — two-table picker (Available + Unavailable)
          when we have classification data from import-validating-all-certs;
          falls back to main's flat list when not. */}
        {step === 'import-pick-identity' && (() => {
          const haveClassification = Object.keys(identityAvailability).length > 0
          // Partition identities. When the batch validation didn't run
          // (no API key yet) every identity lands in "available" so the
          // user gets the unfiltered list — they can still recover from
          // each pick via the no-match menu / per-identity check.
          const available: IdentityProfileMatch[] = []
          const unavailable: IdentityProfileMatch[] = []
          for (const m of importMatches) {
            const a = identityAvailability[m.identity.sha1]
            if (!haveClassification || a?.available)
              available.push(m)
            else
              unavailable.push(m)
          }

          const onPick = async (value: string) => {
            if (value === '__cancel__') {
              setImportMode(false)
              const existing = await loadProgress(appId)
              if (existing) {
                existing.setupMethod = 'create-new'
                delete existing.importDistribution
                await saveProgress(appId, existing)
              }
              setStep('api-key-instructions')
              return
            }
            const match = importMatches.find(m => m.identity.sha1 === value)
            if (!match)
              return
            setChosenIdentity(match.identity)
            // Clear stale per-identity cert id from a previous pick so the
            // per-identity check doesn't trust an old result.
            setAppleCertIdForChosen(undefined)
            addLog(`✔ Identity · ${match.identity.name}`)
            // Three-way routing:
            //   - Local profile already matches → straight to picker
            //   - No local match but ASC key available + cert is verified
            //     by the batch validation → per-identity check (auto-fetch
            //     from Apple before showing recovery menu)
            //   - Otherwise → straight to recovery menu
            const usable = filterProfilesForApp(match.profiles, iosBundleId, importDistribution)
            if (usable.length > 0) {
              setStep('import-pick-profile')
              return
            }
            const apiKeyAvailable = !!(p8ContentRef.current || (await loadProgress(appId))?.completedSteps?.apiKeyVerified)
            if (!apiKeyAvailable)
              setNoMatchReason('no-profile-on-disk')
            setStep(apiKeyAvailable ? 'import-checking-apple-cert' : 'import-no-match-recovery')
          }

          // When classification ran we render two tables + a Select with
          // available rows only (unavailable certs can't be picked). Without
          // classification we fall back to main's flat-list ImportPickIdentityStep
          // so nothing regresses for the ad_hoc-without-.p8 entry path.
          if (!haveClassification) {
            return (
              <ImportPickIdentityStep
                identityCount={importMatches.length}
                dense={dense}
                options={[
                  ...importMatches.map((m) => {
                    const matchCount = filterProfilesForApp(m.profiles, iosBundleId, importDistribution).length
                    const label = matchCount > 0
                      ? `🔑  ${m.identity.name} · ${matchCount} matching profile${matchCount === 1 ? '' : 's'}`
                      : `🔑  ${m.identity.name} · ⚠ no matching profiles on this Mac (recovery available)`
                    return { label, value: m.identity.sha1 }
                  }),
                  { label: '↩️   Cancel and use Create new instead', value: '__cancel__' },
                ]}
                onChange={onPick}
              />
            )
          }

          const availableRows = available.map((m, i) => {
            const matchCount = filterProfilesForApp(m.profiles, iosBundleId, importDistribution).length
            // Cell value is a three-way state:
            //   1. matchCount > 0 → 'AVAILABLE' (green). Catches BOTH the
            //      on-disk-match case AND the prefetch-injected case (the
            //      prefetch synthesises profiles into m.profiles, so this
            //      branch lights up automatically — no separate prefetch
            //      branch needed for the success path).
            //   2. matchCount === 0 + prefetch pending → animated spinner.
            //      Yellow cellColor (see Table below) signals "in flight,
            //      click is still allowed" — the onPick handler routes
            //      pending clicks the same way unavailable clicks go,
            //      through import-checking-apple-cert.
            //   3. matchCount === 0 + timeout/error/unavailable/no entry →
            //      'UNAVAILABLE' (red). Click re-routes through
            //      import-checking-apple-cert so the user gets a fresh fetch.
            const prefetchState = profilePrefetch[m.identity.sha1]
            let profileCell: string
            if (matchCount > 0)
              profileCell = 'AVAILABLE'
            else if (prefetchState?.kind === 'pending')
              profileCell = `${SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length]} checking…`
            else
              profileCell = 'UNAVAILABLE'
            return {
              '#': `${i + 1}`,
              'Name': `🔑 ${m.identity.name}`,
              'Team': m.identity.teamId,
              'Profile': profileCell,
            }
          })
          const unavailableRows = unavailable.map(m => ({
            Name: `🔒 ${m.identity.name}`,
            Team: m.identity.teamId,
            Reason: identityAvailability[m.identity.sha1]?.reasonText || 'Not classified',
          }))

          return (
            <Box flexDirection="column" marginTop={1}>
              {available.length > 0 && (
                <>
                  <Text bold color="green">{`✅  CERTIFICATE${available.length === 1 ? '' : 'S'} AVAILABLE (${available.length})`}</Text>
                  <Newline />
                  <Table
                    data={availableRows}
                    cellColor={(col, val) => {
                      if (col !== 'Profile')
                        return undefined
                      if (val === 'AVAILABLE')
                        return 'green'
                      if (val === 'UNAVAILABLE')
                        return 'red'
                      // Spinner cell — every pending render is one of
                      // SPINNER_FRAMES followed by ` checking…`. Endswith is
                      // cheaper than scanning frame chars and tolerates the
                      // frame index rolling over between renders.
                      if (typeof val === 'string' && val.endsWith(' checking…'))
                        return 'yellow'
                      return undefined
                    }}
                  />
                  <Newline />
                </>
              )}
              {available.length === 0 && (
                <Box flexDirection="column">
                  <Text bold color="red">✖  NO CERTIFICATES AVAILABLE</Text>
                  <Text dimColor>
                    All
                    {' '}
                    {unavailable.length}
                    {' '}
                    identit
                    {unavailable.length === 1 ? 'y is' : 'ies are'}
                    {' '}
                    unavailable on Apple's side. See the table below for the reason, or use "Create new" to generate a fresh cert + profile.
                  </Text>
                  <Newline />
                </Box>
              )}
              {unavailable.length > 0 && (
                <>
                  <Text bold color="red">{`✖  CERTIFICATE${unavailable.length === 1 ? '' : 'S'} UNAVAILABLE (${unavailable.length})`}</Text>
                  <Newline />
                  <Table
                    data={unavailableRows}
                    cellColor={col => (col === 'Reason' ? 'yellow' : undefined)}
                    cellDim={col => col !== 'Reason'}
                  />
                  <Newline />
                </>
              )}
              <Text bold>Pick an option:</Text>
              <Select
                options={[
                  ...available.map((m, i) => ({
                    label: `[${i + 1}] ${m.identity.name}`,
                    value: m.identity.sha1,
                  })),
                  { label: '↩️   Cancel and use Create new instead', value: '__cancel__' },
                ]}
                onChange={onPick}
              />
            </Box>
          )
        })()}

        {/* Import: pick profile */}
        {step === 'import-pick-profile' && chosenIdentity && (() => {
          const allMatchedProfiles = importMatches.find(m => m.identity.sha1 === chosenIdentity.sha1)?.profiles || []
          // Filter to profiles that are actually usable for THIS app + THIS
          // distribution mode. Without this filter, a user with a cert reused
          // across multiple apps (or with both app_store and ad_hoc profiles
          // linked to one cert) could pick a profile whose bundleId !== iosBundleId
          // or whose profileType !== importDistribution. `doSaveCredentials`
          // would then persist a mismatched provisioning_map / distribution
          // pair, producing unusable signing credentials.
          const matchedProfiles = filterProfilesForApp(allMatchedProfiles, iosBundleId, importDistribution)
          const droppedCount = allMatchedProfiles.length - matchedProfiles.length
          return (
            <ImportPickProfileStep
              matchedCount={matchedProfiles.length}
              droppedCount={droppedCount}
              distribution={importDistribution}
              dense={dense}
              options={[
                ...matchedProfiles.map(p => ({
                  label: `📜  ${p.name} · bundle ${p.bundleId} · ${p.profileType} · expires ${p.expirationDate.split('T')[0]}`,
                  // Key by UUID, NOT path. Disk-discovered profiles have a
                  // unique path, but Apple-fetched profiles (from the D
                  // no-match-recovery path) are synthesized with path=''.
                  // UUID is unique for both kinds: disk profiles use the
                  // mobileprovision UUID, synthesized ones use Apple's
                  // profile resource ID.
                  value: p.uuid,
                })),
                { label: '↩️   Back to identity selection', value: '__back__' },
              ]}
              onChange={(value) => {
                if (value === '__back__') {
                  setStep('import-pick-identity')
                  return
                }
                const profile = matchedProfiles.find(p => p.uuid === value)
                if (!profile)
                  return
                // Defense in depth: verify bundleId + profileType match before
                // committing. The filter above should make this unreachable,
                // but if the filter regresses, we'd rather hard-fail than
                // silently save bad creds. Wildcard bundle ids
                // (`com.example.*`, bare `*`) are accepted via bundleIdMatches
                // so this guard stays in sync with the picker's filter — a
                // strict equality here would over-reject wildcards the filter
                // intentionally accepted upstream.
                if (!bundleIdMatches(profile.bundleId, iosBundleId)
                  || (importDistribution && profile.profileType !== importDistribution)) {
                  handleError(
                    new Error(
                      `Profile "${profile.name}" doesn't match this app: `
                      + `bundle ${profile.bundleId} (expected ${iosBundleId}), `
                      + `type ${profile.profileType} (expected ${importDistribution ?? 'any'}).`,
                    ),
                    'import-pick-profile',
                  )
                  return
                }
                // Belt-and-suspenders: the upstream matchIdentitiesToProfiles
                // filter and Apple-fetched profile synthesizing should both
                // guarantee `profile.certificateSha1s` contains
                // `chosenIdentity.sha1`. But the file-picker recovery path
                // imports a .mobileprovision the user might have hand-created
                // in the portal — if they ticked the wrong cert in the cert
                // list there, we'd otherwise save credentials that the build
                // server can't actually sign with (private key from
                // chosenIdentity but profile only trusts a different cert).
                // Catch that here with a clear error rather than discovering
                // it during a build hours later.
                if (chosenIdentity && !profile.certificateSha1s.includes(chosenIdentity.sha1)) {
                  const shownSha1s = profile.certificateSha1s.map(s => `${s.slice(0, 8)}…`).join(', ') || '(none listed)'
                  handleError(
                    new Error(
                      `Profile "${profile.name}" doesn't trust your chosen certificate "${chosenIdentity.name}". `
                      + `The profile's allowed-certs list contains ${profile.certificateSha1s.length} entr${profile.certificateSha1s.length === 1 ? 'y' : 'ies'} (SHA1: ${shownSha1s}); your cert's SHA1 starts with ${chosenIdentity.sha1.slice(0, 8)}…. `
                      + `Either pick a different profile, or re-create this profile in the Apple Developer Portal and tick the right cert.`,
                    ),
                    'import-pick-profile',
                  )
                  return
                }
                setChosenProfile(profile)
                addLog(`✔ Profile · ${profile.name}`)
                setStep('import-export-warning')
              }}
            />
          )
        })()}

        {/* Import: no-match recovery menu */}
        {step === 'import-no-match-recovery' && chosenIdentity && (() => {
          const hasAscKey = !!(p8ContentRef.current || p8PathRef.current)
          // D2 (create-profile-only) currently only knows how to create
          // IOS_APP_STORE profiles via apple-api.ts createProfile, which
          // hardcodes that profileType. For ad_hoc we'd need a separate
          // create path that calls Apple with IOS_APP_ADHOC. Until that
          // exists, hide the "Create" option for ad_hoc users so they
          // can't end up with an app_store profile saved under
          // CAPGO_IOS_DISTRIBUTION='ad_hoc'. Browser + Fetch still work.
          const canCreateProfile = importDistribution !== 'ad_hoc'
          return (
            <ImportNoMatchRecoveryStep
              reason={noMatchReason ?? undefined}
              appId={iosBundleId}
              importDistribution={importDistribution}
              identityName={chosenIdentity.name}
              dense={dense}
              options={[
              // Order optimized for most-likely-to-succeed first:
              //   1. Create a fresh profile via Apple API — automatic
              //   2. Use a local .mobileprovision file — fastest when you
              //      already have one
              //   3. Open the Developer Portal — manual fallback with a
              //      guided walkthrough that funnels back to option 2
              //   4. Back to identity selection
              //
              // The legacy "🔍 Fetch matching profile from Apple" / "🔄
              // Rescan" option was dropped (commit 36a7c282): the auto-
              // fetch built into the per-identity check already covers
              // the "Apple has a profile" case, and the portal walkthrough
              // routes the manual case through the file picker. Two
              // parallel rescan paths made the UX inconsistent with the
              // instructions we render in the walkthrough.
                ...(canCreateProfile
                  ? [{
                      label: hasAscKey
                        ? `✨  Create a new App Store profile for this cert via Apple`
                        : `✨  Provide ASC API key, then create a new App Store profile for this cert`,
                      value: 'create',
                    }]
                  : []),
                ...(canUseFilePicker()
                  ? [{ label: `📁  Use a .mobileprovision file from disk`, value: 'provide-profile-path' }]
                  : []),
                {
                  label: `🌐  Open Apple Developer Portal (browse / create profiles manually)`,
                  value: 'browser',
                },
                { label: '↩️   Back to identity selection', value: 'back' },
              ]}
              onChange={(value) => {
                if (value === 'browser') {
                // Don't immediately open the portal — manual cert/profile
                // creation on developer.apple.com is genuinely tricky
                // (right cert type, allowed-certs list on the profile,
                // bundle ID + capabilities, push the .mobileprovision
                // back into Xcode). Route to a step that explains the
                // manual steps + steers the user toward the automatic
                // "Create a new App Store profile via Apple" option
                // when it's available (almost always the better pick).
                  setStep('import-portal-explanation')
                  return
                }
                if (value === 'provide-profile-path') {
                  mobileprovisionPickerOpenedRef.current = false
                  setStep('import-provide-profile-path')
                  return
                }
                if (value === 'back') {
                  setStep('import-pick-identity')
                  return
                }
                if (value === 'create') {
                  if (hasAscKey) {
                    setStep('import-create-profile-only')
                  }
                  else {
                    setPendingRecoveryAction('create-profile-only')
                    setStep('api-key-instructions')
                  }
                }
              }}
            />
          )
        })()}

        {/* Import: native picker for a .mobileprovision file on disk */}
        {step === 'import-provide-profile-path' && (
          <Box flexDirection="column" marginTop={1}>
            <SpinnerLine text="Opening file picker for your .mobileprovision file..." />
            <Text dimColor>{`If the dialog doesn't appear, check behind other windows or in the menu bar.`}</Text>
          </Box>
        )}

        {/* Import: manual portal walkthrough — explains what to do on
          developer.apple.com and steers toward the automatic "Create new"
          path or the file-picker path. Routed to from the recovery menu's
          "🌐 Open Apple Developer Portal" option. */}
        {step === 'import-portal-explanation' && chosenIdentity && (() => {
          const canAutoCreate = importDistribution !== 'ad_hoc'
          // The walkthrough renders one of two flavours:
          //  - app_store: the original "you CAN do this manually, but
          //    here's an easier automatic option" framing, ending with a
          //    Select that nudges toward the auto path.
          //  - ad_hoc: an honest "this is complex, here's what's involved,
          //    and you can email support if you want help" framing, with a
          //    plain Open Portal option (no "anyway" — there's no
          //    automatic alternative to contrast with), the file-picker
          //    return path, and a Capgo-support breadcrumb. The manual
          //    walkthrough below stops at step 7 (download + come back),
          //    intentionally skipping the device-registration step that
          //    ad_hoc profiles require — that step varies wildly by team
          //    and is exactly the kind of thing support can help with.
          return (
            <Box flexDirection="column" marginTop={1}>
              <Alert variant="info">
                {canAutoCreate
                  ? 'You can do this manually in the Apple Developer Portal — but the automatic path is much easier.'
                  : `Ad-hoc distribution is genuinely fiddly (you also need to register every target device on Apple's side). Here's what's involved — and how to get help if you're stuck.`}
              </Alert>
              <Newline />
              {/* The ad_hoc "want help?" breadcrumb fires at the moment the
                user picks Ad Hoc on the distribution-mode step (yellow log
                entries), not here. Surfacing it on the recovery walkthrough
                meant the user only saw the offer AFTER they'd already
                started fumbling — too late. The log lines stay visible in
                the side log throughout the rest of the wizard. */}
              <Text bold>{`What you'd need to do manually:`}</Text>
              <Box flexDirection="column" marginLeft={2} marginTop={1}>
                <Text>1. Sign in at developer.apple.com/account/resources/profiles/list.</Text>
                <Text>
                  2. Select the correct team (top right) —
                  {' '}
                  <Text bold>{chosenIdentity.teamId}</Text>
                  {chosenIdentity.teamName ? ` (${chosenIdentity.teamName})` : ''}
                  .
                </Text>
                <Text>
                  3. Click
                  {' '}
                  <Text bold>+</Text>
                  {' '}
                  to create a new profile. Pick
                  {' '}
                  <Text bold>{importDistribution === 'ad_hoc' ? 'Ad Hoc' : 'App Store'}</Text>
                  {' '}
                  under
                  {' '}
                  <Text bold>Distribution</Text>
                  .
                </Text>
                <Text>
                  4. Pick the App ID matching
                  {' '}
                  <Text bold>{iosBundleId}</Text>
                  {`. Create it first if it doesn't exist.`}
                </Text>
                <Text>
                  5. In the "Certificates" step, tick the cert matching
                  {' '}
                  <Text bold>{chosenIdentity.name}</Text>
                  . If multiple are listed, pick carefully — we re-verify the cert SHA1 in the next step.
                </Text>
                {!canAutoCreate && (
                  <Text>
                    6. In the "Devices" step, tick every device UDID that should be able to run this build. (This is the ad-hoc-specific step. Devices have to be registered under
                    {' '}
                    <Text color="cyan" underline>developer.apple.com/account/resources/devices/list</Text>
                    {' '}
                    first.)
                  </Text>
                )}
                <Text>
                  {canAutoCreate ? '6. ' : '7. '}
                  Name + Generate + Download. The .mobileprovision file lands in your Downloads folder.
                </Text>
                <Text>
                  {canAutoCreate ? '7. ' : '8. '}
                  Come back here and pick
                  {' '}
                  <Text bold>📁  Use a .mobileprovision file from disk</Text>
                  .
                </Text>
              </Box>
              <Newline />
              {canAutoCreate && (
                <Box flexDirection="column">
                  <Text bold color="green">💡 Recommended: let Capgo do this automatically.</Text>
                  <Text dimColor>
                    "✨ Create a new App Store profile for this cert via Apple" runs the same steps via the Apple API — same cert, same bundle ID, no portal navigation, no manual download.
                  </Text>
                  <Newline />
                </Box>
              )}
              <Select
                options={[
                  ...(canAutoCreate
                    ? [{ label: '✨  Use "Create a new App Store profile" instead (recommended)', value: 'use-create' }]
                    : []),
                  {
                    label: canAutoCreate
                      ? '🌐  Open the portal anyway (advanced)'
                      : '🌐  Open Apple Developer Portal',
                    value: 'open-anyway',
                  },
                  ...(canUseFilePicker()
                    ? [{ label: '📁  I already have a .mobileprovision on disk — let me pick it', value: 'use-file' }]
                    : []),
                  { label: '↩️   Back to recovery menu', value: 'back' },
                ]}
                onChange={(value) => {
                  if (value === 'use-create') {
                    setStep('import-create-profile-only')
                    return
                  }
                  if (value === 'use-file') {
                    mobileprovisionPickerOpenedRef.current = false
                    setStep('import-provide-profile-path')
                    return
                  }
                  if (value === 'open-anyway') {
                    open('https://developer.apple.com/account/resources/profiles/list')
                    addLog('🌐 Opened Apple Developer Portal — once you have downloaded the .mobileprovision file, come back and pick "📁 Use a .mobileprovision file from disk".', 'yellow')
                    setStep('import-no-match-recovery')
                    return
                  }
                  setStep('import-no-match-recovery')
                }}
              />
            </Box>
          )
        })()}

        {/* Import: D2 — creating a new profile via Apple for the existing cert */}
        {step === 'import-create-profile-only' && <ImportCreateProfileOnlyStep />}

        {/* Import: export warning (heads-up before the one Keychain dialog) */}
        {step === 'import-export-warning' && chosenIdentity && (
          <ImportExportWarningStep
            identityName={chosenIdentity.name}
            dense={dense}
            onChange={(value) => {
              if (value === 'go') {
              // Go straight to the export step; the precompiled helper is
              // resolved and signature-verified there.
                setStep('import-exporting')
              }
              else if (value === 'back') {
              // Back goes to profile selection (distribution mode is now upstream of this step)
                setStep('import-pick-profile')
              }
              else {
                exitOnboarding('Exiting. Re-run `build init` whenever you\'re ready.')
              }
            }}
          />
        )}

        {/* Import: exporting (the one Keychain prompt happens here) */}
        {step === 'import-exporting' && <ImportExportingStep />}

        {/* API key instructions + .p8 input */}
        {step === 'api-key-instructions' && (
          <ApiKeyInstructionsStep
            canUseFilePicker={canUseFilePicker()}
            dense={dense}
            onMethodChange={(value) => {
              if (value === 'picker') {
                setStep('p8-method-select')
              }
              else {
                setStep('input-p8-path')
              }
            }}
            onPathSubmit={async (value) => {
              const filePath = value.replace(/^~/, process.env.HOME || '')
              try {
                const content = await readFile(filePath, 'utf-8')
                setP8Path(filePath)
                setP8Content(content)
                const extracted = extractKeyIdFromPath(filePath)
                if (extracted)
                  setKeyId(extracted)
                addLog(`✔ Key file found · ${filePath}`)
                // Persist the extracted keyId too, so a quit-before-confirm resume
                // restores it instead of showing the empty placeholder.
                void savePartialProgress({ p8Path: filePath, keyId: extracted || undefined })
                setStep('input-key-id')
              }
              catch {
                handleError(new Error(`File not found: ${filePath}`), 'api-key-instructions')
              }
            }}
          />
        )}

        {/* File picker opening */}
        {step === 'p8-method-select' && <P8MethodSelectStep />}

        {/* Manual .p8 path input */}
        {step === 'input-p8-path' && (
          <InputP8PathStep
            onSubmit={async (value) => {
              const filePath = value.replace(/^~/, process.env.HOME || '')
              try {
                const content = await readFile(filePath, 'utf-8')
                setP8Path(filePath)
                setP8Content(content)
                const extracted = extractKeyIdFromPath(filePath)
                if (extracted)
                  setKeyId(extracted)
                addLog(`✔ Key file found · ${filePath}`)
                // Persist the extracted keyId too, so a quit-before-confirm resume
                // restores it instead of showing the empty placeholder.
                void savePartialProgress({ p8Path: filePath, keyId: extracted || undefined })
                setStep('input-key-id')
              }
              catch {
                handleError(new Error(`File not found: ${value}`), 'input-p8-path')
              }
            }}
          />
        )}

        {/* Key ID */}
        {step === 'input-key-id' && (
          <InputKeyIdStep
            keyId={keyId}
            dense={dense}
            onSubmit={(value) => {
            // `value || keyId` reuses the detected key ID when the user just
            // presses Enter; the trim+guard rejects an empty submission in the
            // no-detection case (keyId='' makes the fallback a no-op).
              const finalKeyId = (value || keyId).trim()
              if (!finalKeyId)
                return
              setKeyId(finalKeyId)
              upsertLog('✔ Key ID · ', `✔ Key ID · ${finalKeyId}`)
              void savePartialProgress({ keyId: finalKeyId })
              setStep('input-issuer-id')
            }}
          />
        )}

        {/* Issuer ID */}
        {step === 'input-issuer-id' && (
          <InputIssuerIdStep
            dense={dense}
            onSubmit={(value) => {
              const cleaned = value.trim()
              if (!cleaned)
                return
              setIssuerId(cleaned)
              upsertLog('✔ Issuer ID · ', `✔ Issuer ID · ${cleaned}`)
              void savePartialProgress({ issuerId: cleaned })
              setStep('verifying-key')
            }}
          />
        )}

        {/* Verifying */}
        {step === 'verifying-key' && <VerifyingKeyStep />}

        {/* Creating certificate */}
        {step === 'creating-certificate' && <CreatingCertificateStep />}

        {/* Certificate limit — ask which to revoke */}
        {step === 'cert-limit-prompt' && (
          <CertLimitPromptStep
            existingCount={existingCerts.length}
            dense={dense}
            options={[
              ...existingCerts.map((c) => {
                const ourCertId = certData?.certificateId || initialProgress?.completedSteps.certificateCreated?.certificateId
                const isOurs = ourCertId === c.id
                const creator = isOurs ? ' · 🔧 Created by Capgo' : ''
                return {
                  label: `🗑️   ${c.name} · expires ${c.expirationDate.split('T')[0]}${creator}`,
                  value: c.id,
                }
              }),
              { label: '✖  Exit onboarding', value: '__exit__' },
            ]}
            onChange={(value) => {
              if (value === '__exit__') {
                addLog(`Exiting. Revoke a certificate manually in App Store Connect, then resume with ${buildInitCommand}.`, 'yellow')
                exitOnboarding()
              }
              else {
                setCertToRevoke(value)
                setStep('revoking-certificate')
              }
            }}
          />
        )}

        {/* Revoking certificate */}
        {step === 'revoking-certificate' && <RevokingCertificateStep />}

        {/* Creating profile */}
        {step === 'creating-profile' && <CreatingProfileStep appId={appId} dense={dense} />}

        {/* Duplicate profile prompt */}
        {step === 'duplicate-profile-prompt' && (
          <DuplicateProfilePromptStep
            duplicateCount={duplicateProfiles.length}
            dense={dense}
            onChange={(value) => {
              if (value === 'delete') {
                setStep('deleting-duplicate-profiles')
              }
              else {
                addLog(`Exiting. Delete the duplicate profiles in App Store Connect, then resume with ${buildInitCommand}.`, 'yellow')
                exitOnboarding()
              }
            }}
          />
        )}

        {/* Deleting duplicate profiles */}
        {step === 'deleting-duplicate-profiles' && (
          <DeletingDuplicateProfilesStep duplicateCount={duplicateProfiles.length} />
        )}

        {/* Saving credentials */}
        {step === 'saving-credentials' && <SavingCredentialsStep />}

        {step === 'detecting-ci-secrets' && <DetectingCiSecretsStep />}

        {step === 'ci-secrets-setup' && (
          <CiSecretsSetupStep
            advice={ciSecretSetupAdvice}
            dense={dense}
            onChange={(value) => {
              setStep(value === 'retry' ? 'detecting-ci-secrets' : 'build-complete')
            }}
          />
        )}

        {step === 'ci-secrets-target-select' && (
          <CiSecretsTargetSelectStep
            options={[
              ...ciSecretTargets.map(target => ({
                label: target.provider === 'github' ? 'GitHub Actions repository secrets' : 'GitLab CI/CD variables',
                value: target.provider,
              })),
              { label: 'Skip', value: 'skip' },
            ]}
            dense={dense}
            onChange={(value) => {
              if (value === 'skip') {
                setStep('build-complete')
                return
              }
              const target = ciSecretTargets.find(candidate => candidate.provider === value) || null
              setCiSecretTarget(target)
              if (!target) {
                setStep('build-complete')
                return
              }
              // GitHub routes into the new 3-option GitHub Actions prompt
              // (secrets + workflow / secrets-only / no); GitLab keeps the legacy
              // 2-option ask-ci-secrets flow.
              setStep(target.provider === 'github' ? 'ask-github-actions-setup' : 'ask-ci-secrets')
            }}
          />
        )}

        {step === 'ask-ci-secrets' && (
          <AskCiSecretsStep
            entryCount={ciSecretEntries.length}
            target={ciSecretTarget}
            targetLabel={getCiSecretTargetLabel(ciSecretTarget)}
            dense={dense}
            onChange={(value) => {
              setStep(value === 'yes' ? 'checking-ci-secrets' : 'build-complete')
            }}
          />
        )}

        {step === 'ask-github-actions-setup' && (
          <Box flexDirection="column" marginTop={1}>
            <SuccessLine text="Credentials saved · GitHub detected" />
            <Newline />
            <Text bold>Set up GitHub Actions for you?</Text>
            <Text dimColor>
              Capgo can push your
              {' '}
              {ciSecretEntries.length}
              {' '}
              build env var
              {ciSecretEntries.length === 1 ? '' : 's'}
              {' '}
              as repository secrets and drop a
              {' '}
              .github/workflows/capgo-build.yml file you can dispatch manually.
            </Text>
            <Newline />
            <Select
              options={[
                { label: '🚀  Yes — set the secrets AND create a workflow file', value: 'with-workflow' },
                { label: '🔒  Yes — set ONLY the secrets', value: 'secrets-only' },
                { label: '❌  No', value: 'no' },
              ]}
              onChange={(value) => {
                if (value === 'no') {
                  setSetupMode('declined')
                  setStep('ask-export-env')
                  return
                }
                setSetupMode(value as 'with-workflow' | 'secrets-only')
                setStep('checking-ci-secrets')
              }}
            />
          </Box>
        )}

        {step === 'ask-export-env' && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Export the credentials as a .env file instead?</Text>
            <Text dimColor>
              Writes
              {' '}
              {defaultExportPath(appId, 'ios').split('/').slice(-1)[0]}
              {' '}
              so you can wire up CI later via
              {' '}
              <Text>gh secret set -f</Text>
              {' '}
              or paste the values manually.
            </Text>
            <Newline />
            <Select
              options={[
                { label: `📝  Yes — write .env.capgo.${appId}.ios`, value: 'yes' },
                { label: '❌  No, exit without exporting', value: 'no' },
              ]}
              onChange={(value) => {
                if (value === 'yes') {
                  setEnvExportTargetPath(defaultExportPath(appId, 'ios'))
                  setStep('exporting-env')
                  return
                }
                setStep('build-complete')
              }}
            />
          </Box>
        )}

        {step === 'exporting-env' && (
          <Box flexDirection="column" marginTop={1}>
            <SpinnerLine text={`Writing ${defaultExportPath(appId, 'ios').split('/').slice(-1)[0]}…`} />
          </Box>
        )}

        {step === 'confirm-env-export-overwrite' && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="yellow">
              {envExportTargetPath}
              {' '}
              already exists.
            </Text>
            <Text dimColor>Replace it with a fresh export, or skip?</Text>
            <Newline />
            <Select
              options={[
                { label: '✏️   Replace it', value: 'replace' },
                { label: '🛑  Skip — keep the existing file', value: 'skip' },
              ]}
              onChange={(value) => {
                setStep(value === 'replace' ? 'overwrite-and-export-env' : 'build-complete')
              }}
            />
          </Box>
        )}

        {step === 'pick-package-manager' && (() => {
          const detected = normalizePackageManager(pm.pm)
          const detectionNote = pm.pm === 'unknown'
            ? '(no recognizable lockfile in this project — pick whichever you actually use)'
            : `(detected from your lockfile — ${pm.pm})`
          return (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Which package manager does this project use?</Text>
              <Text dimColor>
                Drives the install + build steps in the generated workflow. We
                {' '}
                {detectionNote}
              </Text>
              <Newline />
              <Select
                options={[
                  { label: `📦  bun${detected === 'bun' ? '  (recommended — matches your lockfile)' : ''}`, value: 'bun' },
                  { label: `📦  npm${detected === 'npm' ? '  (recommended — matches your lockfile)' : ''}`, value: 'npm' },
                  { label: `📦  pnpm${detected === 'pnpm' ? '  (recommended — matches your lockfile)' : ''}`, value: 'pnpm' },
                  { label: `📦  yarn${detected === 'yarn' ? '  (recommended — matches your lockfile)' : ''}`, value: 'yarn' },
                ]}
                onChange={(value) => {
                  setSelectedPackageManager(value as PackageManager)
                  setStep('pick-build-script')
                }}
              />
            </Box>
          )
        })()}

        {step === 'pick-build-script' && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Which script builds your web assets?</Text>
            <Text dimColor>
              Capgo will run this before invoking
              {' '}
              <Text>capgo build request</Text>
              {' '}
              in the workflow. Pick the script you use locally to produce the web build (typically into capacitor.config webDir, e.g. dist/).
            </Text>
            <Newline />
            <Select
              options={buildScriptPickerOptions(availableScripts, recommendedScript)}
              onChange={(value) => {
                if (value === '__skip__') {
                  setBuildScriptChoice({ type: 'skip' })
                  setStep('preview-workflow-file')
                  return
                }
                if (value === '__custom__') {
                  setStep('pick-build-script-custom')
                  return
                }
                setBuildScriptChoice({ type: 'npm-script', name: value })
                setStep('preview-workflow-file')
              }}
            />
          </Box>
        )}

        {step === 'pick-build-script-custom' && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Custom build command</Text>
            <Text dimColor>
              Type the exact command you want the workflow to run before
              {' '}
              <Text>capgo build request</Text>
              {' '}
              (e.g.
              {' '}
              <Text>make web</Text>
              ,
              {' '}
              <Text>bash scripts/build.sh</Text>
              ).
            </Text>
            <Box marginTop={1}>
              <FilteredTextInput
                placeholder="make web"
                onSubmit={(value) => {
                  const cleaned = value.trim()
                  if (!cleaned)
                    return
                  setBuildScriptChoice({ type: 'custom', command: cleaned })
                  setStep('preview-workflow-file')
                }}
              />
            </Box>
          </Box>
        )}

        {step === 'preview-workflow-file' && previewDiff.length > 0 && (() => {
          const allEqual = previewDiff.every(l => l.kind === 'eq')
          const writeLabel = allEqual
            ? '✏️   Write file anyway (re-writes identical content)'
            : (previewIsNew ? '✏️   Write file' : '✏️   Replace existing file')
          const skipLabel = '❌  Do not write file'
          const title = previewIsNew
            ? `🆕  Proposed new file — ${previewExistingPath ?? WORKFLOW_PATH}`
            : `✏️  Proposed changes — ${previewExistingPath ?? WORKFLOW_PATH}`
          const subtitle = previewIsNew
            ? 'Nothing exists on disk yet. Every line below is what would be written.'
            : 'Proposed diff vs the file on disk. Lines marked - would be removed, lines marked + would be added.'
          return (
            <Box flexDirection="column" marginTop={1}>
              <DiffSummary title={title} subtitle={subtitle} lines={previewDiff} />
              <Box marginTop={1} flexDirection="column">
                <Text bold>
                  What should we do with
                  {WORKFLOW_PATH}
                  ?
                </Text>
                <Select
                  options={[
                    { label: writeLabel, value: 'write' },
                    { label: '👀  Show proposed file diff', value: 'view' },
                    { label: skipLabel, value: 'cancel' },
                  ]}
                  onChange={(value) => {
                    if (value === 'view') {
                      trackWorkflowEvent('workflow-preview-action', { decision: 'view' })
                      trackWorkflowEvent('workflow-diff-opened', { decision: 'view' })
                      setStep('view-workflow-diff')
                      return
                    }
                    trackWorkflowEvent('workflow-preview-action', { decision: value === 'write' ? 'write' : 'cancel' })
                    setPreviewDiff([])
                    setStep(value === 'write' ? 'writing-workflow-file' : 'build-complete')
                  }}
                />
              </Box>
            </Box>
          )
        })()}
        {step === 'preview-workflow-file' && previewDiff.length === 0 && (
          <Box flexDirection="column" marginTop={1}>
            <SpinnerLine text={`Preparing diff for ${WORKFLOW_PATH}…`} />
          </Box>
        )}

        {/* view-workflow-diff renders as a fullscreen early-return takeover above. */}

        {step === 'writing-workflow-file' && (
          <Box flexDirection="column" marginTop={1}>
            <SpinnerLine text={`Writing ${WORKFLOW_PATH}…`} />
          </Box>
        )}

        {step === 'checking-ci-secrets' && (
          <Box flexDirection="column" marginTop={1}>
            <SpinnerLine text={ciSecretCheckPhase} />
          </Box>
        )}

        {step === 'confirm-secrets-push' && (
          (() => {
            const existingSet = new Set(ciSecretExistingKeys)
            const newCount = ciSecretEntries.filter(entry => !existingSet.has(entry.key)).length
            const replaceCount = ciSecretEntries.length - newCount
            return (
              <Box flexDirection="column" marginTop={1}>
                <Text bold color="yellow">⚠  Confirm before pushing secrets</Text>
                <Text>
                  Repository:
                  {' '}
                  <Text bold color="cyan">{ciSecretRepoLabel}</Text>
                  {' '}
                  <Text dimColor>(resolved via `gh repo view`)</Text>
                </Text>
                <Text bold>
                  {`Will push ${ciSecretEntries.length} env var${ciSecretEntries.length === 1 ? '' : 's'}`}
                  {replaceCount > 0 ? ` — ${newCount} new, ${replaceCount} REPLACING existing:` : ' — all new:'}
                </Text>
                <Box marginTop={1}>
                  <SecretsTable
                    rows={ciSecretEntries.map(entry => ({
                      name: entry.key,
                      status: existingSet.has(entry.key) ? 'REPLACE' : 'NEW',
                    }))}
                  />
                </Box>
                {replaceCount > 0 && (
                  <Box marginTop={1}>
                    <Text dimColor color="yellow">⚠  `gh secret set` overwrites silently — replaced values cannot be recovered.</Text>
                  </Box>
                )}
              </Box>
            )
          })()
        )}
        {step === 'confirm-secrets-push' && (
          <>
            <Box marginTop={1}>
              <Select
                options={[
                  {
                    label: `✅  Yes, push to ${ciSecretRepoLabel}`,
                    value: 'confirm',
                  },
                  { label: '❌  Cancel — don\'t push anything', value: 'cancel' },
                ]}
                onChange={(value) => {
                  setStep(value === 'confirm' ? 'uploading-ci-secrets' : 'build-complete')
                }}
              />
            </Box>
          </>
        )}

        {step === 'confirm-ci-secret-overwrite' && (
          <ConfirmCiSecretOverwriteStep
            existingKeys={ciSecretExistingKeys}
            dense={dense}
            onChange={(value) => {
              setStep(value === 'replace' ? 'uploading-ci-secrets' : 'build-complete')
            }}
          />
        )}

        {step === 'uploading-ci-secrets' && (
          <Box flexDirection="column" marginTop={1}>
            <SpinnerLine
              text={ciSecretUploadProgress
                ? `Pushing ${ciSecretUploadProgress.current} of ${ciSecretUploadProgress.total}: ${ciSecretUploadProgress.key}…`
                : `Uploading env vars to ${ciSecretRepoLabel ?? getCiSecretTargetLabel(ciSecretTarget)}…`}
            />
          </Box>
        )}

        {step === 'ci-secrets-failed' && (
          <CiSecretsFailedStep
            error={ciSecretError}
            dense={dense}
            onChange={(value) => {
              setStep(value === 'retry' ? (ciSecretTarget ? 'checking-ci-secrets' : 'detecting-ci-secrets') : 'build-complete')
            }}
          />
        )}

        {/* Ask to build */}
        {step === 'ask-build' && (
          <AskBuildStep
            dense={dense}
            onChange={(value) => {
              if (value === 'yes') {
                setStep('requesting-build')
              }
              else {
                setStep('build-complete')
              }
            }}
          />
        )}

        {/* Requesting build: handled by the FullscreenBuildOutput early return
          above (fullscreen takeover, bypasses the too-small gate) — nothing
          renders here in the measured body. */}

        {/* AI debug — ask the user whether to send the captured log */}
        {step === 'ai-analysis-prompt' && (
          <AiAnalysisPromptStep
            dense={dense}
            onChange={async (value) => {
              if (value === 'support') {
                await handleSupport('ai-analysis-prompt')
                return
              }
              if (value === 'debug') {
                setStep('ai-analysis-running')
              }
              else {
                if (aiJobId) {
                  await trackAiAnalysisChoice({
                    apikey: resolvedApiKeyRef.current ?? apikey ?? '',
                    orgId: resolvedOrgId ?? '',
                    appId,
                    platform: 'ios',
                    jobId: aiJobId,
                    choice: 'skip',
                    triggeredBy: 'onboarding',
                  }).catch(() => { /* telemetry never breaks the wizard */ })
                }
                setStep('build-complete')
              }
            }}
          />
        )}

        {/* AI debug — spinner while the edge function is running */}
        {step === 'ai-analysis-running' && <AiAnalysisRunningStep streamText={aiStreamPreview} terminalRows={terminalRows} terminalCols={terminalCols} />}

        {step === 'support-uploading' && (
          <Box marginTop={1}>
            <SpinnerLine text={supportBusyText} />
          </Box>
        )}

        {/* AI debug — render the diagnosis (or fallback message), then offer
          retry-or-skip. Retry transitions back to 'requesting-build' so the
          user can rebuild after applying the AI's fix in another terminal,
          without re-running the credential wizard. Capped at MAX_AI_RETRIES. */}
        {step === 'ai-analysis-result' && (
          <AiAnalysisResultStep
            analysisText={aiAnalysisText}
            // Collapse to the compact marker + "Re-read" option only when the
            // user has dismissed the viewer AND the analysis is still too tall to
            // show inline. If the terminal is now big enough, show the full text.
            collapsed={aiViewedFull && !!aiAnalysisText && isAiAnalysisTooTall(aiAnalysisText, terminalRows, terminalCols)}
            result={aiResult}
            canRetry={MAX_AI_RETRIES - aiRetryCount > 0}
            retriesLeft={MAX_AI_RETRIES - aiRetryCount}
            maxRetries={MAX_AI_RETRIES}
            dense={dense}
            onChange={async (value) => {
              if (value === 'support') {
                await handleSupport('ai-analysis-result')
                return
              }
              if (value === 'reread') {
              // Re-open the fullscreen scroll viewer (alt buffer has no
              // scrollback, so this is the only way to re-read).
                setStep('ai-analysis-result-scroll')
                return
              }
              if (value === 'retry') {
              // Track the retry intent before we tear down the AI state so
              // the choice event carries the per-attempt context.
                if (aiJobId) {
                  await trackAiAnalysisChoice({
                    apikey: resolvedApiKeyRef.current ?? apikey ?? '',
                    orgId: resolvedOrgId ?? '',
                    appId,
                    platform: 'ios',
                    jobId: aiJobId,
                    choice: 'retry',
                    triggeredBy: 'onboarding',
                  }).catch(() => { /* telemetry never breaks the wizard */ })
                  // Free the captured log for the previous attempt; the next
                  // attempt's `requestBuildInternal` will create a new file
                  // tied to a new builder_job_id.
                  void releaseCapturedLogs(aiJobId).catch(() => { /* best-effort */ })
                }
                // Reset AI state so the next failure starts clean. The fit
                // check (and possible scroll-viewer route) will re-evaluate
                // against the new analysis text.
                setAiJobId(null)
                setAiAnalysisText(null)
                setAiResult(null)
                setAiViewedFull(false)
                setAiRetryCount(prev => prev + 1)
                setStep('requesting-build')
                return
              }
              // 'skip' (with retries available) or 'continue' (none left).
              setStep('build-complete')
            }}
          />
        )}

        {/* (ai-analysis-result-scroll renders as a fullscreen early return above.) */}

        {/* Contact-support confirmation gate — tells the user everything that's
          about to happen (logs saved, revealed in Finder on macOS, email
          opened) and waits for an explicit Yes before the mail client opens. */}
        {step === 'support-confirm' && (
          <Box flexDirection="column" marginTop={1} gap={1}>
            <Text bold>Email Capgo support</Text>
            <Text>{supportConfirmMessage}</Text>
            <Select
              options={[
                { label: '📨  Yes, send to support', value: 'yes' },
                { label: '👀  View logs first', value: 'view' },
                { label: '✖  Cancel', value: 'no' },
              ]}
              onChange={(value) => {
                if (value === 'view') {
                  let lines: string[] = []
                  try { lines = readFileSync(supportLogPathRef.current, 'utf8').split('\n') }
                  catch { lines = ['(could not read the logs file)'] }
                  setSupportLogLines(lines)
                  setStep('support-log-view')
                  return
                }
                const resolve = supportConfirmResolveRef.current
                supportConfirmResolveRef.current = null
                resolve?.(value === 'yes')
              }}
            />
          </Box>
        )}

        {/* Error with retry */}
        {step === 'error' && error && (
          <ErrorStep
            error={error}
            recoveryAdvice={recoveryAdvice}
            supportBundlePath={supportBundlePath}
            showRetry={!!retryStep}
            dense={dense}
            collapsed={errorTooTall && errorViewedFull}
            hasBuildLog={!!aiJobId}
            onChange={async (value) => {
              if (value === 'support') {
                await handleSupport()
              }
              else if (value === 'ai') {
              // A captured build-failure log is available — route into the
              // existing AI-analysis prompt (unchanged from today).
                setStep('ai-analysis-prompt')
              }
              else if (value === 'retry') {
                setError(null)
                errorCategoryRef.current = undefined
                pickerOpenedRef.current = false
                mobileprovisionPickerOpenedRef.current = false
                if (retryStep)
                  setStep(retryStep)
              }
              else if (value === 'restart') {
              // Centralised reset (also clears the per-identity Apple-side
              // availability map + the iOS bundle id confirmation gate — both
              // missing from the previous inline version). The log message
              // stays error-recovery specific.
                await resetForFreshStart()
                addLog('↩️  Onboarding reset — starting fresh', 'yellow')
                setStep('welcome')
              }
              else {
                setError(`Run \`${buildInitCommand}\` to resume.`)
                exitOnboarding()
              }
            }}
          />
        )}

        {/* Done */}
        {step === 'build-complete' && (
          <BuildCompleteStep
            buildUrl={buildUrl}
            ciSecretUploadSummary={ciSecretUploadSummary}
            buildRequestCommand={buildRequestCommand}
            workflowWrittenPath={workflowWrittenPath}
            envExportPath={envExportPath}
            envExportError={envExportError}
            dense={dense}
          />
        )}
      </Box>
    </Box>
  )
}

export default OnboardingApp
