import type { FC } from 'react'
import type { BuildLogger } from '../../request.js'
import type { DiscoveredProfile, IdentityProfileMatch, SigningIdentity } from '../macos-signing.js'
import type { ApiKeyData, CertificateData, EnrichedIdentityAvailability, OnboardingErrorCategory, OnboardingProgress, OnboardingResult, OnboardingStep, ProfileData } from '../types.js'
import { handleCustomMsg } from '../../qr.js'
import { spawn } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { existsSync, readFileSync } from 'node:fs'
import { copyFile, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { Alert, ProgressBar, Select } from '@inkjs/ui'
import type { DOMElement } from 'ink'
import { Box, measureElement, Newline, Text, useApp, useInput, useStdout } from 'ink'
import open from 'open'
// src/build/onboarding/ui/app.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Braille spinner frames for the per-row "Profile" cell during prefetch.
// Module-scoped so the array reference is stable and never triggers
// re-renders by accident.
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const
import { detectIosBundleIds } from '../bundle-id-detector.js'
import { writeOnboardingSupportBundle } from '../../../onboarding-support.js'
import { formatRunnerCommand, splitRunnerCommand } from '../../../runner-command.js'
import { createSupabaseClient, findBuildCommandForProjectType, findProjectType, findSavedKeySilent, getOrganizationId, getPackageScripts, getPMAndCommand } from '../../../utils.js'
import { loadSavedCredentials, updateSavedCredentials } from '../../credentials.js'
import { releaseCapturedLogs, runCapgoAiAnalysis } from '../../../ai/analyze.js'
import { renderMarkdown } from '../../../ai/render-markdown.js'
import { trackAiAnalysisChoice, trackAiAnalysisResult } from '../../../ai/telemetry.js'
import { requestBuildInternal } from '../../request.js'
import { isAiAnalysisTooTall, resolveAiResultRoute } from '../ai-fit.js'

// Upper bound on "I fixed it, retry build" attempts after an AI diagnosis.
// Three total attempts (initial + two retries) caps the AI cost when a model
// suggestion doesn't actually fix the failure mode while still giving the user
// a couple of in-wizard chances to iterate.
const MAX_AI_RETRIES = 2
import type { AscDistributionCert } from '../apple-api.js'
import { CertificateLimitError, classifyCertAvailability, computeCertSha1, createCertificate, createProfile, deleteProfile, DuplicateProfileError, ensureBundleId, findCertIdBySha1, generateJwt, listDistributionCerts, listProfilesForCert, revokeCertificate, verifyApiKey } from '../apple-api.js'
import { createP12, DEFAULT_P12_PASSWORD, generateCsr } from '../csr.js'
import { mapIosOnboardingError } from '../error-categories.js'
import { canUseFilePicker, openFilePicker, openMobileprovisionPicker } from '../file-picker.js'
import { parseMobileprovisionBufferDetailed, parseMobileprovisionDetailed } from '../../mobileprovision-parser.js'
import { bundleIdMatches, exportP12FromKeychain, filterProfilesForApp, isHelperCached, isMacOS, listSigningIdentities, matchIdentitiesToProfiles, precompileSwiftHelper, scanProvisioningProfiles } from '../macos-signing.js'
import { deleteProgress, extractKeyIdFromP8Path, getImportEntryStep, getResumeStep, loadProgress, saveProgress } from '../progress.js'
import { getBuildOnboardingRecoveryAdvice } from '../recovery.js'
import { createCiSecretEntries, detectCiSecretTargets, getCiSecretRepoLabelAsync, getCiSecretTargetLabel, listExistingCiSecretKeysAsync, uploadCiSecretsAsync } from '../ci-secrets.js'
import type { CiSecretEntry, CiSecretSetupAdvice, CiSecretTarget } from '../ci-secrets.js'
import { defaultExportPath, exportCredentialsToEnv } from '../env-export.js'
import type { BuilderOnboardingAction } from '../telemetry.js'
import { trackBuilderOnboardingAction, trackBuilderOnboardingStep } from '../telemetry.js'
import { writeWorkflowFile, WORKFLOW_PATH } from '../workflow-writer.js'
import type { BuildScriptChoice, PackageManager } from '../workflow-generator.js'
import type { BuildCredentials } from '../../../schemas/build.js'
import {
  getPhaseLabel,

  STEP_PROGRESS,
} from '../types.js'
import { CompletedStepsLog } from './completed-steps-log.js'
import { IOS_MIN_ROWS, terminalFitsOnboarding } from '../min-terminal-size.js'
import { sanitizeBuildLogLines } from '../build-log.js'
import { TerminalTooSmallPrompt } from './min-size-gate.js'
import { BOX_HEADER_ROWS, COMPACT_HEADER_ROWS, DiffSummary, Divider, FilteredTextInput, FullscreenAiViewer, FullscreenBuildOutput, FullscreenDiffViewer, Header, isBuildCompleteDismissKey, SecretsTable, SpinnerLine, SuccessLine, Table, WIZARD_PADDING_ROWS } from './components.js'
import type { AiResultKind } from './components.js'
import { logBudgetRows } from './frame-fit.js'
import { diffLines } from '../diff-utils.js'
import type { DiffLine } from '../diff-utils.js'
import { generateWorkflow, WORKFLOW_PATH as WORKFLOW_GEN_PATH } from '../workflow-generator.js'
import { getWorkflowDiffTelemetry, trackBuildOnboardingWorkflowEvent } from '../analytics.js'
import type { BuildOnboardingWorkflowDecision, BuildOnboardingWorkflowEvent, WorkflowDiffTelemetry } from '../analytics.js'
import { buildScriptPickerOptions, normalizePackageManager } from '../workflow-ui-helpers.js'
import {
  ApiKeyInstructionsStep,
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
  P8MethodSelectStep,
  RevokingCertificateStep,
  SavingCredentialsStep,
  SetupMethodSelectStep,
  VerifyingKeyStep,
} from './steps/ios-credentials.js'
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
  ImportCompilingHelperStep,
  ImportCreateProfileOnlyStep,
  ImportDistributionModeStep,
  ImportExportingStep,
  ImportExportWarningStep,
  ImportNoMatchRecoveryStep,
  ImportPickIdentityStep,
  ImportPickProfileStep,
  ImportScanningStep,
} from './steps/ios-import.js'
import type { NoMatchReason } from './steps/ios-import.js'
import {
  AddingPlatformStep,
  AiAnalysisPromptStep,
  AiAnalysisRunningStep,
  AiAnalysisResultStep,
  BuildCompleteStep,
  ErrorStep,
  estimateErrorBodyRows,
  formatErrorViewerLines,
  NoPlatformStep,
  PlatformSelectStep,
  WelcomeStep,
} from './steps/ios-shared.js'
import type { IosEffectDeps, IosStepCtx } from '../ios/flow.js'
import { applyIosInput, runIosEffect } from '../ios/flow.js'
import { getIosResumeStep } from '../ios/progress.js'

const OUTPUT_LINE_SPLIT_RE = /\r?\n/
const CARRIAGE_RETURN_RE = /\r/g

// The create-new credential PROVISIONING effect steps the iOS engine-driver
// (below) routes through the shared engine's `runIosEffect`. The CHOICE / INPUT
// steps and the import-side effects keep their bespoke bodies for now (Stage 3
// swaps the choice/input routing). verifying-key is in the set but the driver
// guards it to the create-new path only (import keeps the bespoke routing).
const IOS_ENGINE_CREATE_EFFECT_STEPS = new Set<OnboardingStep>([
  'backing-up',
  'p8-method-select',
  'verifying-key',
  'creating-certificate',
  'revoking-certificate',
  'creating-profile',
  'deleting-duplicate-profiles',
])

// The IMPORT credential EFFECT steps the iOS engine-driver routes through the
// shared engine's `runIosEffect` (Stage 3 slice C). These run the Mac scans /
// Apple-side lookups / Keychain export the bespoke import effect bodies used to
// run inline. The CHOICE steps (import-distribution-mode, the pickers, the
// recovery hub, portal-explanation, export-warning) stay on the inline onChange
// resolvers (which stash the ephemeral pick into iosCarriedRef + re-drive the
// step as a pure resolver effect, exactly like cert-limit-prompt /
// duplicate-profile-prompt). import-mode verifying-key is NOT in this set — it
// shares the create-new verifying-key effect but needs the import-branch `next`
// routing, handled in the create-new effect driver's verifying-key arm.
const IOS_ENGINE_IMPORT_EFFECT_STEPS = new Set<OnboardingStep>([
  'import-scanning',
  'import-validating-all-certs',
  'import-checking-apple-cert',
  'import-provide-profile-path',
  'import-create-profile-only',
  'import-compiling-helper',
  'import-exporting',
])

// ─── IOS_TAIL_DRIVER_STEPS (ink-thin-wrapper, Stage 3 slice A) ─────────────────
//
// The post-save "tail" AUTO/EFFECT steps the TUI delegates to the shared engine's
// `runIosEffect`, which routes them into the platform-neutral tail module
// (TAIL_EFFECT_STEPS in ios/flow.ts). Mirrors the android TAIL_DRIVER_STEPS. These
// run AT or AFTER saving-credentials — which deletes progress.json — so the driver
// feeds the engine a SYNTHETIC progress carrying the in-memory React tail state
// (setupMode / ciSecretTarget / selectedPackageManager / buildScriptChoice /
// envExportTargetPath) plus the resolved create-new/import cert/profile payloads via
// deps.carried, and threads the engine transient (savedCredentials / ciSecretEntries
// / ciSecretExistingKeys / workflowIsNew) back. The engine NEVER re-creates
// progress.json here.
//
// ai-analysis-* + the build-log viewer stay ink-only (no AI-calling-AI in the
// headless engine); the requesting-build → ai-analysis-prompt handoff still reaches
// the AI UI because the engine returns next: 'ai-analysis-prompt'. preview-workflow-
// file stays bespoke (a VIEW prep, not a TAIL_EFFECT_STEP).
const IOS_TAIL_DRIVER_STEPS = new Set<OnboardingStep>([
  'saving-credentials',
  'detecting-ci-secrets',
  'checking-ci-secrets',
  'uploading-ci-secrets',
  'exporting-env',
  'overwrite-and-export-env',
  'writing-workflow-file',
  'requesting-build',
])

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
   * The user can override at the `confirm-app-id` step when pbxproj and
   * config.appId disagree. command.ts falls back to `appId` if config.appId
   * is missing, so this prop is always a valid string.
   */
  iosBundleIdInitial: string
  initialProgress: OnboardingProgress | null
  /** Resolved iOS directory from capacitor.config (defaults to 'ios') */
  iosDir: string
  /** Optional Capgo API key passed via -a/--apikey flag; takes precedence over saved key */
  apikey?: string
  /** Reports the wizard outcome to the shell when it reaches build-complete, so
   *  the caller prints an accurate post-exit message + durable summary instead of
   *  always claiming success. Never fires on cancel/missing-platform exits. */
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

const OnboardingApp: FC<AppProps> = ({ appId, iosBundleIdInitial, initialProgress, iosDir, apikey, onResult }) => {
  const { exit } = useApp()
  const startStep = getResumeStep(initialProgress)

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
  // the new files — fall back to `iosBundleIdInitial` so the mismatch
  // detector can re-ask via the confirm-app-id step instead of silently
  // using the old value.
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
  // Where redirectIfMismatch wants to go after the user confirms.
  const [pendingAppIdNext, setPendingAppIdNext] = useState<OnboardingStep | null>(null)
  // Sub-mode for confirm-app-id: false = render the candidate Select;
  // true = render a FilteredTextInput for a custom value.
  const [confirmAppIdTyping, setConfirmAppIdTyping] = useState(false)
  // Detection is synchronous (small files, no network); useMemo captures the
  // result for the lifetime of the component. The confirm-app-id step
  // renders only when `detectedIds.mismatch === true` AND the user hasn't
  // already chosen this session.
  const detectedIds = useMemo(
    () => detectIosBundleIds({ cwd: process.cwd(), iosDir, capacitorAppId: iosBundleIdInitial }),
    [iosDir, iosBundleIdInitial],
  )
  // Shared sites that fan out into Apple-side work (end of import-scanning,
  // end of verifying-key) wrap their setStep call with this so the
  // confirmation question gets injected at the right moment without
  // duplicating the "is there a mismatch?" logic per call site.
  const redirectIfMismatch = (target: OnboardingStep): OnboardingStep => {
    if (appIdConfirmed)
      return target
    if (!detectedIds.mismatch)
      return target
    setPendingAppIdNext(target)
    return 'confirm-app-id'
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

  // ─── Engine-driven create-new effect carried transient (ink-thin-wrapper) ───
  // Driver-held transient threaded between the create-new provisioning effects
  // (verifying-key → creating-certificate → creating-profile, plus the cert-limit
  // / duplicate recovery branches). Mirrors the e2e driver's `carried` and the
  // android driver's deps.carried: the engine's IosEffectResult.transient is
  // merged in here after each effect and passed back as deps.carried on the next.
  // NEVER persisted — these are the ephemeral cert/profile/p12 payloads + the
  // .p8 bytes + the cert-limit / duplicate selections. Held in a ref (not state)
  // so a re-render between effects doesn't lose it and reads see the freshest
  // value synchronously, exactly like p8ContentRef.
  const iosCarriedRef = useRef<NonNullable<IosEffectDeps['carried']>>({})

  const addLog = useCallback((text: string, color = 'green') => {
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
    setTimeout(() => exit(), 50)
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
    if (updates.p8Path !== undefined)
      existing.p8Path = updates.p8Path
    if (updates.keyId !== undefined)
      existing.keyId = updates.keyId
    if (updates.issuerId !== undefined)
      existing.issuerId = updates.issuerId
    await saveProgress(appId, existing)
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
    setP8Content('')  // wrapper updates p8ContentRef too
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
    // iOS bundle id confirmation gate — without this a restart from inside
    // confirm-app-id would silently keep the previously chosen override in
    // this session, so the user would never see the question again.
    setIosBundleId(iosBundleIdInitial)
    setAppIdConfirmed(false)
    setPendingAppIdNext(null)
    setConfirmAppIdTyping(false)
    // No-match recovery context — without this a restart would carry the
    // previous run's reason into the next pass and surface the wrong
    // bundle/distribution/profile-source wording in the recovery alert.
    setNoMatchReason(null)
    // After a Restart, if the user re-enters the import flow and picks
    // Ad Hoc again, they should see the support hint fresh — otherwise
    // the previous session's emission would mute a hint that's now
    // newly relevant.
    adHocHintShownRef.current = false
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
      catch {
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
          else
            setStep('api-key-instructions')
        })()
      }, 800)
    }

    // backing-up is now engine-driven (IOS_ENGINE_CREATE_EFFECT_STEPS) —
    // see the create-new effect driver below. The engine copies the credentials
    // backup, persists the _credentialsExistGate='done' marker, and routes to
    // setup-method-select (macOS) / api-key-instructions (off-macOS).

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
    //
    // The import EFFECT steps (import-scanning, import-validating-all-certs,
    // import-checking-apple-cert, import-provide-profile-path,
    // import-create-profile-only, import-compiling-helper, import-exporting) are
    // now engine-driven (IOS_ENGINE_IMPORT_EFFECT_STEPS) — see the import effect
    // driver below. The engine runs the Mac scans / Apple-side cert+profile
    // lookups / .mobileprovision parse / Keychain export the bespoke bodies used
    // to run inline here; the driver threads the ephemeral selections (chosen
    // identity/profile) from iosCarriedRef + mirrors importMatches /
    // importProfiles / identityAvailability / profilePrefetch / noMatchReason /
    // certData / profileData / importedP12Password back into React state, applies
    // redirectIfMismatch after import-scanning, and advances.

    // p8-method-select is now engine-driven (IOS_ENGINE_CREATE_EFFECT_STEPS) —
    // the engine opens the native .p8 picker (idempotent via carried.pickerOpened),
    // reads the bytes, persists {p8Path, extracted keyId}, threads the raw bytes
    // back in transient.p8Content, and routes to input-key-id (or input-p8-path on
    // cancel). The driver below mirrors p8Path/keyId/p8Content into React state.

    // verifying-key for the create-new path is now engine-driven
    // (IOS_ENGINE_CREATE_EFFECT_STEPS). This bespoke body keeps ONLY the IMPORT /
    // pendingRecoveryAction routing (import-validating-all-certs /
    // import-pick-identity / import-{recovery-action}) the engine's `next` doesn't
    // express — the Stage-2 driver guards verifying-key to !importMode &&
    // !pendingRecoveryAction so the two never double-fire.
    if (step === 'verifying-key' && (importMode || pendingRecoveryAction)) {
      ;(async () => {
        try {
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
            // Apple-side filtering; redirectIfMismatch routes through the
            // confirm-app-id step when config.appId disagrees with
            // pbxproj. Returns the same target step when there's no
            // mismatch.
            //
            // Eager batch validation runs BEFORE the picker renders when
            // there's at least one match — runs a single ASC cert fetch and
            // indexes by SHA1 so the picker can split identities into
            // Available / Unavailable tables with concrete reasons rather
            // than a flat list with surprises on pick.
            setStep(redirectIfMismatch(importMatches.length > 0 ? 'import-validating-all-certs' : 'import-pick-identity'))
          }
          else {
            // Create-new path: gate cert/profile creation on the iOS bundle
            // id confirmation just like the import path two lines above.
            // Without redirectIfMismatch here, a user whose project.pbxproj
            // disagrees with config.appId would never see the confirm-app-id
            // question on the create-new flow — and the downstream
            // `creating-profile` would call `ensureBundleId(token, iosBundleId)`
            // + `createProfile(token, …, iosBundleId)` with the un-confirmed
            // default (= config.appId), registering a profile under the wrong
            // bundle id on Apple's side. Certs themselves are team-wide so
            // the gate placement at 'creating-certificate' is fine — when
            // the user picks at confirm-app-id, the wizard resumes at this
            // exact target step with the chosen iosBundleId in scope.
            setStep(redirectIfMismatch('creating-certificate'))
          }
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'verifying-key')
        }
      })()
    }

    // creating-certificate / revoking-certificate / creating-profile /
    // deleting-duplicate-profiles are now engine-driven
    // (IOS_ENGINE_CREATE_EFFECT_STEPS) — see the create-new effect driver below.
    // The engine generates the CSR + .p12, mints the cert (routing to
    // cert-limit-prompt on CertificateLimitError), registers the bundle id +
    // creates the profile (routing to duplicate-profile-prompt on
    // DuplicateProfileError, persisting duplicateProfileOrigin), revokes the
    // user-picked cert and retries, and deletes the duplicate profiles then
    // routes back to the persisted origin. The driver mirrors certData /
    // profileData / teamId / existingCerts / duplicateProfiles into React state.

    // saving-credentials / detecting-ci-secrets / checking-ci-secrets /
    // uploading-ci-secrets are now engine-driven (IOS_TAIL_DRIVER_STEPS) — see the
    // post-save TAIL driver below. saving-credentials builds + writes the iOS
    // credential map (reading the create-new payloads from iosCarriedRef + the
    // import payloads from React state), deletes progress.json, stashes the
    // CI-secret entries + raw credentials, and routes to ask-build. The CI-secret
    // detection / repo-resolution / upload + the with-workflow script preload all
    // run in the shared tail; the driver mirrors ciSecretEntries / ciSecretTargets /
    // ciSecretSetupAdvice / ciSecretRepoLabel / ciSecretExistingKeys /
    // ciSecretUploadSummary / availableScripts / recommendedScript + the chosen
    // target into React state.

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
            catch {
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

    // writing-workflow-file / exporting-env / overwrite-and-export-env /
    // requesting-build are now engine-driven (IOS_TAIL_DRIVER_STEPS) — see the
    // post-save TAIL driver below. The engine writes the workflow file (logging
    // Wrote/Overwrote + workflow-file-written telemetry), exports the .env
    // (routing the 'exists' branch to confirm-env-export-overwrite), and fires the
    // build request (streaming every line into the FullscreenBuildOutput pane via
    // the BuildLogger, routing a failed build with captured logs to
    // ai-analysis-prompt). The driver mirrors workflowFilePath / envExportPath /
    // envExportError / buildUrl / aiJobId into React state + applies the 150ms
    // writing-workflow-file settle.

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

        const result = await runCapgoAiAnalysis({
          apiHost: 'https://api.capgo.app',
          apikey: resolvedApiKeyRef.current ?? apikey ?? '',
          jobId: aiJobId,
          appId,
        })

        if (cancelled)
          return

        const resultTag: 'success' | 'already_analyzed' | 'too_big' | 'error'
          = result.kind === 'ok'
            ? 'success'
            : result.kind === 'already_analyzed'
              ? 'already_analyzed'
              : result.kind === 'too_big'
                ? 'too_big'
                : 'error'

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
        else {
          setAiAnalysisText(null)
          const detail = [
            result.status ? `(status ${result.status})` : null,
            result.message,
          ].filter(Boolean).join(' ')
          setAiResult({ kind: 'error', message: `AI analysis failed${detail ? `: ${detail}` : ''}.` })
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

  // ─── Engine-driven create-new effect driver (ink-thin-wrapper, Stage 2) ─────
  // Route the create-new credential PROVISIONING effects through the shared iOS
  // engine's `runIosEffect` instead of the hand-rolled per-step bodies in the
  // useEffect above. The FLOW lives in the engine (ios/flow.ts, e2e-tested via
  // test/test-ios-e2e.mjs); the RENDERING stays ink (the same ios-* step
  // components). This mirrors the android engine-driver (android/ui/app.tsx) and
  // the headless e2e driver: build a single iosDeps wiring the REAL apple-api /
  // csr helpers (adapted from their JWT-token call shape to the engine's
  // abstracted dep shapes via getFreshToken), run the effect against the freshest
  // persisted progress, thread the returned transient into iosCarriedRef +
  // mirror it into the React render state, and advance to result.next.
  //
  // SCOPE (Stage 2 create-new fork): backing-up, p8-method-select, verifying-key
  // (create-new path only), creating-certificate, revoking-certificate,
  // creating-profile, deleting-duplicate-profiles. The CHOICE steps
  // (setup-method-select, cert-limit-prompt, duplicate-profile-prompt, the input
  // steps) stay on the bespoke setStep handlers (Stage 3 swaps the choice/input
  // routing). saving-credentials + the post-save tail are NOT routed here: the
  // shared tail's buildIosSavedCredentials omits the APPLE_KEY_* fields the
  // create-new app_store path writes via doSaveCredentials, so routing it would
  // drop credentials — that needs an engine change (see the report).
  //
  // The IMPORT effects (import-scanning, import-validating-all-certs,
  // import-checking-apple-cert, import-provide-profile-path,
  // import-create-profile-only, import-compiling-helper, import-exporting) and
  // the import-mode verifying-key routing keep their bespoke bodies for now.
  useEffect(() => {
    // verifying-key is SHARED between create-new and import: the engine's `next`
    // covers only the create-new (→ creating-certificate) and pendingRecoveryAction
    // (→ import-create-profile-only) cases — NOT the import app_store routing to
    // import-validating-all-certs / import-pick-identity. So route it through the
    // engine ONLY on the create-new path; import + pendingRecoveryAction keep the
    // bespoke body above.
    if (step === 'verifying-key' && (importMode || pendingRecoveryAction))
      return
    if (!IOS_ENGINE_CREATE_EFFECT_STEPS.has(step))
      return

    let cancelled = false

    void (async () => {
      // getFreshToken (the component's existing ASC JWT builder) adapts the raw
      // apple-api helpers — which take a JWT `token` — to the engine's abstracted
      // dep shapes. A NeedP8Error thrown here routes the user back to
      // api-key-instructions via handleError, exactly as the bespoke effects did.
      const deps: IosEffectDeps = {
        appId,

        // ── apple-api (token-adapted) ──
        verifyApiKey: async () => {
          const r = await verifyApiKey(await getFreshToken())
          return { teamId: r.teamId }
        },
        createCertificate: async ({ csr }) => createCertificate(await getFreshToken(), csr),
        revokeCertificate: async (certificateId) => {
          await revokeCertificate(await getFreshToken(), certificateId)
        },
        createProfile: async ({ bundleId, certificateId }) => {
          const token = await getFreshToken()
          const { bundleIdResourceId } = await ensureBundleId(token, bundleId)
          const p = await createProfile(token, bundleIdResourceId, certificateId, bundleId)
          return {
            profileId: p.profileId,
            profileName: p.profileName,
            profileBase64: p.profileContent,
          }
        },
        deleteProfile: async (profileId) => {
          await deleteProfile(await getFreshToken(), profileId)
        },
        listCertificates: async () => listDistributionCerts(await getFreshToken()),

        // ── csr (shape-adapted) ──
        generateCsr: () => {
          const r = generateCsr()
          return { csr: r.csrPem, privateKeyPem: r.privateKeyPem }
        },
        createP12: ({ certificatePem, privateKeyPem, password }) =>
          createP12(certificatePem, privateKeyPem, password).p12Base64,

        // ── file system + pickers ──
        readFile: async path => Buffer.from(await readFile(path)),
        copyFile,
        openP8FilePicker: openFilePicker,
        isMacOS,

        // ── persistence ──
        loadProgress,
        saveProgress,

        // ── carried transient (driver-held) — merged with the cert-limit /
        // duplicate-profile selections the bespoke choice handlers stash in React
        // state so the revoke / delete effects find their (ephemeral) inputs.
        carried: {
          ...iosCarriedRef.current,
          // cert-limit-prompt's choice handler stores the picked cert id in
          // `certToRevoke` (React) against the `existingCerts` list; the revoke
          // effect only reads `.id`, so reconstruct the minimal cert object.
          ...(step === 'revoking-certificate' && certToRevoke
            ? { certToRevoke: existingCerts.find(c => c.id === certToRevoke) ?? { id: certToRevoke, name: '', serialNumber: '', expirationDate: '' } }
            : {}),
          // duplicate-profile-prompt's choice handler keeps the duplicate list in
          // React `duplicateProfiles`; thread it so the delete effect knows what
          // to delete.
          ...(step === 'deleting-duplicate-profiles' ? { duplicateProfiles } : {}),
        },

        onLog: (message, color) => {
          if (!cancelled)
            addLog(message, color)
        },
      }

      try {
        // Run against the freshest persisted progress — the prior input steps
        // persisted p8Path / keyId / issuerId before these auto steps run, so the
        // loaded progress carries the same values the bespoke effects read from
        // refs. Falls back to a fresh-progress skeleton when nothing is on disk.
        const current = (await loadProgress(appId)) ?? {
          platform: 'ios' as const,
          appId,
          startedAt: new Date().toISOString(),
          completedSteps: {},
        }
        if (cancelled)
          return
        const result = await runIosEffect(step, current, deps)
        if (cancelled)
          return

        const t: Partial<IosStepCtx> | undefined = result.transient
        const np = result.progress

        // ── error route: surface through the TUI's handleError so the support
        // bundle + retryCount + telemetry UX is identical to the bespoke catch ──
        if (result.next === 'error') {
          handleError(new Error(t?.error ?? 'Onboarding failed.'), (t?.retryStep as OnboardingStep) ?? step)
          return
        }

        // ── merge engine transient into the carried ref (threaded into the next
        // effect) AND mirror it into the React render state downstream code reads ──
        if (t) {
          iosCarriedRef.current = { ...iosCarriedRef.current, ...t }
          if (t.certData !== undefined)
            setCertData(t.certData)
          if (t.profileData !== undefined)
            setProfileData(t.profileData)
          if (t.teamId !== undefined)
            setTeamId(t.teamId)
          if (t.p8Content !== undefined)
            setP8Content(t.p8Content.toString('utf-8'))
          // cert-limit branch: creating-certificate surfaces the existing certs to
          // offer for revocation (React `existingCerts` drives the prompt's list).
          if (t.existingCerts !== undefined)
            setExistingCerts(t.existingCerts)
          // duplicate branch: creating-profile surfaces the duplicate Capgo
          // profiles (React `duplicateProfiles` drives the prompt + delete count).
          if (t.duplicateProfiles !== undefined)
            setDuplicateProfiles(t.duplicateProfiles)
        }

        // ── p8-method-select picker effect: mirror the persisted p8Path/keyId so
        // the input steps + getFreshToken see them, exactly as the bespoke body did.
        if (step === 'p8-method-select') {
          if (np.p8Path)
            setP8Path(np.p8Path)
          if (np.keyId)
            setKeyId(np.keyId)
        }

        // creating-profile (engine) persists duplicateProfileOrigin='creating-profile'
        // when it routes to the duplicate prompt; mirror it so the React render +
        // the deleting-duplicate-profiles route agree.
        if (np.duplicateProfileOrigin)
          setDuplicateProfileOrigin(np.duplicateProfileOrigin)

        // revoking-certificate success clears the cert-limit selection, matching
        // the bespoke body (setCertToRevoke(null) + setExistingCerts([])).
        if (step === 'revoking-certificate') {
          setCertToRevoke(null)
          setExistingCerts([])
        }
        // deleting-duplicate-profiles success clears the duplicate list, matching
        // the bespoke body (setDuplicateProfiles([])).
        if (step === 'deleting-duplicate-profiles')
          setDuplicateProfiles([])

        // A successful provisioning step resets the retry counter, mirroring the
        // bespoke setRetryCount(0) at each create-new success point.
        if (step === 'verifying-key' || step === 'creating-certificate' || step === 'creating-profile')
          setRetryCount(0)

        // ── advance ──────────────────────────────────────────────────────────
        // The engine returns an explicit `next` for every effect step. For the
        // create-new verifying-key the bespoke wrapped its next in
        // redirectIfMismatch (the confirm-app-id bundle-id gate, a SYNC FS read
        // the IO-free engine can't do) — re-apply it here so the create-new path
        // still detours through confirm-app-id when config.appId and pbxproj
        // disagree. Every other step's next is used verbatim.
        const next = result.next ?? getIosResumeStep(np)
        if (!next)
          return
        const advanceTo = step === 'verifying-key' ? redirectIfMismatch(next) : next
        if (advanceTo !== step)
          setStep(advanceTo)
      }
      catch (err) {
        if (!cancelled)
          handleError(err, step)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // ─── Engine-driven IMPORT effect driver (ink-thin-wrapper, Stage 3 slice C) ──
  // Route the IMPORT credential EFFECT steps (IOS_ENGINE_IMPORT_EFFECT_STEPS)
  // through the shared engine's `runIosEffect` instead of the hand-rolled per-step
  // bodies that used to live in the big bespoke effect above. The FLOW lives in
  // the engine (ios/flow.ts, e2e-tested via test/test-ios-import-*.mjs +
  // test-ios-e2e.mjs); the RENDERING stays ink (the same ImportScanningStep /
  // ImportPickIdentityStep / … components). Mirrors the create-new effect driver:
  // build the import deps wiring the REAL macos-signing / apple-api helpers
  // (token-adapted via getFreshToken; the classify pre-binds the single team-wide
  // cert fetch + SHA-1 index so the engine just maps identity → availability), run
  // the effect against the freshest persisted progress + the ephemeral selections
  // the choice handlers stash in iosCarriedRef, thread the engine transient back
  // into iosCarriedRef + mirror it into the React render state, and advance.
  useEffect(() => {
    if (!IOS_ENGINE_IMPORT_EFFECT_STEPS.has(step))
      return

    let cancelled = false

    void (async () => {
      // classifyCertAvailability pre-binds the single team-wide cert fetch + SHA-1
      // index (the bespoke import-validating-all-certs optimisation, app.tsx old
      // L1391): one /certificates download, M SHA-1 hashes, then N O(1) lookups —
      // NOT N re-downloads. Memoised so the engine's per-identity loop shares it.
      let certIndexPromise: Promise<Map<string, AscDistributionCert>> | null = null
      const getCertIndex = () => {
        if (!certIndexPromise) {
          certIndexPromise = (async () => {
            const token = await getFreshToken()
            const allCerts = await listDistributionCerts(token, { includeContent: true })
            const bySha1 = new Map<string, AscDistributionCert>()
            for (const cert of allCerts) {
              if (!cert.certificateContent)
                continue
              bySha1.set(computeCertSha1(cert.certificateContent), cert)
            }
            return bySha1
          })()
        }
        return certIndexPromise
      }

      const deps: IosEffectDeps = {
        appId,

        // ── macos-signing (import-scanning + export) ──
        listSigningIdentities,
        scanProvisioningProfiles,
        exportP12FromKeychain,
        precompileSwiftHelper: async () => { await precompileSwiftHelper() },
        isHelperCached,

        // ── apple-api (token-adapted, mirroring the bespoke import effects) ──
        // classifyCertAvailability resolves the identity's cert from the pre-built
        // SHA-1 index, then enriches via the apple-api classifier — byte-for-byte
        // the bespoke map[r.sha1] entry (old app.tsx L1417-1444).
        classifyCertAvailability: async (identity) => {
          const bySha1 = await getCertIndex()
          const cert = bySha1.get(identity.sha1.toLowerCase()) ?? null
          const classified = classifyCertAvailability({
            appleCertId: cert ? cert.id : null,
            lookupError: null,
          })
          return {
            available: classified.available,
            reason: classified.reason,
            reasonText: classified.reasonText,
            appleCertId: classified.appleCertId,
            ...(cert && classified.available
              ? {
                  appleCertName: cert.name,
                  appleCertExpirationDate: cert.expirationDate,
                  appleCertSerialNumber: cert.serialNumber,
                }
              : {}),
          }
        },
        listProfilesForCert: async certId => listProfilesForCert(await getFreshToken(), certId),
        findCertIdBySha1: async sha1 => findCertIdBySha1(await getFreshToken(), sha1),
        ensureBundleId: async (bundleId) => {
          await ensureBundleId(await getFreshToken(), bundleId)
        },
        createProfile: async ({ bundleId, certificateId }) => {
          const token = await getFreshToken()
          const { bundleIdResourceId } = await ensureBundleId(token, bundleId)
          const p = await createProfile(token, bundleIdResourceId, certificateId, bundleId)
          return {
            profileId: p.profileId,
            profileName: p.profileName,
            profileBase64: p.profileContent,
            expirationDate: p.expirationDate,
          } as ProfileData & { expirationDate?: string }
        },

        // ── mobileprovision-parser + file pickers ──
        // The engine reads the .mobileprovision bytes via deps.readFile then parses
        // them here — so wire the BUFFER variant (the path-based
        // parseMobileprovisionDetailed reads the file itself, which the engine has
        // already done at its IO boundary).
        parseMobileprovisionDetailed: bytes => parseMobileprovisionBufferDetailed(bytes),
        openProfilePicker: openMobileprovisionPicker,
        readFile: async path => Buffer.from(await readFile(path)),

        // ── persistence ──
        loadProgress,
        saveProgress,

        // ── carried transient (driver-held) — the choice handlers stash the
        // ephemeral picks (chosenIdentity / chosenProfile / noMatchReason /
        // profilePickerOpened / helperCompiled) here so the import effects find
        // their inputs, exactly as the engine resolver contract expects.
        carried: {
          ...iosCarriedRef.current,
          // The import effects read chosenIdentity / chosenProfile from carried;
          // bridge the React mirrors in case a choice handler set the React state
          // but the carried ref hasn't been threaded yet (slice-C bridge).
          ...(chosenIdentity ? { chosenIdentity } : {}),
          ...(chosenProfile ? { chosenProfile } : {}),
          ...(importMatches.length > 0 ? { importMatches } : {}),
          ...(noMatchReason ? { noMatchReason } : {}),
          p8Content: iosCarriedRef.current.p8Content ?? (p8ContentRef.current ? Buffer.from(p8ContentRef.current) : undefined),
        },

        onLog: (message, color) => {
          if (!cancelled)
            addLog(message, color)
        },
      }

      try {
        const current = (await loadProgress(appId)) ?? {
          platform: 'ios' as const,
          appId,
          startedAt: new Date().toISOString(),
          completedSteps: {},
        }
        if (cancelled)
          return
        const result = await runIosEffect(step, current, deps)
        if (cancelled)
          return

        const t: Partial<IosStepCtx> | undefined = result.transient
        const np = result.progress

        // ── error route: surface through handleError so the support bundle +
        // retryCount + telemetry UX is identical to the bespoke catch ──
        if (result.next === 'error') {
          handleError(new Error(t?.error ?? 'Onboarding failed.'), (t?.retryStep as OnboardingStep) ?? step)
          return
        }

        // ── merge engine transient into iosCarriedRef + mirror into React state ──
        if (t) {
          iosCarriedRef.current = { ...iosCarriedRef.current, ...t }
          if (t.chosenProfile !== undefined)
            setChosenProfile(t.chosenProfile)
          if (t.certData !== undefined)
            setCertData(t.certData)
          if (t.profileData !== undefined)
            setProfileData(t.profileData)
          if (t.teamId !== undefined)
            setTeamId(t.teamId)
          if (t.importedP12Password !== undefined)
            setImportedP12Password(t.importedP12Password)
          // import-scanning surfaces the scanned matches + profiles; the picker +
          // the validating pass read the React mirrors.
          if (t.importProfiles !== undefined)
            setImportProfiles(t.importProfiles)
          // identityAvailability rides transient verbatim from validating-all-certs.
          if (t.identityAvailability !== undefined)
            setIdentityAvailability(t.identityAvailability)
          // noMatchReason rides transient from the pick / apple-cert-check / file-
          // picker steps; the recovery menu reads the React mirror.
          if (t.noMatchReason !== undefined)
            setNoMatchReason(t.noMatchReason as NoMatchReason)
          // The per-identity Apple cert id surfaced by import-checking-apple-cert.
          if (t._appleCertIdForChosen !== undefined)
            setAppleCertIdForChosen(t._appleCertIdForChosen)
          // import-create-profile-only routes to duplicate-profile-prompt with the
          // duplicate list; mirror it + the persisted origin so the shared prompt +
          // the deleting-duplicate-profiles route agree.
          if (t.duplicateProfiles !== undefined)
            setDuplicateProfiles(t.duplicateProfiles)
        }

        // ── importMatches mirror ──────────────────────────────────────────────
        // import-scanning (raw scan) + the apple-cert-check / file-picker / D2
        // steps (which INJECT synthesized profiles into the chosen identity's
        // match) emit the updated match list via transient.importMatches; mirror
        // it so the pickers render the freshest profiles.
        if (t?.importMatches !== undefined)
          setImportMatches(t.importMatches)

        // ── profilePrefetch mirror (validating-all-certs) ─────────────────────
        // The engine emits transient.profilePrefetch as Record<sha1, profiles[]>
        // (the synthesized Apple-side profiles per available identity). The React
        // picker reads TWO derived signals: (1) the per-identity status map
        // (profilePrefetch state) the Available table colours, and (2) the
        // injected profiles in importMatches that light the cell green. Reproduce
        // the bespoke parallel-prefetch outcome (old app.tsx L1508-1524): filter
        // each identity's profiles for THIS app+distribution; usable → inject +
        // 'available', none usable → 'unavailable'.
        if (t?.profilePrefetch !== undefined) {
          const prefetch = t.profilePrefetch
          const statusMap: Record<string, { kind: 'pending' | 'available' | 'unavailable' | 'timeout' | 'error' }> = {}
          const injections: Record<string, DiscoveredProfile[]> = {}
          for (const [sha1, profiles] of Object.entries(prefetch)) {
            const usableHere = filterProfilesForApp(profiles, iosBundleId, importDistribution)
            if (usableHere.length === 0) {
              statusMap[sha1] = { kind: 'unavailable' }
            }
            else {
              injections[sha1] = profiles
              statusMap[sha1] = { kind: 'available' }
            }
          }
          setProfilePrefetch(prev => ({ ...prev, ...statusMap }))
          if (Object.keys(injections).length > 0) {
            setImportMatches(prev => prev.map(m => injections[m.identity.sha1]
              ? { ...m, profiles: [...m.profiles, ...injections[m.identity.sha1]] }
              : m))
            // Thread the injected matches into the carried ref too so the next
            // resolver (import-pick-identity) sees the prefetched profiles.
            iosCarriedRef.current = {
              ...iosCarriedRef.current,
              importMatches: (iosCarriedRef.current.importMatches ?? importMatches).map(m => injections[m.identity.sha1]
                ? { ...m, profiles: [...m.profiles, ...injections[m.identity.sha1]] }
                : m),
            }
          }
        }

        // creating a profile via D2 can persist duplicateProfileOrigin; mirror it.
        if (np.duplicateProfileOrigin)
          setDuplicateProfileOrigin(np.duplicateProfileOrigin)

        // ── advance ──────────────────────────────────────────────────────────
        // import-scanning's engine `next` is getImportEntryStep(progress) — the
        // un-redirected import-entry target. The bespoke wrapped it in
        // redirectIfMismatch (the confirm-app-id bundle-id gate, a SYNC FS read the
        // IO-free engine can't do) so the import path detours through confirm-app-id
        // when config.appId and pbxproj disagree. Re-apply it here for import-
        // scanning; every other import effect's next is used verbatim.
        const next = result.next ?? getIosResumeStep(np)
        if (!next)
          return
        const advanceTo = step === 'import-scanning' ? redirectIfMismatch(next) : next
        if (advanceTo !== step)
          setStep(advanceTo)
      }
      catch (err) {
        if (!cancelled)
          handleError(err, step)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // ─── Engine-driven post-save TAIL driver (ink-thin-wrapper, Stage 3 slice A) ──
  // Delegate the post-save tail effect steps (IOS_TAIL_DRIVER_STEPS) to the shared
  // engine's `runIosEffect`, which routes them into the platform-neutral tail module
  // (via toTailDeps). The FLOW lives in the engine (tail/flow.ts, e2e-tested); the
  // RENDERING stays ink. Mirrors the android post-save tail driver
  // (android/ui/app.tsx). saving-credentials still finds the create-new payloads in
  // iosCarriedRef (mirrored by the create driver) and the import payloads in React
  // state (the import effects stay bespoke until slice C); the env/workflow/build
  // steps read the in-memory React tail inputs via a SYNTHETIC progress. The engine
  // NEVER re-creates progress.json here. ai-analysis-* + the fullscreen build/diff
  // takeovers stay ink-only; the requesting-build → ai-analysis-prompt handoff still
  // reaches the AI UI because the engine returns next: 'ai-analysis-prompt'.
  useEffect(() => {
    if (!IOS_TAIL_DRIVER_STEPS.has(step))
      return

    let cancelled = false
    const abort = new AbortController()

    void (async () => {
      // CLI-flag key takes precedence over the saved one (mirrors the bespoke tail's
      // `apikey ?? findSavedKeySilent()` at saving-credentials / requesting-build).
      const resolveCapgoKey = (): string | undefined => apikey ?? findSavedKeySilent()

      // Load the on-disk progress so the saving-credentials self-heal guard can
      // re-validate it (the engine re-loads internally too via deps.loadProgress).
      // For the later tail steps progress.json is already deleted, so this is null
      // and the SYNTHETIC progress below carries the in-memory tail inputs instead.
      const disk = await loadProgress(appId)
      if (cancelled)
        return
      const base: OnboardingProgress = disk ?? {
        platform: 'ios',
        appId,
        startedAt: new Date().toISOString(),
        completedSteps: {},
      }
      // SYNTHETIC progress: overlay the in-memory React tail inputs the engine reads
      // (setupMode / ciSecretTarget / selectedPackageManager / buildScriptChoice /
      // envExportTargetPath). For saving-credentials `disk` carries the create-new
      // completedSteps + setupMethod + importDistribution + iosBundleIdOverride; the
      // import path's cert/profile payloads ride deps.carried below.
      const tailProgress: OnboardingProgress = {
        ...base,
        setupMode,
        ciSecretTarget,
        selectedPackageManager: selectedPackageManager ?? normalizePackageManager(pm.pm),
        buildScriptChoice,
        envExportTargetPath,
      }

      const deps: IosEffectDeps = {
        appId,

        // ── persistence (saving-credentials writes + deletes progress.json) ──
        loadProgress,
        saveProgress,
        deleteProgress,
        updateSavedCredentials,

        // ── tail helpers — pre-bind the resolved Capgo key into the entry builder
        // so CAPGO_TOKEN is included (mirrors createCiSecretEntries(creds, capgoKey)).
        createCiSecretEntries: creds => createCiSecretEntries(creds, resolveCapgoKey()),
        detectCiSecretTargets,
        getCiSecretRepoLabelAsync,
        listExistingCiSecretKeysAsync,
        uploadCiSecretsAsync,
        exportCredentialsToEnv,
        defaultExportPath,
        generateWorkflow,
        writeWorkflowFile,
        requestBuildInternal,

        // ── streaming / telemetry / preload sinks (forwarded into the shared tail) ──
        // The rich streaming BuildLogger requesting-build forwards into
        // requestBuildInternal (4th arg) — every build line streams into the
        // FullscreenBuildOutput pane via setBuildOutput, byte-for-byte the bespoke
        // logger (info/error/warn/success/buildLog sanitize/uploadProgress dedup/
        // customMsg → handleCustomMsg). Only requesting-build consumes it.
        logger: {
          info: (msg: string) => { if (!cancelled) setBuildOutput(prev => [...prev, msg]) },
          error: (msg: string) => { if (!cancelled) setBuildOutput(prev => [...prev, `✖ ${msg}`]) },
          warn: (msg: string) => { if (!cancelled) setBuildOutput(prev => [...prev, `⚠ ${msg}`]) },
          success: (msg: string) => { if (!cancelled) setBuildOutput(prev => [...prev, `✔ ${msg}`]) },
          buildLog: (msg: string) => { if (!cancelled) setBuildOutput(prev => [...prev, ...sanitizeBuildLogLines(msg)]) },
          uploadProgress: (percent: number) => {
            if (cancelled)
              return
            setBuildOutput((prev) => {
              const idx = prev.findIndex(l => l.startsWith('Uploading:'))
              const line = `Uploading: ${percent.toFixed(0)}%`
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = line
                return next
              }
              return [...prev, line]
            })
          },
          customMsg: async (kind: string, data: Record<string, unknown>) => {
            await handleCustomMsg(
              kind,
              data,
              (line: string) => { if (!cancelled) setBuildOutput(prev => [...prev, line]) },
              (line: string) => { if (!cancelled) setBuildOutput(prev => [...prev, line]) },
            )
          },
        },
        onBuildOutput: (line) => {
          if (!cancelled)
            setBuildOutput(prev => [...prev, line])
        },
        resolveApikey: resolveCapgoKey,
        onCiSecretUploadProgress: (current, total, keyName) => {
          if (!cancelled)
            setCiSecretUploadProgress({ current, total, key: keyName })
        },
        onCiSecretCheckPhase: (phase) => {
          if (!cancelled)
            setCiSecretCheckPhase(phase)
        },
        onCiSecretError: (message) => {
          if (!cancelled)
            setCiSecretError(message)
        },
        getPackageScripts,
        findProjectType,
        findBuildCommandForProjectType,
        trackWorkflowEvent: (event, options) => {
          trackWorkflowEvent(event as BuildOnboardingWorkflowEvent, options as { decision?: BuildOnboardingWorkflowDecision })
        },

        // ── carried transient (driver-held) — the create-new payloads live in
        // iosCarriedRef (mirrored by the create driver); the import path's
        // cert/profile/p12 + the .p8 bytes live in React state until slice C routes
        // the import effects, so thread BOTH so saving-credentials finds its inputs
        // on either path. The tail state (savedCredentials / ciSecretEntries /
        // ciSecretExistingKeys / workflowIsNew) is the in-memory React tail state.
        carried: {
          ...iosCarriedRef.current,
          certData: iosCarriedRef.current.certData ?? certData ?? undefined,
          profileData: iosCarriedRef.current.profileData ?? profileData ?? undefined,
          teamId: iosCarriedRef.current.teamId ?? teamId ?? undefined,
          p8Content: iosCarriedRef.current.p8Content ?? (p8ContentRef.current ? Buffer.from(p8ContentRef.current) : undefined),
          importedP12Password: iosCarriedRef.current.importedP12Password ?? (importedP12Password || undefined),
          savedCredentials: (savedCredentials ?? undefined) as Record<string, string> | undefined,
          ciSecretEntries,
          ciSecretExistingKeys,
          workflowIsNew: previewIsNew,
        },

        onLog: (message, color) => {
          if (!cancelled)
            addLog(message, color)
        },
        signal: abort.signal,
      }

      // requesting-build resets the build VIEWER to empty BEFORE the engine streams
      // in, so the engine's appended header (onBuildOutput) reproduces the bespoke
      // `setBuildOutput([header])` REPLACE — wiping a prior build's output on the AI
      // retry re-entry instead of appending under it.
      if (step === 'requesting-build')
        setBuildOutput([])

      try {
        const result = await runIosEffect(step, tailProgress, deps)
        if (cancelled)
          return

        const t = result.transient
        const np = result.progress

        // ── Mirror engine transient → render state ─────────────────────────────
        if (t?.savedCredentials !== undefined)
          setSavedCredentials(t.savedCredentials)
        if (t?.ciSecretEntries !== undefined)
          setCiSecretEntries(t.ciSecretEntries)
        if (t?.ciSecretTargets !== undefined)
          setCiSecretTargets(t.ciSecretTargets)
        if (t?.ciSecretSetupAdvice !== undefined)
          setCiSecretSetupAdvice(t.ciSecretSetupAdvice)
        if (t?.ciSecretRepoLabel !== undefined)
          setCiSecretRepoLabel(t.ciSecretRepoLabel)
        if (t?.ciSecretExistingKeys !== undefined)
          setCiSecretExistingKeys(t.ciSecretExistingKeys)
        if (t?.ciSecretUploadSummary !== undefined)
          setCiSecretUploadSummary(t.ciSecretUploadSummary)
        if (t?.availableScripts !== undefined)
          setAvailableScripts(t.availableScripts)
        if (t?.recommendedScript !== undefined)
          setRecommendedScript(t.recommendedScript)
        // env-export results (exporting-env / overwrite-and-export-env).
        if (t?.envExportPath !== undefined)
          setEnvExportPath(t.envExportPath)
        if (t?.envExportError !== undefined)
          setEnvExportError(t.envExportError)
        // writing-workflow-file: the written path (transient.workflowFilePath →
        // setWorkflowWrittenPath). The engine already emitted the Wrote/Overwrote
        // log + workflow-file-written telemetry via onLog / trackWorkflowEvent.
        if (t?.workflowFilePath !== undefined)
          setWorkflowWrittenPath(t.workflowFilePath)
        // requesting-build: the queued build URL + the captured AI-analysis job id
        // surfaced on a failed build (transient.aiJobId → the ai-analysis-* sub-flow).
        if (t?.buildUrl !== undefined)
          setBuildUrl(t.buildUrl)
        if (t?.aiJobId !== undefined)
          setAiJobId(t.aiJobId)
        // The chosen CI-secret target rides on the RETURNED progress (the engine sets
        // it when detecting resolves a single target); mirror it into React state.
        if (np.ciSecretTarget !== undefined && np.ciSecretTarget !== null)
          setCiSecretTarget(np.ciSecretTarget)
        // exporting-env 'exists' carries the resolved export path forward on the
        // RETURNED progress so overwrite-and-export-env can write to it.
        if (np.envExportTargetPath !== undefined && np.envExportTargetPath !== envExportTargetPath)
          setEnvExportTargetPath(np.envExportTargetPath)
        // The upload progress bar is cleared by uploading-ci-secrets completing.
        if (step === 'uploading-ci-secrets')
          setCiSecretUploadProgress(null)
        // The shared tail engine routes a CI-secret check/upload failure to
        // ci-secrets-failed on its SUCCESS path (it RETURNS the failure route +
        // transient.ciSecretError rather than throwing — tail/flow.ts checking-
        // ci-secrets). ci-secrets-failed renders `error={ciSecretError}`, so
        // mirror the engine transient into React state or the screen shows a
        // blank reason. (The catch branch below covers the THROW path.)
        if (t?.ciSecretError !== undefined)
          setCiSecretError(t.ciSecretError)
        // requesting-build surfaces a non-throwing build-request failure via
        // transient.error (tail/flow.ts requesting-build catch → build-complete).
        // Mirror it to React error state for parity with the bespoke setError
        // path; the reason is also already streamed into the build viewer.
        if (t?.error !== undefined)
          setError(t.error)

        // ── Advance ────────────────────────────────────────────────────────────
        // writing-workflow-file keeps the bespoke 150ms settle before advancing to
        // build-complete (a driver concern — the engine returns next immediately).
        if (result.next && result.next !== step) {
          if (step === 'writing-workflow-file') {
            const next = result.next
            setTimeout(() => {
              if (!cancelled)
                setStep(next)
            }, 150)
          }
          else {
            setStep(result.next)
          }
        }
      }
      catch (err) {
        if (cancelled)
          return
        // Step-aware error routing — match each bespoke tail handler's catch EXACTLY.
        // The shared engine wraps checking-ci-secrets / exporting-env /
        // overwrite-and-export-env / requesting-build internally (returns a failure
        // route, never throws), but detecting-ci-secrets / uploading-ci-secrets /
        // writing-workflow-file can still throw OUT of the engine, so the driver
        // reproduces the bespoke recovery for those here. Credentials are already
        // saved on every post-save tail step, so only saving-credentials uses
        // handleError.
        const message = err instanceof Error ? err.message : String(err)
        if (step === 'saving-credentials') {
          handleError(err, 'saving-credentials')
        }
        else if (step === 'requesting-build') {
          // The engine catches build-request throws internally (→ build-complete),
          // so this is defensive parity with the bespoke catch.
          setBuildOutput(prev => [...prev, `⚠ ${message}`])
          setBuildOutput(prev => [...prev, `Your credentials are saved. Run \`${buildRequestCommand}\` to try again.`])
          setStep('build-complete')
        }
        else if (step === 'exporting-env' || step === 'overwrite-and-export-env') {
          setEnvExportError(message)
          setStep('build-complete')
        }
        else if (step === 'writing-workflow-file') {
          addLog(`⚠ Failed to write workflow file: ${message}`, 'yellow')
          setTimeout(() => {
            if (!cancelled)
              setStep('build-complete')
          }, 150)
        }
        else {
          // detecting-ci-secrets / checking-ci-secrets / uploading-ci-secrets
          setCiSecretError(message)
          setStep('ci-secrets-failed')
        }
      }
    })()

    return () => {
      cancelled = true
      abort.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

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
  const showProgress = step !== 'welcome' && step !== 'platform-select' && step !== 'adding-platform' && step !== 'no-platform' && step !== 'error' && step !== 'build-complete' && step !== 'requesting-build' && step !== 'ai-analysis-result' && !isAiResultScroll && !tallStep
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
    && estimateErrorBodyRows(error, recoveryAdvice, supportBundlePath, terminalCols, !!retryStep) + ERROR_FRAME_CHROME_ROWS > terminalRows
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
  if (isAiResultScroll && aiAnalysisText)
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

  // The iOS error screen is a fullscreen scroll takeover when its recovery
  // advice is taller than the viewport — same treatment as the AI viewer above,
  // so the Try again / Restart / Exit actions (in the compact ErrorStep shown
  // after dismiss) are never pushed off-screen. Placed after the size gate like
  // the AI viewer: below the floor the resize prompt wins.
  if (isErrorScroll && error)
    return (
      <FullscreenAiViewer
        title="Build error"
        subtitle={`${errorViewerLines.length} lines — scrollable because the error details are taller than your terminal`}
        lines={errorViewerLines}
        terminalRows={terminalRows}
        onExit={() => setErrorViewedFull(true)}
      />
    )

  // The workflow-file diff is a fullscreen takeover too (same reasoning as the
  // AI/build viewers): rendered inside the wizard Box it inherited the header +
  // padding (a large top gap) and a too-short viewport. As an early return it
  // owns the whole terminal and fills it.
  if (step === 'view-workflow-diff' && previewDiff.length > 0)
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
            // step and triggers the cert-limit error. applyIosInput records
            // setupMethod ('import-existing' | 'create-new') exactly as the
            // bespoke `existing.setupMethod = …` did.
            const existing = await loadProgress(appId) || {
              platform: 'ios' as const,
              appId,
              startedAt: new Date().toISOString(),
              completedSteps: {},
            }
            const reduced = applyIosInput('setup-method-select', existing, { step: 'setup-method-select', value })
            await saveProgress(appId, reduced)

            // Keep the React `importMode` mirror in sync (read by the
            // create-new effect driver's verifying-key guard + saving-credentials).
            if (value === 'import') {
              setImportMode(true)
              // DIVERGE: the bespoke jumps STRAIGHT to the silent import-scanning
              // discovery, which is NOT a resume target (getIosResumeStep with no
              // importDistribution yet collapses onto import-distribution-mode).
              // The driver runs import-scanning as a navigation gate, so keep the
              // explicit setStep here (matches the routing test's DIVERGE class).
              setStep('import-scanning')
            }
            else {
              setImportMode(false)
              // MATCH: create-new resume (setupMethod='create-new', no .p8) lands
              // on api-key-instructions — engine-derived.
              setStep(getIosResumeStep(reduced))
            }
          }}
        />
      )}

      {/* Import: scanning */}
      {step === 'import-scanning' && <ImportScanningStep />}

      {/* Confirm iOS bundle id when config.appId and project.pbxproj
          disagree. Only reached via redirectIfMismatch — never shown on
          fresh runs where everything lines up. */}
      {step === 'confirm-app-id' && (() => {
        const onChoose = async (chosen: string) => {
          setIosBundleId(chosen)
          setAppIdConfirmed(true)
          setConfirmAppIdTyping(false)
          // Persist + snapshot the current config.appId so the next CLI
          // run can detect "user changed the app id since last time" and
          // re-ask. Merge with whatever progress already exists.
          const existing = await loadProgress(appId) || {
            platform: 'ios' as const,
            appId,
            startedAt: new Date().toISOString(),
            completedSteps: {},
          }
          existing.iosBundleIdOverride = chosen
          existing.iosBundleIdContextAppId = iosBundleIdInitial
          await saveProgress(appId, existing)
          if (chosen !== iosBundleIdInitial)
            addLog(`✔ Using "${chosen}" as the iOS bundle ID for Apple operations (capacitor.config.appId is "${iosBundleIdInitial}")`)
          else
            addLog(`✔ Confirmed "${chosen}" as the iOS bundle ID`)
          setStep(pendingAppIdNext ?? 'import-pick-identity')
          setPendingAppIdNext(null)
        }

        if (confirmAppIdTyping) {
          return (
            <Box flexDirection="column" marginTop={1}>
              <Alert variant="info">
                Type the iOS bundle ID to use for Apple operations.
              </Alert>
              <Newline />
              <Text dimColor>
                {`Press Enter when done. This is what we'll send to Apple's API for cert and profile lookups — it must match `}
                <Text bold>PRODUCT_BUNDLE_IDENTIFIER</Text>
                {' in your Xcode project (and the App ID on developer.apple.com).'}
              </Text>
              <Newline />
              <FilteredTextInput
                placeholder="e.g. com.example.myapp"
                allowedPattern={/[A-Za-z0-9.-]/}
                maxLength={155}
                initialValue={detectedIds.recommended.value}
                onSubmit={(value) => {
                  const trimmed = value.trim()
                  if (!trimmed)
                    return
                  void onChoose(trimmed)
                }}
              />
            </Box>
          )
        }

        return (
          <Box flexDirection="column" marginTop={1}>
            <Alert variant="warning">
              {`The iOS bundle ID in your Xcode project doesn't match capacitor.config.`}
            </Alert>
            <Newline />
            <Text dimColor>
              {`We use the iOS bundle ID for Apple Developer Portal operations (looking up certs, fetching/creating provisioning profiles). Picking the wrong one is the cause of "Apple returned X profiles but none target …" errors. capacitor.config.appId stays untouched — this only affects what we send to Apple.`}
            </Text>
            <Newline />
            <Box flexDirection="column" marginLeft={2}>
              {detectedIds.pbxproj && (
                <Text>
                  • Xcode (
                  <Text bold>{detectedIds.pbxproj.label}</Text>
                  ):
                  {' '}
                  <Text bold color="cyan">{detectedIds.pbxproj.value}</Text>
                </Text>
              )}
              {detectedIds.plist && (
                <Text>
                  • Info.plist (CFBundleIdentifier):
                  {' '}
                  <Text bold color="cyan">{detectedIds.plist.value}</Text>
                </Text>
              )}
              <Text>
                • Capacitor (capacitor.config.appId):
                {' '}
                <Text bold color="cyan">{detectedIds.capacitor.value}</Text>
              </Text>
            </Box>
            <Newline />
            <Text>Which value should we use for Apple-side operations?</Text>
            <Newline />
            <Select
              options={[
                ...detectedIds.candidates.map((c, i) => ({
                  label: i === 0
                    ? `${c.value} — ${c.label} (recommended)`
                    : `${c.value} — ${c.label}`,
                  value: c.value,
                })),
                { label: '✏️   Type a custom bundle ID...', value: '__type__' },
              ]}
              onChange={(value) => {
                if (value === '__type__') {
                  setConfirmAppIdTyping(true)
                  return
                }
                void onChoose(value)
              }}
            />
          </Box>
        )
      })()}

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
          'Name': `🔒 ${m.identity.name}`,
          'Team': m.identity.teamId,
          'Reason': identityAvailability[m.identity.sha1]?.reasonText || 'Not classified',
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
                <Text bold color="red">{`✖  NO CERTIFICATES AVAILABLE`}</Text>
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
                if (hasAscKey)
                  setStep('import-create-profile-only')
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
              // First run on this CLI version: compile the Swift helper
              // explicitly so the user sees what's happening, instead of
              // staring at the "look for the macOS dialog" spinner while
              // we silently do a 2-3s swiftc invocation. Cache hit skips
              // straight to export.
              setStep(isHelperCached() ? 'import-exporting' : 'import-compiling-helper')
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

      {/* Import: compiling helper (one-time per CLI version) */}
      {step === 'import-compiling-helper' && <ImportCompilingHelperStep dense={dense} />}

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
              await savePartialProgress({ p8Path: filePath, keyId: extracted || undefined })
              // Engine-derived routing (same as the input-p8-path onSubmit): the
              // direct path-submit on the api-key-instructions screen is an
              // input-p8-path action. Route off a base WITHOUT keyId so it lands
              // on input-key-id, MATCHing the bespoke setStep('input-key-id').
              // We load the FULL persisted progress first (the sibling input-key-id
              // / input-issuer-id handlers do the same) so routing-critical fields
              // — esp. pendingAppIdNext + appIdConfirmed (the confirm-app-id gate) —
              // survive into the routing base instead of being dropped by a minimal
              // synthetic object. We then merge the new p8Path but CLEAR keyId so
              // getIosResumeStep still lands on input-key-id (the user confirms the
              // auto-detected Key ID). Note: keyId is still SAVED above for resume.
              const loaded = await loadProgress(appId)
              const base = { ...(loaded ?? { platform: 'ios' as const, appId, startedAt: new Date().toISOString(), completedSteps: {}, setupMethod: importMode ? 'import-existing' as const : 'create-new' as const, ...(importMode && importDistribution ? { importDistribution } : {}) }), p8Path: filePath, keyId: undefined }
              const reduced = applyIosInput('input-p8-path', base, { step: 'input-p8-path', value: filePath })
              setStep(getIosResumeStep(reduced))
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
              await savePartialProgress({ p8Path: filePath, keyId: extracted || undefined })
              // Engine-derived routing: applyIosInput records ONLY p8Path (file
              // read + keyId extraction are the effect boundary, done above), then
              // getIosResumeStep routes on the .p8 chain. We route off a base WITHOUT
              // keyId so it lands on input-key-id (the user still confirms/overrides
              // the auto-detected Key ID), MATCHing the bespoke setStep('input-key-id')
              // — even though keyId is persisted to disk for resume restoration.
              // We load the FULL persisted progress first (the sibling input-key-id
              // / input-issuer-id handlers do the same) so routing-critical fields
              // — esp. pendingAppIdNext + appIdConfirmed (the confirm-app-id gate) —
              // survive into the routing base instead of being dropped by a minimal
              // synthetic object. We then merge the new p8Path but CLEAR keyId so
              // getIosResumeStep still lands on input-key-id (the user confirms the
              // auto-detected Key ID). Note: keyId is still SAVED above for resume.
              const loaded = await loadProgress(appId)
              const base = { ...(loaded ?? { platform: 'ios' as const, appId, startedAt: new Date().toISOString(), completedSteps: {}, setupMethod: importMode ? 'import-existing' as const : 'create-new' as const, ...(importMode && importDistribution ? { importDistribution } : {}) }), p8Path: filePath, keyId: undefined }
              const reduced = applyIosInput('input-p8-path', base, { step: 'input-p8-path', value: filePath })
              setStep(getIosResumeStep(reduced))
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
          onSubmit={async (value) => {
            // `value || keyId` reuses the detected key ID when the user just
            // presses Enter; the trim+guard rejects an empty submission in the
            // no-detection case (keyId='' makes the fallback a no-op).
            const finalKeyId = (value || keyId).trim()
            if (!finalKeyId)
              return
            setKeyId(finalKeyId)
            upsertLog('✔ Key ID · ', `✔ Key ID · ${finalKeyId}`)
            await savePartialProgress({ keyId: finalKeyId })
            // Engine-derived routing: applyIosInput records keyId (we pass the
            // already-resolved finalKeyId so the engine's `value || detected`
            // matches the bespoke `value || keyId`), then getIosResumeStep
            // re-derives the next step from the persisted .p8 chain (p8Path +
            // keyId set, no issuerId → input-issuer-id). MATCHes the bespoke
            // setStep('input-issuer-id').
            const loaded = await loadProgress(appId)
            const reduced = applyIosInput('input-key-id', loaded ?? { platform: 'ios', appId, startedAt: new Date().toISOString(), completedSteps: {} }, { step: 'input-key-id', value: finalKeyId })
            setStep(getIosResumeStep(reduced))
          }}
        />
      )}

      {/* Issuer ID */}
      {step === 'input-issuer-id' && (
        <InputIssuerIdStep
          dense={dense}
          onSubmit={async (value) => {
            const cleaned = value.trim()
            if (!cleaned)
              return
            setIssuerId(cleaned)
            upsertLog('✔ Issuer ID · ', `✔ Issuer ID · ${cleaned}`)
            await savePartialProgress({ issuerId: cleaned })
            // Engine-derived routing: applyIosInput records issuerId, then
            // getIosResumeStep re-derives the next step from the persisted .p8
            // chain (p8Path + keyId + issuerId all set → verifying-key). MATCHes
            // the bespoke setStep('verifying-key'). Works for both create-new and
            // import app_store (getResumeStep routes the same on a full .p8 chain).
            const loaded = await loadProgress(appId)
            const reduced = applyIosInput('input-issuer-id', loaded ?? { platform: 'ios', appId, startedAt: new Date().toISOString(), completedSteps: {} }, { step: 'input-issuer-id', value })
            setStep(getIosResumeStep(reduced))
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
          onChange={async (value) => {
            if (value === '__exit__') {
              // DIVERGE: the bespoke exit escape calls exitOnboarding directly
              // (the engine models this as the resolver's 'error' route, but the
              // TUI's user-facing exit sink is exitOnboarding — keep it).
              addLog(`Exiting. Revoke a certificate manually in App Store Connect, then resume with ${buildInitCommand}.`, 'yellow')
              exitOnboarding()
            }
            else {
              // EPHEMERAL-branching: stash the picked cert into the carried ref
              // (resolved to the AscDistributionCert the revoke effect needs) +
              // keep the React `certToRevoke` mirror (the create-new effect driver
              // reconstructs the cert object from it). Then run the pure resolver
              // effect to derive next (always → revoking-certificate on a pick),
              // mirroring the BATCH-2 ephemeral-branching mechanism.
              setCertToRevoke(value)
              const certObj = existingCerts.find(c => c.id === value) ?? { id: value, name: '', serialNumber: '', expirationDate: '' }
              iosCarriedRef.current = { ...iosCarriedRef.current, certToRevoke: certObj }
              const current = (await loadProgress(appId)) ?? { platform: 'ios' as const, appId, startedAt: new Date().toISOString(), completedSteps: {} }
              const res = await runIosEffect('cert-limit-prompt', current, { appId, carried: iosCarriedRef.current })
              if (res.next && res.next !== 'cert-limit-prompt')
                setStep(res.next)
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
          onChange={async (value) => {
            if (value === 'delete') {
              // EPHEMERAL-branching: record the confirm into the carried ref +
              // thread the duplicate list (the delete effect reads it). Then run
              // the pure resolver effect to derive next (confirm →
              // deleting-duplicate-profiles), mirroring the BATCH-2 mechanism.
              iosCarriedRef.current = { ...iosCarriedRef.current, confirmDeleteDuplicates: true, duplicateProfiles }
              const current = (await loadProgress(appId)) ?? { platform: 'ios' as const, appId, startedAt: new Date().toISOString(), completedSteps: {} }
              const res = await runIosEffect('duplicate-profile-prompt', current, { appId, carried: iosCarriedRef.current })
              if (res.next && res.next !== 'duplicate-profile-prompt')
                setStep(res.next)
            }
            else {
              // DIVERGE: the bespoke exit escape calls exitOnboarding directly
              // (the engine models it as the resolver's 'error' route; the TUI's
              // user-facing exit sink is exitOnboarding — keep it).
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
              <Text bold>What should we do with {WORKFLOW_PATH}?</Text>
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
      {step === 'ai-analysis-running' && <AiAnalysisRunningStep />}

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

      {/* Error with retry */}
      {step === 'error' && error && (
        <ErrorStep
          error={error}
          recoveryAdvice={recoveryAdvice}
          supportBundlePath={supportBundlePath}
          showRetry={!!retryStep}
          dense={dense}
          collapsed={errorTooTall && errorViewedFull}
          onChange={async (value) => {
            if (value === 'retry') {
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
