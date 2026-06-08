import type { FC } from 'react'
import type { BuildLogger } from '../../../request.js'
import type { GcpProject } from '../gcp-api.js'
import type {
  AndroidOnboardingErrorCategory,
  AndroidOnboardingProgress,
  AndroidOnboardingStep,
  AndroidPackageChoice,
  GcpProjectChoice,
  GoogleSignInComplete,
  KeystoreReady,
  PlayDeveloperAccountChoice,
  PlayInviteProvisioned,
  ServiceAccountProvisioned,
} from '../types.js'
import type { OnboardingResult } from '../../types.js'
import { handleCustomMsg } from '../../../qr.js'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import process from 'node:process'
import { Alert, ProgressBar, Select } from '@inkjs/ui'
import type { DOMElement } from 'ink'
import { Box, measureElement, Newline, Text, useApp, useInput, useStdout } from 'ink'
// src/build/onboarding/android/ui/app.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createSupabaseClient, findBuildCommandForProjectType, findProjectType, findSavedKeySilent, getOrganizationId, getPackageScripts, getPMAndCommand } from '../../../../utils.js'
import { loadSavedCredentials, updateSavedCredentials } from '../../../credentials.js'
import { releaseCapturedLogs, runCapgoAiAnalysis } from '../../../../ai/analyze.js'
import { renderMarkdown } from '../../../../ai/render-markdown.js'
import { trackAiAnalysisChoice, trackAiAnalysisResult } from '../../../../ai/telemetry.js'
import { requestBuildInternal } from '../../../request.js'
import { isAiAnalysisTooTall, resolveAiResultRoute } from '../../ai-fit.js'

// Upper bound on "I fixed it, retry build" attempts after an AI diagnosis.
// Three total attempts (initial + two retries) caps the AI cost when a model
// suggestion doesn't actually fix the failure mode while still giving the user
// a couple of in-wizard chances to iterate.
const MAX_AI_RETRIES = 2
import { createCiSecretEntries, detectCiSecretTargets, getCiSecretRepoLabelAsync, getCiSecretTargetLabel, listExistingCiSecretKeysAsync, uploadCiSecretsAsync } from '../../ci-secrets.js'
import type { CiSecretEntry, CiSecretSetupAdvice, CiSecretTarget } from '../../ci-secrets.js'
import { mapAndroidOnboardingError, mapSaValidationKindToCategory } from '../../error-categories.js'
import { defaultExportPath, exportCredentialsToEnv } from '../../env-export.js'
import { canUseFilePicker, openKeystorePicker, openServiceAccountJsonPicker } from '../../file-picker.js'
import type { BuilderOnboardingAction } from '../../telemetry.js'
import { trackBuilderOnboardingAction, trackBuilderOnboardingStep } from '../../telemetry.js'
import { CompletedStepsLog } from '../../ui/completed-steps-log.js'
import { ANDROID_MIN_ROWS, terminalFitsOnboarding } from '../../min-terminal-size.js'
import { sanitizeBuildLogLines } from '../../build-log.js'
import { TerminalTooSmallPrompt } from '../../ui/min-size-gate.js'
import { BOX_HEADER_ROWS, DiffSummary, Divider, FilteredTextInput, FullscreenAiViewer, FullscreenBuildOutput, FullscreenDiffViewer, Header, isBuildCompleteDismissKey, SecretsTable, SpinnerLine, SuccessLine } from '../../ui/components.js'
import type { AiResultKind } from '../../ui/components.js'
import { logBudgetRows } from '../../ui/frame-fit.js'
import { writeWorkflowFile, WORKFLOW_PATH } from '../../workflow-writer.js'
import type { BuildScriptChoice, PackageManager } from '../../workflow-generator.js'
import type { BuildCredentials } from '../../../../schemas/build.js'
import {
  KeystoreExistingAliasSelectStep,
  KeystoreExistingAliasStep,
  KeystoreExistingDetectingAliasStep,
  KeystoreExistingKeyPasswordStep,
  KeystoreExistingPathStep,
  KeystoreExistingPickerStep,
  KeystoreExistingStorePasswordStep,
  KeystoreExplainerStep,
  KeystoreGeneratingStep,
  KeystoreMethodSelectStep,
  KeystoreNewAliasStep,
  KeystoreNewCommonNameStep,
  KeystoreNewKeyPasswordStep,
  KeystoreNewPasswordMethodStep,
  KeystoreNewStorePasswordStep,
} from '../../ui/steps/android-keystore.js'
import {
  AndroidPackageSelectStep,
  GcpProjectCreateNameStep,
  GcpProjectsLoadingStep,
  GcpProjectsSelectStep,
  GcpSetupRunningStep,
  GoogleSignInLearnMoreStep,
  GoogleSignInRunningStep,
  GoogleSignInStep,
  PlayDeveloperIdActionsStep,
  PlayDeveloperIdInputStep,
  SaJsonExistingPathStep,
  SaJsonExistingPickerStep,
  SaJsonValidatingStep,
  SaJsonValidationFailedStep,
  ServiceAccountMethodSelectStep,
} from '../../ui/steps/android-sa-gcp.js'
import {
  AskBuildStep,
  AskCiSecretsStep,
  CiSecretsFailedStep,
  CiSecretsSetupStep,
  CiSecretsTargetSelectStep,
  ConfirmCiSecretOverwriteStep,
  DetectingCiSecretsStep,
  SavingCredentialsStep,
} from '../../ui/steps/android-ci.js'
import {
  AiAnalysisPromptStep,
  AiAnalysisResultStep,
  AiAnalysisRunningStep,
  BackingUpStep,
  BuildCompleteStep,
  CredentialsExistStep,
  ErrorStep,
  NoPlatformStep,
  WelcomeStep,
} from '../../ui/steps/android-shared.js'
import { findAndroidApplicationIds } from '../gradle-parser.js'
import { listPlayApps, ReportingApiHttpError } from '../reporting-api.js'
import type { PlayApp } from '../reporting-api.js'
import { reconcileAndroidApp } from '../app-verification-android.js'
import type { AndroidReconcileResult } from '../app-verification-android.js'
import { buildRenameWorkspaceFiles, isAndroidStudioRunning, verifyRenamed } from '../android-rename.js'
import { trackEvent } from '../../../../analytics/track.js'
import { validateServiceAccountJson } from '../service-account-validation.js'
import { diffLines } from '../../diff-utils.js'
import type { DiffLine } from '../../diff-utils.js'
import { generateWorkflow, WORKFLOW_PATH as WORKFLOW_GEN_PATH } from '../../workflow-generator.js'
import { getWorkflowDiffTelemetry, trackBuildOnboardingWorkflowEvent } from '../../analytics.js'
import type { BuildOnboardingWorkflowDecision, BuildOnboardingWorkflowEvent, WorkflowDiffTelemetry } from '../../analytics.js'
import { buildScriptPickerOptions, normalizePackageManager } from '../../workflow-ui-helpers.js'
import {
  ANDROIDPUBLISHER_API,
  createServiceAccountKey,
  DEFAULT_SERVICE_ACCOUNT_DESCRIPTION,
  DEFAULT_SERVICE_ACCOUNT_DISPLAY_NAME,
  DEFAULT_SERVICE_ACCOUNT_ID,
  enableService,
  ensureServiceAccount,
  generateProjectId,
  listProjects,
  sanitizeGcpProjectDisplayName,
  createProject as gcpCreateProject,
} from '../gcp-api.js'
import { generateKeystore, generateRandomPassword, listKeystoreAliases, tryUnlockPrivateKey } from '../keystore.js'
import {
  fetchUserInfo,
  GOOGLE_OAUTH_SCOPES_ANDROIDPUBLISHER,
  MissingScopesError,
  refreshAccessToken,
  revokeToken,
  runOAuthFlow,
} from '../oauth-google.js'
import open from 'open'
import {
  fetchCapgoOAuthConfig,
  PLAY_DEV_ID_TUTORIAL_URL,
} from '../oauth-config.js'
import type { CapgoOAuthClientConfig } from '../oauth-config.js'
import {
  CAPGO_SA_APP_PERMISSIONS,
  CAPGO_SA_DEVELOPER_PERMISSIONS,
  extractDeveloperId,
  inviteServiceAccount,
  PLAY_DEVELOPERS_URL,
} from '../play-api.js'
import { deleteAndroidProgress, getAndroidResumeStep, hasAnyOAuthProgress, loadAndroidProgress, saveAndroidProgress } from '../progress.js'
import { ANDROID_STEP_PROGRESS, getAndroidPhaseLabel } from '../types.js'

interface LogEntry { text: string, color?: string }

interface AppProps {
  appId: string
  initialProgress: AndroidOnboardingProgress | null
  androidDir: string
  /** Optional Capgo API key passed via -a/--apikey flag; takes precedence over saved key. */
  apikey?: string
  /** Reports the wizard outcome to the shell when it reaches build-complete, so
   *  the caller prints an accurate post-exit message + durable summary instead of
   *  always claiming success. Never fires on cancel/missing-platform exits. */
  onResult?: (result: OnboardingResult) => void
}

const RELEASE_ALIAS_DEFAULT = 'release'

/** OAuth scopes — superset of `androidpublisher` because we also need
 *  cloud-platform to create GCP projects, service accounts, and keys on the
 *  user's behalf. userinfo.email + openid are for identifying the signed-in
 *  user in the UI. */
const OAUTH_SCOPES_FOR_ONBOARDING = [
  ...GOOGLE_OAUTH_SCOPES_ANDROIDPUBLISHER,
  'https://www.googleapis.com/auth/cloud-platform',
  // OPTIONAL — used by the post-sign-in app-existence verification step to list
  // the user's real Play Store apps (apps:search). A user who declines it on the
  // consent screen STILL completes sign-in: it is deliberately excluded from
  // OAUTH_REQUIRED_SCOPES below so its absence never throws MissingScopesError,
  // and the verification degrades to the plain Gradle picker.
  'https://www.googleapis.com/auth/playdeveloperreporting',
] as const

/**
 * The subset of {@link OAUTH_SCOPES_FOR_ONBOARDING} whose absence must fail
 * sign-in. Excludes the optional `playdeveloperreporting` scope so a user who
 * declines app-listing can still finish onboarding (graceful degradation).
 */
const OAUTH_REQUIRED_SCOPES = [
  ...GOOGLE_OAUTH_SCOPES_ANDROIDPUBLISHER,
  'https://www.googleapis.com/auth/cloud-platform',
] as const

/**
 * Path A (Trapeze rename) orchestration phase. `menu` shows the explicit
 * opt-in offer; the remaining phases drive spinners while the rename runs and
 * the `failed` fallback when it can't be verified (we never claim false
 * success). `await-studio-confirm` is the non-darwin one-time confirm — on
 * macOS we auto-detect + poll instead.
 */
type RenamePhase
  = | 'menu'
    | 'preparing'
    | 'await-studio'
    | 'await-studio-confirm'
    | 'renaming'
    | 'syncing'
    | 'rechecking'
    | 'failed'

function cleanPath(input: string): string {
  let s = input.trim()
  if (s.length >= 2) {
    const first = s[0]
    const last = s[s.length - 1]
    if ((first === '"' && last === '"') || (first === '\'' && last === '\''))
      s = s.slice(1, -1)
  }
  if (s.startsWith('~'))
    s = s.replace(/^~/, homedir())
  s = s.replace(/\\ /g, ' ')
  return s
}

function emptyProgress(appId: string): AndroidOnboardingProgress {
  return {
    platform: 'android',
    appId,
    startedAt: new Date().toISOString(),
    completedSteps: {},
  }
}

const AndroidOnboardingApp: FC<AppProps> = ({ appId, initialProgress, androidDir, apikey, onResult }) => {
  const { exit } = useApp()
  const startStep: AndroidOnboardingStep = getAndroidResumeStep(initialProgress)

  // When there's saved progress AND the resume target isn't trivially 'welcome',
  // land on the resume-prompt fork so the user can see what's saved and decide
  // whether to continue or restart from scratch — instead of being silently
  // teleported to the middle of the wizard with no chance to bail out cleanly.
  // The trivial case (no progress, or resume target is welcome) keeps the
  // existing zero-friction path.
  const [step, setStep] = useState<AndroidOnboardingStep>(
    initialProgress !== null && startStep !== 'welcome'
      ? 'resume-prompt'
      : startStep,
  )

  // Telemetry: resolve org id once + emit per-step events
  const stepTimingRef = useRef<{ step: AndroidOnboardingStep | null, startedAt: number }>({
    step: null,
    startedAt: Date.now(),
  })
  // Buffer of telemetry events that occurred before `resolvedOrgId` landed.
  // Drained in order when the org id becomes available. Without this buffer,
  // any step transitions during the async org-id resolution (which involves
  // two HTTP round-trips: createSupabaseClient + getOrganizationId) would be
  // dropped from the funnel.
  const pendingTelemetryRef = useRef<Array<{
    step: AndroidOnboardingStep
    durationMs?: number
    durationStep?: AndroidOnboardingStep
    errorCategory?: AndroidOnboardingErrorCategory
  }>>([])
  const pendingActionTelemetryRef = useRef<Array<{
    step: AndroidOnboardingStep
    action: BuilderOnboardingAction
    tags?: Record<string, boolean | number | string>
  }>>([])
  const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(null)
  const resolvedApiKeyRef = useRef<string | null>(apikey ?? null)
  const orgIdResolvedRef = useRef(false)
  // Captures the mapped error category at handleError time so the telemetry
  // useEffect can pass it through without re-mapping a reconstructed Error
  // (which would have lost the .phase / instanceof discriminators).
  const errorCategoryRef = useRef<AndroidOnboardingErrorCategory | undefined>(undefined)

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

  const [logLines, setLogLines] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)

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
          platform: 'android',
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
          platform: 'android',
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

    // Steps whose telemetry event carries an `errorCategory` dimension. The
    // generic `'error'` step always has one (set by `handleError`); the
    // SA-import `'sa-json-validation-failed'` step also carries one because
    // the validation effect populates `errorCategoryRef.current` with the
    // mapped `ValidationResult.kind` before transitioning. Funnel analysis
    // in PostHog can split sa-json-validation-failed events by category to
    // see whether failures are "wrong file" vs "SA not invited to app" vs
    // transient network issues.
    const carriesErrorCategory = step === 'error' || step === 'sa-json-validation-failed'
    const eventPayload = {
      step,
      durationMs,
      durationStep,
      errorCategory: carriesErrorCategory ? errorCategoryRef.current : undefined,
    }

    stepTimingRef.current = { step, startedAt: now }

    // (3) Either fire immediately or buffer.
    if (resolvedOrgId) {
      void trackBuilderOnboardingStep({
        apikey: resolvedApiKeyRef.current,
        appId,
        orgId: resolvedOrgId,
        platform: 'android',
        ...eventPayload,
      })
    }
    else {
      pendingTelemetryRef.current.push(eventPayload)
    }
  }, [step, appId, resolvedOrgId, error])

  const trackAction = useCallback(
    (
      action: BuilderOnboardingAction,
      tags?: Record<string, boolean | number | string>,
      actionStep: AndroidOnboardingStep = step,
    ): void => {
      if (!resolvedApiKeyRef.current)
        return

      const payload = { step: actionStep, action, tags }
      if (resolvedOrgId) {
        void trackBuilderOnboardingAction({
          apikey: resolvedApiKeyRef.current,
          appId,
          orgId: resolvedOrgId,
          platform: 'android',
          ...payload,
        })
      }
      else {
        pendingActionTelemetryRef.current.push(payload)
      }
    },
    [appId, resolvedOrgId, step],
  )

  const [retryCount, setRetryCount] = useState(0)
  const [retryStep, setRetryStep] = useState<AndroidOnboardingStep | null>(null)
  const exitRequestedRef = useRef(false)
  const pickerOpenedRef = useRef(false)
  const oauthStartedRef = useRef(false)
  const setupStartedRef = useRef(false)
  const saPickerOpenedRef = useRef(false)
  const validationStartedRef = useRef(false)
  // Cleanup hook for the in-flight SA validation. Invoked by the main
  // useEffect cleanup so a step change / unmount / Ctrl+C aborts the
  // outbound JWT exchange + Play API round trip rather than letting it run
  // detached.
  const validationCleanupRef = useRef<(() => void) | null>(null)
  /**
   * Per-step submission guard for `<Select>` `onChange` callbacks.
   *
   * `@inkjs/ui` v2.0.0 ships a known footgun in `use-select-state.js`: the
   * effect that fires `onChange` lists the `onChange` callback itself in its
   * dependency array AND never resets `state.previousValue` after a selection.
   * Because parent re-renders create a fresh inline arrow each pass, every
   * downstream `setState` after the first selection re-triggers `onChange`,
   * causing duplicate log lines, double persistAndStep writes, and spammed
   * step transitions.
   *
   * This ref is cleared once per step change (see the useEffect below). Any
   * `onChange` handler that performs a one-shot action (logging, persisting,
   * step transition) checks the ref and bails on re-fires.
   *
   * NOTE: handlers that only flip a sub-mode within the same step (e.g.,
   * `setKeystorePathMode('manual')`) intentionally do NOT guard, because those
   * unmount the `<Select>` synchronously and the effect doesn't get a chance
   * to re-fire.
   */
  const selectFiredRef = useRef(false)
  const [keystorePathMode, setKeystorePathMode] = useState<'choose' | 'manual'>('choose')
  const [saJsonPathMode, setSaJsonPathMode] = useState<'choose' | 'manual'>('choose')

  // Phase 1 — keystore
  const [, setKeystoreMethod] = useState<'existing' | 'generate' | null>(
    initialProgress?.keystoreMethod || null,
  )
  const [keystoreExistingPath, setKeystoreExistingPath] = useState(initialProgress?.keystoreExistingPath || '')
  const [keystoreAlias, setKeystoreAlias] = useState(initialProgress?.keystoreAlias || '')
  const [keystoreStorePassword, setKeystoreStorePassword] = useState(initialProgress?.keystoreStorePassword || '')
  const [keystoreKeyPassword, setKeystoreKeyPassword] = useState(initialProgress?.keystoreKeyPassword || '')
  const [keystoreCommonName, setKeystoreCommonName] = useState(initialProgress?.keystoreCommonName || '')
  const [keystoreReady, setKeystoreReady] = useState<KeystoreReady | null>(
    initialProgress?.completedSteps.keystoreReady || null,
  )
  const [keystoreBase64, setKeystoreBase64] = useState(initialProgress?._keystoreBase64 || '')
  const [randomPasswordGenerated, setRandomPasswordGenerated] = useState(false)
  const [detectedAliases, setDetectedAliases] = useState<string[]>([])
  /** Phase 1.5 — key-password auto-skip probe. `null` = haven't decided yet,
   *  `'auto'` = key password resolved without asking (either from progress or
   *  by verifying it matches the store password), `'prompt'` = need to ask
   *  the user (different key password, JKS file we can't parse, etc.) */
  const [keyPasswordProbe, setKeyPasswordProbe] = useState<null | 'auto' | 'prompt'>(null)
  const keyPasswordProbeRef = useRef(false)

  // Phase 2 — Service account method fork
  const [serviceAccountMethod, setServiceAccountMethod] = useState<'existing' | 'generate' | null>(
    initialProgress?.serviceAccountMethod || null,
  )
  const [serviceAccountJsonPath, setServiceAccountJsonPath] = useState(
    initialProgress?.serviceAccountJsonPath || '',
  )
  // Result of the last validation attempt — drives the sa-json-validation-failed UI.
  // Loose typing here to avoid pulling the entire ValidationResult union into the
  // component file; the module owns the discriminated shape.
  const [saValidationResult, setSaValidationResult] = useState<
    null | { ok: true } | { ok: false, kind: 'shape-error' | 'token-error' | 'no-app-access' | 'network-error', message: string }
  >(null)

  // Phase 2b — Google sign-in
  const [, setGoogleSignIn] = useState<GoogleSignInComplete | null>(
    initialProgress?.completedSteps.googleSignInComplete || null,
  )
  const [accessToken, setAccessToken] = useState<string>('')
  const [refreshTokenState, setRefreshTokenState] = useState<string>(initialProgress?._oauthRefreshToken || '')
  const [oauthClientId, setOauthClientId] = useState<string>('')
  const [oauthStatusMessages, setOauthStatusMessages] = useState<string[]>([])
  /** Two-pane toggle on the pre-consent screen: default shows the short
   *  trust headline + scopes; "Learn more" expands the long-form Q&A. */
  const [showOAuthLearnMore, setShowOAuthLearnMore] = useState(false)

  // Phase 3 — Play developer account (user pastes ID or URL)
  const [playAccountChoice, setPlayAccountChoice] = useState<PlayDeveloperAccountChoice | null>(
    initialProgress?.completedSteps.playAccountChosen || null,
  )
  /** Two-screen flow for the dev ID step: 'actions' shows a Select of what
   *  the user can do; 'input' shows the text field to paste the URL / ID. */
  const [playDevIdMode, setPlayDevIdMode] = useState<'actions' | 'input'>('actions')

  // Phase 4 — GCP projects
  const [gcpProjects, setGcpProjects] = useState<GcpProject[]>([])
  const [gcpProjectChoice, setGcpProjectChoice] = useState<GcpProjectChoice | null>(
    initialProgress?.completedSteps.gcpProjectChosen || null,
  )
  const [newProjectDisplayName, setNewProjectDisplayName] = useState<string>(
    initialProgress?.pendingNewProjectDisplayName || '',
  )

  // Phase 4.5 — Android package name (applicationId)
  const [androidPackageChoice, setAndroidPackageChoice] = useState<AndroidPackageChoice | null>(
    initialProgress?.completedSteps.androidPackageChosen || null,
  )
  const [detectedPackageIds, setDetectedPackageIds] = useState<string[]>([])
  const [packageSelectMode, setPackageSelectMode] = useState<'choose' | 'manual'>('choose')
  const packageLoadedRef = useRef(false)

  // ── Phase 4.5 — app-existence verification (generate path only) ──────────────
  // After sign-in we list the user's real Play Store apps and reconcile them
  // against the project's Gradle applicationId. Mirrors the iOS verify-app gate.
  //
  // The Play apps accessible to the signed-in user (apps:search). Picker source
  // for the enriched wrong-build-id / multi-gradle screen + Path B "Back" gate.
  const [verifyPlayApps, setVerifyPlayApps] = useState<PlayApp[]>([])
  // Reconcile outcome once the apps fetch completes. null while loading / on the
  // import path (no fetch) / when verification degraded.
  const [verifyReconcile, setVerifyReconcile] = useState<AndroidReconcileResult | null>(null)
  // True while the initial apps:search fetch is in flight (generate path).
  const [verifyAppLoading, setVerifyAppLoading] = useState(false)
  // True when verification couldn't run on the generate path (reporting scope not
  // granted, apps:search 403, or any network/token error) — we warn and fall
  // through to the plain Gradle picker. NEVER blocks onboarding.
  const [verifyDegraded, setVerifyDegraded] = useState(false)
  // True on the import (custom-SA) path: app existence isn't verified there (it
  // needs Google sign-in) — show a "not verified" banner over the plain picker.
  const [verifyImportSkipped, setVerifyImportSkipped] = useState(false)
  // The Play app the user picked whose packageName != the build id → Path A
  // (rename) target. Set when entering the rename step.
  const [verifyChosenPlayApp, setVerifyChosenPlayApp] = useState<PlayApp | null>(null)
  // Bumped on every verify <Select> action so a Select that stays mounted after a
  // selection remounts with a fresh key — dodges the @inkjs/ui onChange re-fire
  // bug (see the iOS app.tsx gateActionSeq note).
  const [gateActionSeq, setGateActionSeq] = useState(0)
  // Path B (create-app) re-check state. attempt is shown in the gate title +
  // telemetry; askReopen mirrors the iOS ask-before-reopen so a blocked re-check
  // never silently re-launches the browser. rechecking drives the create-app
  // screen's own loader (distinct from the initial android-package-select fetch).
  const [verifyAttempt, setVerifyAttempt] = useState(0)
  const [verifyAskReopen, setVerifyAskReopen] = useState(false)
  const [verifyRechecking, setVerifyRechecking] = useState(false)
  // Path A (Trapeze rename) orchestration. renamePhase drives spinners / the
  // failure fallback; renameOutput carries captured script output for the
  // failed view; renameTmpDirRef holds the temp workspace across the non-darwin
  // "close Android Studio" confirm so doRename can find it after the user OKs.
  const [renamePhase, setRenamePhase] = useState<RenamePhase>('menu')
  const [renameOutput, setRenameOutput] = useState<string[]>([])
  const renameTmpDirRef = useRef<string | null>(null)
  // Generation counter for the verify/rename/create-app async flows. They run
  // from render-scope handlers (not the step effect), so they can't see the
  // effect's `cancelled` flag: each op captures the epoch at entry and bails
  // before its state writes if it moved. Bumped when the step leaves the
  // verify family (see the per-step ref resets) and on unmount, so a stale
  // npm-install / re-check can never write state or advance the wizard.
  const verifyAsyncEpochRef = useRef(0)
  useEffect(() => () => {
    verifyAsyncEpochRef.current++
  }, [])
  // Render-scope async ops (doRename / recheckBuildId) read the Play apps via
  // a ref so a long-running rename never acts on a stale closure snapshot.
  const verifyPlayAppsRef = useRef<PlayApp[]>([])
  useEffect(() => {
    verifyPlayAppsRef.current = verifyPlayApps
  }, [verifyPlayApps])

  // Phase 5 — provisioning status stream
  const [setupStatus, setSetupStatus] = useState<string[]>([])
  const [, setServiceAccountProvisioned] = useState<ServiceAccountProvisioned | null>(
    initialProgress?.completedSteps.serviceAccountProvisioned || null,
  )
  const [, setPlayInviteProvisioned] = useState<PlayInviteProvisioned | null>(
    initialProgress?.completedSteps.playInviteProvisioned || null,
  )
  const [serviceAccountKeyBase64, setServiceAccountKeyBase64] = useState<string>(
    initialProgress?._serviceAccountKeyBase64 || '',
  )

  // Phase 6 — build output
  const [buildUrl, setBuildUrl] = useState('')
  const [buildOutput, setBuildOutput] = useState<string[]>([])
  // ── AI-analysis sub-flow (see iOS sibling for full notes). Entered only when
  // requestBuildInternal returns aiAnalysis.ready=true on a failed build.
  const [aiJobId, setAiJobId] = useState<string | null>(null)
  const [aiAnalysisText, setAiAnalysisText] = useState<string | null>(null)
  // See iOS sibling — non-success outcome banner, mutually exclusive with
  // `aiAnalysisText`. One object so kind + message can't drift.
  const [aiResult, setAiResult] = useState<{ kind: AiResultKind, message: string } | null>(null)
  const [aiRetryCount, setAiRetryCount] = useState(0)
  // See iOS sibling for full notes on aiViewedFull.
  const [aiViewedFull, setAiViewedFull] = useState(false)
  const [ciSecretEntries, setCiSecretEntries] = useState<CiSecretEntry[]>([])
  const [ciSecretTargets, setCiSecretTargets] = useState<CiSecretTarget[]>([])
  const [ciSecretTarget, setCiSecretTarget] = useState<CiSecretTarget | null>(null)
  const [ciSecretSetupAdvice, setCiSecretSetupAdvice] = useState<CiSecretSetupAdvice[]>([])
  const [ciSecretExistingKeys, setCiSecretExistingKeys] = useState<string[]>([])
  // Concrete `owner/repo` for GitHub. Resolved in checking-ci-secrets via
  // `gh repo view`. Shown in confirm-secrets-push so the user knows EXACTLY
  // which repo they're about to mutate before `gh secret set` runs.
  const [ciSecretRepoLabel, setCiSecretRepoLabel] = useState<string | null>(null)
  // Sub-phase text for the spinner while gh shell-outs are in flight — keeps
  // the user informed instead of showing a single static "Checking…" line
  // that freezes for multiple seconds.
  const [ciSecretCheckPhase, setCiSecretCheckPhase] = useState<string>('Resolving GitHub repository…')
  const [ciSecretUploadProgress, setCiSecretUploadProgress] = useState<{ current: number, total: number, key: string } | null>(null)
  // User-chosen package manager (asked at pick-package-manager). Overrides
  // the auto-detected one. Falls back to detection when not set.
  const [selectedPackageManager, setSelectedPackageManager] = useState<PackageManager | null>(null)
  // preview-workflow-file viewer state. The large diff is only shown in the
  // bounded `view-workflow-diff` live Ink screen.
  const [previewDiff, setPreviewDiff] = useState<DiffLine[]>([])
  const [previewExistingPath, setPreviewExistingPath] = useState<string | null>(null)
  const [previewIsNew, setPreviewIsNew] = useState(true)
  const [previewTelemetry, setPreviewTelemetry] = useState<WorkflowDiffTelemetry | null>(null)
  const [ciSecretError, setCiSecretError] = useState<string | null>(null)
  const [ciSecretUploadSummary, setCiSecretUploadSummary] = useState<string | null>(null)

  // Terminal dimensions in state so the wizard re-renders on resize (see iOS
  // sibling — needed for the AI fit check to re-route inline → scroll viewer
  // when the user shrinks the terminal).
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

  // Body heights cached per (step, cols) → adaptive box/compact/too-small,
  // decided SYNCHRONOUSLY so a vertical resize doesn't flash. A body's row
  // height depends on step/content/WIDTH, not terminal height; caching the
  // comfortable height lets a height-resize reuse it and pick the right form on
  // the first frame, instead of the old reset→measure→flip round-trip per
  // resize tick. See iOS sibling for the full rationale.
  const bodyRef = useRef<DOMElement | null>(null)
  const [bodyHeights, setBodyHeights] = useState<{ key: string, comfortable: number | null }>(
    { key: '', comfortable: null },
  )
  const fitKey = `${step}|${terminalCols}`
  const heights = bodyHeights.key === fitKey ? bodyHeights : { key: fitKey, comfortable: null }

  // Always render the comfortable form. The startup size gate (MinSizeGate)
  // guarantees the terminal is large enough, so the adaptive dense fallback is
  // unreachable. The dense branches in the step components are now dead, and the
  // measure machinery below only feeds the completed-steps log budget.
  useEffect(() => {
    if (!bodyRef.current)
      return
    const { height } = measureElement(bodyRef.current)
    if (height <= 0)
      return
    setBodyHeights((prev) => {
      if (prev.key === fitKey && prev.comfortable === height)
        return prev
      return { key: fitKey, comfortable: height }
    })
  })

  const bodyHeight = heights.comfortable

  // Rows for the completed-steps log (rendered OUTSIDE the measured body so its
  // growth never inflates the fit decision). It fills what the current step
  // leaves; capLogRows packs recent entries + a summary. See iOS sibling. The
  // header is always boxed (the size gate guarantees room).
  const logHeaderRows = BOX_HEADER_ROWS
  const logMaxRows = bodyHeight != null
    ? logBudgetRows(terminalRows, logHeaderRows, bodyHeight)
    : Number.POSITIVE_INFINITY
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
  const [savedCredentials, setSavedCredentials] = useState<Partial<BuildCredentials> | null>(null)
  const pm = getPMAndCommand()

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
      platform: 'android',
      apikey,
      packageManager: selectedPackageManager ?? normalizePackageManager(pm.pm),
      buildScriptType: buildScriptChoice?.type,
      decision: options.decision,
      ...telemetry,
    })
  }

  // Best-effort PostHog telemetry for the Android app-verify step. Mirrors the
  // iOS sibling's trackVerifyEvent (channel 'bundle') and ALWAYS sets `step` —
  // the Builder dashboard filters null steps out of funnels (JSONExtractString),
  // so an unset step silently drops the event. Never blocks or throws.
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
      tags: { step: 'android-app-verify', platform: 'android', ...tags },
    })
  }, [appId, apikey, resolvedOrgId])

  // Convenience wrapper for the "Picked" event: derives matches_play_app from the
  // listed Play apps so every pick site stays a one-liner.
  const trackVerifyPicked = useCallback(
    (pkg: string, source: 'gradle' | 'play-app' | 'manual') => {
      trackVerifyEvent('Android App Verify Picked', '👆', {
        matches_play_app: verifyPlayApps.some(a => a.packageName === pkg),
        source,
      })
    },
    [trackVerifyEvent, verifyPlayApps],
  )

  const addLog = useCallback((text: string, color = 'green') => {
    setLogLines((prev) => {
      // Drop a consecutive duplicate: completed-step breadcrumbs are idempotent
      // ("✔ GCP project — X" means the same thing however many times the
      // hydration replay or a re-render fires it), so the same line twice in a
      // row is always spam, never information. Guards against the log filling
      // with repeats if an effect re-runs.
      const last = prev[prev.length - 1]
      if (last && last.text === text && last.color === color)
        return prev
      return [...prev, { text, color }]
    })
  }, [])

  const addSetupStatus = useCallback((text: string) => {
    setSetupStatus(prev => [...prev, text])
  }, [])

  const exitOnboarding = useCallback((message?: string) => {
    if (exitRequestedRef.current)
      return
    exitRequestedRef.current = true
    if (message)
      addLog(message, 'yellow')
    setTimeout(() => exit(), 50)
  }, [addLog, exit])

  useInput((input, key) => {
    if (key.ctrl && input === 'c')
      process.kill(process.pid, 'SIGINT')

    // build-complete is the terminal success screen; it deliberately does not
    // auto-exit (that would wipe the frame on the alt-screen before it can be
    // read). Dismiss on Enter/Esc/q so it lasts until the user is ready.
    if (step === 'build-complete' && isBuildCompleteDismissKey(input, key)) {
      exit()
      return
    }

    // preview-workflow-file: Esc skips. Arrows/Enter go to the Select.
    if (step === 'preview-workflow-file' && key.escape) {
      trackWorkflowEvent('workflow-preview-action', { decision: 'escape' })
      setPreviewDiff([])
      setStep('build-complete')
    }
  })

  const persist = useCallback(
    async (updater: (p: AndroidOnboardingProgress) => AndroidOnboardingProgress) => {
      const existing = (await loadAndroidProgress(appId)) || emptyProgress(appId)
      const next = updater(existing)
      await saveAndroidProgress(appId, next)
    },
    [appId],
  )

  /**
   * Persist a progress update AND transition to the next step, in that order.
   *
   * Replaces the racy `void persist(...) ; setStep(next)` pattern. The old
   * pattern issued the persist fire-and-forget, then synchronously called
   * setStep. The next step's onSubmit handler could then issue its own
   * persist, read the on-disk progress BEFORE the first persist had written,
   * and clobber the just-typed field when it saved.
   *
   * `persistAndStep` awaits the disk write before advancing, which serializes
   * consecutive persists by gating each step transition on the previous
   * write completing. Side effect: the step transition happens after one
   * IO round-trip (~few ms) rather than immediately. Worth it.
   */
  // Forward-reference indirection. `handleError` is declared below this point
  // because it uses `retryCount` (declared earlier). `persistAndStep` needs to
  // call it from a catch handler; threading it through a ref lets us avoid a
  // useCallback dep churn (handleError changes every time retryCount does).
  const handleErrorRef = useRef<((err: unknown, failedStep: AndroidOnboardingStep) => void) | null>(null)

  const persistAndStep = useCallback(
    (
      updater: (p: AndroidOnboardingProgress) => AndroidOnboardingProgress,
      nextStep: AndroidOnboardingStep,
    ): void => {
      ;(async () => {
        try {
          await persist(updater)
          setStep(nextStep)
        }
        catch (err) {
          // saveAndroidProgress failures (disk full, permission, etc.) used to
          // become unhandled rejections and stall the UI silently. Route them
          // through the same retry/error UX as inline await failures. The
          // failedStep is `nextStep` because we never advanced — on resume,
          // getAndroidResumeStep recomputes from progress.json anyway.
          handleErrorRef.current?.(err, nextStep)
        }
      })()
    },
    [persist],
  )

  // Re-emit the breadcrumb entries the user "earned" before this session — the
  // partial keystore inputs (path / alias / store + key password) and the
  // completed-phase markers (sign-in, Play account, GCP project, package, SA).
  // Wrapped in a useCallback so both the mount-time path AND the resume-prompt
  // "Continue" handler can call it. We DON'T want this firing while the user is
  // still on the resume-prompt screen — the side log would fill with stale
  // entries BEFORE the user has chosen Continue vs Restart, and picking Restart
  // would leave those entries dangling next to a fresh wizard. addLog's
  // consecutive-dedupe protects against accidental double calls.
  const hydrateCompletedLog = useCallback(() => {
    if (!initialProgress)
      return
    const { completedSteps } = initialProgress
    // Where will the resume logic actually drop the user? We compare each
    // phase against this so a partially-completed phase (marker set, but
    // a top-level ephemeral field missing) isn't logged as "✔ ready" when
    // we're actually about to re-prompt for one of its inputs.
    const resumeStep = getAndroidResumeStep(initialProgress)
    const keystorePhaseSteps = new Set<AndroidOnboardingStep>([
      'keystore-method-select',
      'keystore-explainer',
      'keystore-existing-path',
      'keystore-existing-picker',
      'keystore-existing-store-password',
      'keystore-existing-detecting-alias',
      'keystore-existing-alias-select',
      'keystore-existing-alias',
      'keystore-existing-key-password',
      'keystore-new-alias',
      'keystore-new-password-method',
      'keystore-new-store-password',
      'keystore-new-key-password',
      'keystore-new-cn',
      'keystore-generating',
    ])
    const inKeystorePhase = keystorePhaseSteps.has(resumeStep)

    // Keystore phase: if we're routing back into it, show partial-input
    // breadcrumbs for every field already in progress (path / alias /
    // store password / key password) instead of a misleading
    // "✔ Keystore ready". Otherwise show the full ready line.
    if (inKeystorePhase) {
      if (initialProgress.keystoreExistingPath)
        addLog(`✔ Keystore selected · ${initialProgress.keystoreExistingPath}`)
      if (initialProgress.keystoreAlias)
        addLog(`✔ Key alias · ${initialProgress.keystoreAlias}`)
      if (initialProgress.keystoreStorePassword)
        addLog('✔ Store password set')
      if (initialProgress.keystoreKeyPassword)
        addLog('✔ Key password set')
      addLog('↺ Re-confirming a missing keystore input', 'yellow')
    }
    else if (completedSteps.keystoreReady) {
      addLog(`✔ Keystore ready — ${completedSteps.keystoreReady.keystorePath}`)
    }

    if (completedSteps.googleSignInComplete && resumeStep !== 'google-sign-in')
      addLog(`✔ Signed in as ${completedSteps.googleSignInComplete.email}`)
    if (completedSteps.playAccountChosen)
      addLog(`✔ Play Developer account — ${completedSteps.playAccountChosen.displayName || completedSteps.playAccountChosen.developerId}`)
    if (completedSteps.gcpProjectChosen)
      addLog(`✔ GCP project — ${completedSteps.gcpProjectChosen.displayName}`)
    if (completedSteps.androidPackageChosen)
      addLog(`✔ Android package — ${completedSteps.androidPackageChosen.packageName}`)
    if (completedSteps.serviceAccountProvisioned)
      addLog(`✔ Service account — ${completedSteps.serviceAccountProvisioned.email}`)
    if (completedSteps.playInviteProvisioned)
      addLog(`✔ Service account invited to Play Console`)
  }, [initialProgress, addLog])

  // Mount-time hydration. Suppressed when the initial step is the resume-prompt
  // fork — that path defers hydration to the user's explicit Continue choice
  // (see the resume-prompt onChange below). The trivial-progress paths
  // (welcome / no progress) still hydrate here so any partial input the user
  // had keeps its breadcrumb.
  const skipMountHydrationRef = useRef(step === 'resume-prompt')
  useEffect(() => {
    if (skipMountHydrationRef.current)
      return
    hydrateCompletedLog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Reset everything for a fresh-start onboarding pass. Called from the
   * resume-prompt restart handler (mount-time "start over" branch).
   *
   * Wipes the on-disk progress file AND every piece of in-memory state that
   * could otherwise leak across into the next attempt (keystore inputs +
   * outputs, the service-account fork choice and imported JSON path, OAuth
   * tokens, the chosen Play account / GCP project / Android package, and the
   * provisioning outputs). Does NOT addLog or setStep — the caller picks the
   * user-facing message and the next step.
   */
  const resetForFreshStart = useCallback(async () => {
    await deleteAndroidProgress(appId).catch(() => { /* best-effort */ })
    // Phase 1 — keystore inputs + outputs
    setKeystoreMethod(null)
    setKeystorePathMode('choose')
    setKeystoreExistingPath('')
    setKeystoreAlias('')
    setKeystoreStorePassword('')
    setKeystoreKeyPassword('')
    setKeystoreCommonName('')
    setKeystoreReady(null)
    setKeystoreBase64('')
    setRandomPasswordGenerated(false)
    setDetectedAliases([])
    setKeyPasswordProbe(null)
    keyPasswordProbeRef.current = false
    // Phase 2 — service-account fork
    setServiceAccountMethod(null)
    setSaJsonPathMode('choose')
    setServiceAccountJsonPath('')
    setSaValidationResult(null)
    // Phase 2b — Google sign-in / OAuth
    setGoogleSignIn(null)
    setAccessToken('')
    setRefreshTokenState('')
    setOauthClientId('')
    setOauthStatusMessages([])
    setShowOAuthLearnMore(false)
    // Phase 3 — Play developer account
    setPlayAccountChoice(null)
    setPlayDevIdMode('actions')
    // Phase 4 — GCP project
    setGcpProjects([])
    setGcpProjectChoice(null)
    setNewProjectDisplayName('')
    // Phase 4.5 — Android package + app-existence verification
    setAndroidPackageChoice(null)
    setDetectedPackageIds([])
    setPackageSelectMode('choose')
    packageLoadedRef.current = false
    setVerifyPlayApps([])
    setVerifyReconcile(null)
    setVerifyAppLoading(false)
    setVerifyDegraded(false)
    setVerifyImportSkipped(false)
    setVerifyChosenPlayApp(null)
    setGateActionSeq(0)
    setVerifyAttempt(0)
    setVerifyAskReopen(false)
    setVerifyRechecking(false)
    setRenamePhase('menu')
    setRenameOutput([])
    renameTmpDirRef.current = null
    // Phase 5 — provisioning outputs
    setServiceAccountProvisioned(null)
    setPlayInviteProvisioned(null)
    setServiceAccountKeyBase64('')
  }, [appId])

  const handleError = useCallback(
    (err: unknown, failedStep: AndroidOnboardingStep) => {
      // Capture the mapped category BEFORE we collapse err to a string.
      // The telemetry useEffect will read this ref instead of re-mapping a
      // reconstructed `new Error(message)` (which has no discriminators).
      errorCategoryRef.current = mapAndroidOnboardingError(err)
      const message = err instanceof Error ? err.message : String(err)
      if (retryCount === 0) {
        setError(message)
        setRetryStep(failedStep)
        setRetryCount(1)
        setStep('error')
      }
      else {
        addLog(`✖ ${message}`, 'red')
        addLog('Run `capgo build init --platform android` to resume.', 'yellow')
        setTimeout(() => exitOnboarding(), 100)
      }
    },
    [retryCount, addLog, exitOnboarding],
  )

  // Wire the forward-declared ref so `persistAndStep`'s catch can surface
  // saveAndroidProgress failures through the same retry/error UX without
  // making `handleError` a useCallback dep (it changes every retryCount tick).
  useEffect(() => {
    handleErrorRef.current = handleError
  }, [handleError])

  /**
   * Capgo OAuth client config — fetched once from the backend and cached
   * in a ref so we don't refetch across renders. Throws if Capgo's backend
   * has Google OAuth disabled (the `enabled: false` branch).
   */
  const capgoConfigRef = useRef<CapgoOAuthClientConfig | null>(null)
  const getCapgoConfig = useCallback(async (): Promise<CapgoOAuthClientConfig> => {
    if (capgoConfigRef.current)
      return capgoConfigRef.current
    const cfg = await fetchCapgoOAuthConfig()
    if (!cfg)
      throw new Error('Capgo Android onboarding is not configured server-side. Use the manual setup at https://capgo.app/docs/cli/cloud-build/android.')
    capgoConfigRef.current = cfg
    return cfg
  }, [])

  /**
   * Mint a fresh access token from the stored refresh token when resuming.
   * Called lazily before any GCP / Play API call that needs auth.
   */
  const ensureAccessToken = useCallback(async (): Promise<string> => {
    if (accessToken)
      return accessToken
    if (!refreshTokenState)
      throw new Error('Not signed in — re-run onboarding to re-authenticate.')
    const cfg = await getCapgoConfig()
    const refreshed = await refreshAccessToken({
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      scopes: OAUTH_SCOPES_FOR_ONBOARDING,
    }, refreshTokenState)
    setAccessToken(refreshed.accessToken)
    if (!oauthClientId)
      setOauthClientId(cfg.clientId)
    return refreshed.accessToken
  }, [accessToken, refreshTokenState, oauthClientId, getCapgoConfig])

  async function doSaveCredentials(): Promise<Parameters<typeof updateSavedCredentials>[2]> {
    if (!keystoreReady || !keystoreBase64)
      throw new Error('keystore not ready')
    if (!serviceAccountKeyBase64)
      throw new Error('service-account key not provisioned')
    if (!keystoreStorePassword || !keystoreAlias)
      throw new Error('keystore inputs missing')

    const credentials = {
      ANDROID_KEYSTORE_FILE: keystoreBase64,
      KEYSTORE_KEY_ALIAS: keystoreAlias,
      KEYSTORE_STORE_PASSWORD: keystoreStorePassword,
      KEYSTORE_KEY_PASSWORD: keystoreKeyPassword || keystoreStorePassword,
      PLAY_CONFIG_JSON: serviceAccountKeyBase64,
    } as Parameters<typeof updateSavedCredentials>[2]

    await updateSavedCredentials(appId, 'android', credentials)
    await deleteAndroidProgress(appId)
    addLog('✔ Credentials saved')
    return credentials
  }

  // Commit the chosen Android package and advance to whatever the package-select
  // step flows into today (import → sa-json picker, generate → GCP provisioning).
  // Shared by the plain Gradle picker, the enriched verify picker, and the
  // exact-match auto-confirm so the persist+advance contract stays in one place.
  const pickAndroidPackageAndAdvance = useCallback(
    (packageName: string, source: AndroidPackageChoice['source']): void => {
      const choice: AndroidPackageChoice = { packageName, source }
      setAndroidPackageChoice(choice)
      addLog(`✔ Android package — ${packageName}`)
      const nextStep: AndroidOnboardingStep
        = serviceAccountMethod === 'existing' ? 'sa-json-existing-path' : 'gcp-setup-running'
      persistAndStep(
        (p) => ({
          ...p,
          completedSteps: { ...p.completedSteps, androidPackageChosen: choice },
        }),
        nextStep,
      )
    },
    [serviceAccountMethod, addLog, persistAndStep],
  )

  useEffect(() => {
    let cancelled = false

    if (step === 'welcome') {
      setTimeout(() => {
        if (cancelled)
          return
        if (!existsSync(join(process.cwd(), androidDir))) {
          setStep('no-platform')
          return
        }
        ;(async () => {
          const existing = await loadSavedCredentials(appId)
          if (cancelled)
            return
          // NB: do NOT gate this on `!initialProgress`. The welcome step is
          // only reached via the trivial-welcome resume case or the
          // resume-prompt Restart handler — never during an actual resume
          // (that routes resume-prompt → startStep directly). Gating on the
          // stale, still-non-null `initialProgress` prop would send a Restart
          // straight to keystore-method-select and silently overwrite existing
          // saved credentials without offering the backup flow. Mirror iOS
          // (cli/src/build/onboarding/ui/app.tsx) and check creds only.
          if (existing?.android)
            setStep('credentials-exist')
          else
            setStep('keystore-method-select')
        })()
      }, 800)
    }

    if (step === 'no-platform') {
      setTimeout(() => { if (!cancelled) exit() }, 2000)
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
        catch {
          if (cancelled)
            return
          addLog('⚠ Could not backup credentials (file may not exist yet)', 'yellow')
        }
        setStep('keystore-method-select')
      })()
    }

    if (step !== 'keystore-existing-picker')
      pickerOpenedRef.current = false
    if (step !== 'google-sign-in-running')
      oauthStartedRef.current = false
    if (step !== 'gcp-setup-running')
      setupStartedRef.current = false
    if (step !== 'sa-json-existing-picker')
      saPickerOpenedRef.current = false
    if (step !== 'sa-json-validating')
      validationStartedRef.current = false
    // Returning to the package picker (Path A "Back", Path B routes back) must
    // re-detect Gradle ids + re-fetch Play apps — a failed/partial rename may
    // have changed build.gradle since the first visit.
    if (step !== 'android-package-select')
      packageLoadedRef.current = false
    // Leaving the verify family invalidates its in-flight render-scope async
    // ops (they check this epoch before their state writes — see
    // `verifyAsyncEpochRef`).
    if (step !== 'android-package-select' && step !== 'android-app-verify-rename' && step !== 'android-app-verify-create-app')
      verifyAsyncEpochRef.current++
    // Reset the @inkjs/ui Select re-fire guard on every step transition so each
    // new step gets a clean slate. See the JSDoc on `selectFiredRef`.
    selectFiredRef.current = false

    if (step === 'keystore-existing-picker' && !pickerOpenedRef.current) {
      pickerOpenedRef.current = true
      ;(async () => {
        try {
          const selected = await openKeystorePicker()
          if (cancelled)
            return
          if (!selected) {
            setStep('keystore-existing-path')
            return
          }
          setKeystoreExistingPath(selected)
          await persist((p) => ({ ...p, keystoreExistingPath: selected }))
          addLog(`✔ Keystore selected · ${selected}`)
          setStep('keystore-existing-store-password')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'keystore-existing-path')
        }
      })()
    }

    if (step === 'sa-json-existing-picker' && !saPickerOpenedRef.current) {
      saPickerOpenedRef.current = true
      ;(async () => {
        try {
          const selected = await openServiceAccountJsonPicker()
          if (cancelled)
            return
          if (!selected) {
            // Cancelled — fall back to manual input. Reset the chooser screen
            // so we don't loop back into picker mode immediately.
            setSaJsonPathMode('manual')
            setStep('sa-json-existing-path')
            return
          }
          setServiceAccountJsonPath(selected)
          await persist((p) => ({ ...p, serviceAccountJsonPath: selected }))
          addLog(`✔ Service account JSON · ${selected}`)
          setStep('sa-json-validating')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'sa-json-existing-path')
        }
      })()
    }

    if (step === 'sa-json-validating' && !validationStartedRef.current) {
      validationStartedRef.current = true
      // Bound the network round trips to the lifetime of this step. If the
      // user Ctrl+C's, picks a different file, or unmounts the component
      // mid-flight, the cleanup at the bottom of this effect aborts the
      // controller and the in-flight fetch/JWT exchange unwinds promptly.
      const validationAbort = new AbortController()
      validationCleanupRef.current = () => validationAbort.abort()
      ;(async () => {
        try {
          if (!serviceAccountJsonPath)
            throw new Error('No service account JSON path on record — pick the file again.')
          if (!androidPackageChoice)
            throw new Error('No Android package on record — pick the package again.')

          const jsonBytes = await readFile(serviceAccountJsonPath)
          if (cancelled)
            return

          const result = await validateServiceAccountJson({
            jsonBytes,
            packageName: androidPackageChoice.packageName,
            signal: validationAbort.signal,
          })
          if (cancelled)
            return

          if (result.ok) {
            const base64 = jsonBytes.toString('base64')
            setServiceAccountKeyBase64(base64)
            setSaValidationResult({ ok: true })
            trackAction('android_sa_validation_result', { result: 'success' }, 'sa-json-validating')
            await persist((p) => ({
              ...p,
              _serviceAccountKeyBase64: base64,
              // Clear any stale "skipped" flag from a previous attempt.
              serviceAccountValidationSkipped: false,
            }))
            addLog(`✔ Service account verified — ${result.serviceAccountEmail}`)
            setStep('saving-credentials')
            return
          }

          setSaValidationResult(result)
          trackAction('android_sa_validation_result', {
            result: 'failure',
            validation_kind: result.kind,
          }, 'sa-json-validating')
          // Emit the immediate action event above, and stash the validation
          // kind so the upcoming `sa-json-validation-failed` step event also
          // carries the same failure category.
          errorCategoryRef.current = mapSaValidationKindToCategory(result.kind)
          // shape-error indicates the file itself is wrong — surface as a
          // banner log and route to the same recovery screen so the user
          // can pick a different file or fall back to OAuth. Other kinds
          // (token, no-app-access, network) already get full text on the
          // recovery screen.
          if (result.kind === 'shape-error')
            addLog(`✖ ${result.message}`, 'red')
          setStep('sa-json-validation-failed')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'sa-json-existing-path')
        }
      })()
    }

    if (step === 'keystore-existing-detecting-alias') {
      ;(async () => {
        try {
          const bytes = await readFile(keystoreExistingPath)
          if (cancelled)
            return
          const listed = listKeystoreAliases(bytes, keystoreStorePassword)
          if (cancelled)
            return
          if (listed.ok && listed.aliases.length === 1) {
            const alias = listed.aliases[0]
            setKeystoreAlias(alias)
            await persist((p) => ({ ...p, keystoreAlias: alias }))
            addLog(`✔ Detected alias · ${alias}`)
            setStep('keystore-existing-key-password')
            return
          }
          if (listed.ok && listed.aliases.length > 1) {
            setDetectedAliases(listed.aliases)
            setStep('keystore-existing-alias-select')
            return
          }
          if (!listed.ok && listed.reason === 'wrong-password') {
            setError('Store password was rejected by the keystore. Try again.')
            setRetryStep('keystore-existing-store-password')
            setStep('error')
            return
          }
          if (!listed.ok && listed.reason === 'unsupported-format')
            addLog('ℹ Couldn\'t auto-detect alias (JKS format or similar) — enter it manually.', 'yellow')
          else if (listed.ok)
            addLog('ℹ Couldn\'t auto-detect alias from the keystore — enter it manually.', 'yellow')
          setStep('keystore-existing-alias')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'keystore-existing-path')
        }
      })()
    }

    // Reset the key-password probe whenever the user leaves the step.
    if (step !== 'keystore-existing-key-password') {
      keyPasswordProbeRef.current = false
      if (keyPasswordProbe !== null)
        setKeyPasswordProbe(null)
    }

    if (step === 'keystore-existing-key-password' && !keyPasswordProbeRef.current) {
      keyPasswordProbeRef.current = true
      ;(async () => {
        // Two ways to auto-resolve key password without asking:
        //   1. Resume: we already have keystoreKeyPassword from progress.
        //   2. PKCS#12 probe: the store password also unlocks the private
        //      key bag (true for ~all keystores that use one password for
        //      both, including everything Capgo generates).
        // Either way, fall through into the same readFile + persist +
        // advance flow the prompt's onSubmit would run, no UI needed.
        let resolvedKeyPw: string | null = null
        let resolution: 'progress' | 'probed-same' | null = null

        if (keystoreKeyPassword) {
          resolvedKeyPw = keystoreKeyPassword
          resolution = 'progress'
        }
        else if (keystoreStorePassword && keystoreExistingPath) {
          try {
            const bytes = await readFile(keystoreExistingPath)
            const result = tryUnlockPrivateKey(bytes, keystoreStorePassword)
            if (result.ok) {
              resolvedKeyPw = keystoreStorePassword
              resolution = 'probed-same'
            }
          }
          catch {
            // readFile failed — let the prompt step handle the error path.
          }
        }

        if (cancelled)
          return

        if (!resolvedKeyPw) {
          setKeyPasswordProbe('prompt')
          return
        }

        // Auto-resolved — log what happened and run the same complete-the
        // -keystore-phase work the prompt's onSubmit handler does.
        setKeyPasswordProbe('auto')
        if (resolution === 'probed-same')
          addLog('ℹ Key password matches store password — using the same value')
        const keyPw = resolvedKeyPw
        setKeystoreKeyPassword(keyPw)
        addLog('✔ Key password set')
        try {
          const bytes = await readFile(keystoreExistingPath)
          if (cancelled)
            return
          const base64 = bytes.toString('base64')
          const ready: KeystoreReady = {
            keystorePath: keystoreExistingPath,
            alias: keystoreAlias || RELEASE_ALIAS_DEFAULT,
            isGenerated: false,
          }
          setKeystoreBase64(base64)
          setKeystoreReady(ready)
          await persist((p) => ({
            ...p,
            keystoreKeyPassword: keyPw,
            _keystoreBase64: base64,
            serviceAccountForkSeen: true,
            completedSteps: { ...p.completedSteps, keystoreReady: ready },
          }))
          addLog(`✔ Keystore loaded — ${keystoreExistingPath}`)
          // Smart-route: skip phases already complete (e.g. on resume into
          // this step after a legacy progress file already had OAuth steps
          // done). If progress shows nothing past keystoreReady, land on the
          // new fork; otherwise pick up where we left off (resume contract:
          // legacy progress without `serviceAccountMethod` defaults to OAuth
          // via `getAndroidResumeStep`).
          const fresh = await loadAndroidProgress(appId)
          if (cancelled)
            return
          const hasOAuthProgress = fresh ? hasAnyOAuthProgress(fresh) : false
          if (hasOAuthProgress || fresh?.serviceAccountMethod !== undefined)
            setStep(fresh ? getAndroidResumeStep(fresh) : 'service-account-method-select')
          else
            setStep('service-account-method-select')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'keystore-existing-path')
        }
      })()
    }

    if (step === 'keystore-generating') {
      ;(async () => {
        try {
          const storePw = keystoreStorePassword
          const keyPw = keystoreKeyPassword || storePw
          const cn = keystoreCommonName || appId
          const result = generateKeystore({
            alias: keystoreAlias || RELEASE_ALIAS_DEFAULT,
            storePassword: storePw,
            keyPassword: keyPw,
            dname: { commonName: cn, organizationName: 'Capgo' },
          })
          if (cancelled)
            return
          const defaultPath = `android/app/${result.alias}.p12`
          const ready: KeystoreReady = {
            keystorePath: defaultPath,
            alias: result.alias,
            isGenerated: true,
          }
          setKeystoreBase64(result.p12Base64)
          setKeystoreReady(ready)
          await persist((p) => ({
            ...p,
            keystoreMethod: 'generate',
            keystoreAlias: result.alias,
            keystoreStorePassword: storePw,
            keystoreKeyPassword: keyPw,
            keystoreCommonName: cn,
            _keystoreBase64: result.p12Base64,
            serviceAccountForkSeen: true,
            completedSteps: { ...p.completedSteps, keystoreReady: ready },
          }))
          addLog(`✔ Keystore generated — alias: ${result.alias}, valid until ${result.notAfter.getFullYear()}`)
          // Backup hint is emitted after `saving-credentials` succeeds, not
          // here — at this point the password lives only in the in-memory
          // state and the progress file, not in `credentials.json`.
          setRetryCount(0)
          // After keystore is freshly generated in THIS run, always land on
          // the new method-select fork — we know there's no prior SA choice
          // because we just finished the keystore phase. Resume mid-flow on
          // a subsequent run goes through `getAndroidResumeStep`, which
          // routes legacy progress (absent `serviceAccountMethod`) to the
          // OAuth path for backward compatibility.
          if (cancelled)
            return
          setStep('service-account-method-select')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'keystore-generating')
        }
      })()
    }

    if (step === 'google-sign-in-running' && !oauthStartedRef.current) {
      oauthStartedRef.current = true
      ;(async () => {
        try {
          const cfg = await getCapgoConfig()
          setOauthClientId(cfg.clientId)

          setOauthStatusMessages([])
          const tokens = await runOAuthFlow(
            {
              clientId: cfg.clientId,
              clientSecret: cfg.clientSecret,
              scopes: OAUTH_SCOPES_FOR_ONBOARDING,
              // playdeveloperreporting is optional — declining it must NOT fail
              // sign-in (the app-verify step degrades gracefully without it).
              requiredScopes: OAUTH_REQUIRED_SCOPES,
            },
            {
              onAuthUrl: (url) => {
                if (cancelled)
                  return
                setOauthStatusMessages(prev => [...prev, `🌐 If the browser didn't open: ${url}`])
              },
              onStatus: (msg) => {
                if (cancelled)
                  return
                setOauthStatusMessages(prev => [...prev, msg])
              },
            },
          )
          if (cancelled)
            return
          if (!tokens.refreshToken)
            throw new Error('Google did not return a refresh token — try again.')

          const info = await fetchUserInfo(tokens.accessToken)
          if (cancelled)
            return

          const complete: GoogleSignInComplete = {
            email: info.email,
            googleSubject: info.sub,
            scope: tokens.scope,
          }
          setAccessToken(tokens.accessToken)
          setRefreshTokenState(tokens.refreshToken)
          setGoogleSignIn(complete)
          await persist((p) => ({
            ...p,
            _oauthRefreshToken: tokens.refreshToken,
            completedSteps: { ...p.completedSteps, googleSignInComplete: complete },
          }))
          addLog(`✔ Signed in as ${info.email}`)
          setRetryCount(0)
          setStep('play-developer-id-input')
        }
        catch (err) {
          if (cancelled)
            return
          // User deselected one or more scopes on the consent screen.
          // Treat this as a recoverable input error: explain in the CLI
          // which scopes were missing and route back to the pre-consent
          // screen so the user can try again. Don't burn a retry strike.
          if (err instanceof MissingScopesError) {
            addLog('✖ Sign-in did not grant all required permissions.', 'red')
            for (const scope of err.missing)
              addLog(`  • Missing: ${scope}`, 'yellow')
            addLog('Please retry sign-in and leave every requested permission checked.', 'yellow')
            setStep('google-sign-in')
            return
          }
          handleError(err, 'google-sign-in')
        }
      })()
    }

    // Reset the dev-ID step's sub-screen whenever we leave and come back
    // (e.g. after a retry from the error screen).
    if (step !== 'play-developer-id-input' && playDevIdMode === 'input')
      setPlayDevIdMode('actions')

    if (step === 'android-package-select' && !packageLoadedRef.current) {
      packageLoadedRef.current = true
      ;(async () => {
        const gradleIds = await findAndroidApplicationIds(androidDir)
        if (cancelled)
          return
        setDetectedPackageIds(gradleIds)

        // Import (custom-SA) path: app existence isn't verified here — it needs
        // Google sign-in, which the import flow never performs. Skip the fetch
        // and flag the "not verified" banner over today's Gradle-only picker.
        if (serviceAccountMethod !== 'generate') {
          setVerifyImportSkipped(true)
          trackVerifyEvent('Android App Verify Result', '🔎', {
            result: 'skipped-import',
            app_count: 0,
            gradle_id_count: gradleIds.length,
          })
          return
        }

        // Generate path: list the user's real Play apps (apps:search) and
        // reconcile them against the Gradle applicationId. ANY failure degrades
        // gracefully to the plain Gradle picker — verification NEVER blocks
        // onboarding (the reporting scope is optional; see OAUTH_REQUIRED_SCOPES).
        setVerifyAppLoading(true)
        try {
          const token = await ensureAccessToken()
          const apps = await listPlayApps(token)
          if (cancelled)
            return
          setVerifyPlayApps(apps)
          const result = reconcileAndroidApp({ gradleIds, apps })
          setVerifyReconcile(result)
          trackVerifyEvent('Android App Verify Shown', '🔍', {
            app_count: apps.length,
            gradle_id_count: gradleIds.length,
          })
          trackVerifyEvent('Android App Verify Result', '🔎', {
            result: result.kind,
            app_count: apps.length,
            gradle_id_count: gradleIds.length,
          })

          if (result.kind === 'exact-match') {
            // The only no-prompt case: a Play app matches the build id exactly.
            // Auto-confirm and advance — nothing on disk changes beyond the
            // existing package-choice persistence.
            const matched = apps.find(a => a.packageName === result.packageName)
            addLog(`✔ Building "${matched?.displayName || result.packageName}" (${result.packageName}) — matches your Play Store app.`)
            pickAndroidPackageAndAdvance(result.packageName, 'gradle')
            return
          }
          if (result.kind === 'no-app') {
            // No Play apps at all → Path B (create the app in Play Console).
            setVerifyAttempt(0)
            setVerifyAskReopen(false)
            setStep('android-app-verify-create-app')
            return
          }
          // wrong-build-id / multi-gradle → stay on android-package-select; the
          // render drives the enriched picker.
        }
        catch (err) {
          // Scope-missing (403) / network / token error: warn + fall through to
          // the plain Gradle picker. We must never throw into the wizard.
          if (cancelled)
            return
          setVerifyDegraded(true)
          const scopeMissing = err instanceof ReportingApiHttpError && err.status === 403
          const why = scopeMissing
            ? 'the Play Developer Reporting permission was not granted'
            : 'the Play Developer Reporting API could not be reached'
          addLog(`⚠ Skipping Play Store app verification — ${why}. Continuing with the package from your Gradle config.`, 'yellow')
          trackVerifyEvent('Android App Verify Result', '🔎', {
            result: scopeMissing ? 'scope-missing' : 'fetch-failed',
            app_count: 0,
            gradle_id_count: gradleIds.length,
          })
        }
        finally {
          if (!cancelled)
            setVerifyAppLoading(false)
        }
      })()
    }

    if (step === 'gcp-projects-loading') {
      ;(async () => {
        try {
          const tok = await ensureAccessToken()
          const projects = await listProjects(tok)
          if (cancelled)
            return
          setGcpProjects(projects)
          setStep('gcp-projects-select')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'gcp-projects-loading')
        }
      })()
    }

    if (step === 'gcp-setup-running' && !setupStartedRef.current) {
      setupStartedRef.current = true
      ;(async () => {
        try {
          setSetupStatus([])
          const tok = await ensureAccessToken()
          let projectChoice: GcpProjectChoice | null = gcpProjectChoice

          // Step A: create project if the user chose "new"
          if (projectChoice && projectChoice.createdByOnboarding && !projectChoice.projectNumber) {
            addSetupStatus(`Creating GCP project ${projectChoice.projectId}...`)
            const created = await gcpCreateProject(tok, projectChoice.projectId, projectChoice.displayName)
            if (cancelled)
              return
            projectChoice = {
              ...projectChoice,
              projectNumber: created.projectNumber,
            }
            setGcpProjectChoice(projectChoice)
            await persist((p) => ({
              ...p,
              completedSteps: { ...p.completedSteps, gcpProjectChosen: projectChoice! },
            }))
            addSetupStatus(`✔ Project created (number ${created.projectNumber})`)
          }

          if (!projectChoice)
            throw new Error('No GCP project selected')

          // Step B: enable Android Publisher API
          addSetupStatus(`Enabling ${ANDROIDPUBLISHER_API}...`)
          await enableService(tok, projectChoice.projectId, ANDROIDPUBLISHER_API)
          if (cancelled)
            return
          addSetupStatus('✔ API enabled')

          // Step C: create or find the capgo-native-build service account
          addSetupStatus(`Ensuring service account "${DEFAULT_SERVICE_ACCOUNT_ID}"...`)
          const { account: sa, created: saCreated } = await ensureServiceAccount({
            accessToken: tok,
            projectId: projectChoice.projectId,
            accountId: DEFAULT_SERVICE_ACCOUNT_ID,
            displayName: DEFAULT_SERVICE_ACCOUNT_DISPLAY_NAME,
            description: DEFAULT_SERVICE_ACCOUNT_DESCRIPTION,
          })
          if (cancelled)
            return
          const saProv: ServiceAccountProvisioned = {
            email: sa.email,
            projectId: projectChoice.projectId,
            uniqueId: sa.uniqueId,
          }
          setServiceAccountProvisioned(saProv)
          addSetupStatus(saCreated ? `✔ Service account created — ${sa.email}` : `✔ Service account exists — ${sa.email}`)

          // Step D: create a fresh JSON key for the SA
          addSetupStatus('Creating service-account JSON key...')
          const key = await createServiceAccountKey({
            accessToken: tok,
            projectId: projectChoice.projectId,
            serviceAccountEmail: sa.email,
          })
          if (cancelled)
            return
          setServiceAccountKeyBase64(key.privateKeyDataBase64)
          await persist((p) => ({
            ...p,
            _serviceAccountKeyBase64: key.privateKeyDataBase64,
            completedSteps: { ...p.completedSteps, serviceAccountProvisioned: saProv },
          }))
          addSetupStatus('✔ Key created')

          // Step E: invite the SA into the Play Developer account
          if (!playAccountChoice)
            throw new Error('No Play Developer account chosen')
          addSetupStatus(`Inviting ${sa.email} to Play Console...`)
          try {
            if (!androidPackageChoice)
              throw new Error('No Android package selected for the Play invite')
            await inviteServiceAccount({
              accessToken: tok,
              developerId: playAccountChoice.developerId,
              serviceAccountEmail: sa.email,
              developerAccountPermissions: CAPGO_SA_DEVELOPER_PERMISSIONS,
              grants: [{
                packageName: androidPackageChoice.packageName,
                permissions: CAPGO_SA_APP_PERMISSIONS,
              }],
            })
          }
          catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            // Treat "already exists" style failures as success — the SA is
            // already a user on this developer account from a prior run.
            if (/already|exists|duplicate/i.test(msg)) {
              addSetupStatus(`ℹ Service account was already invited — continuing`)
            }
            // The per-package grant 400s if the package isn't a real Play app
            // ("...packages are not available..."). On the verified generate path
            // we gate against this earlier; this is the safety net for the
            // import/degraded path. Turn Google's raw 400 into an actionable
            // message instead of dumping it to the error screen.
            else if (/not available|notFound|not found/i.test(msg) && /package/i.test(msg)) {
              throw new Error(`The package "${androidPackageChoice?.packageName ?? 'you selected'}" doesn't exist in this Play Console account yet, so the service account couldn't be granted access. Create the app in Play Console first (one-time, on the web), then re-run onboarding.`)
            }
            else {
              throw err
            }
          }
          if (cancelled)
            return
          const invite: PlayInviteProvisioned = {
            developerId: playAccountChoice.developerId,
            serviceAccountEmail: sa.email,
          }
          setPlayInviteProvisioned(invite)
          await persist((p) => ({
            ...p,
            completedSteps: { ...p.completedSteps, playInviteProvisioned: invite },
          }))
          addSetupStatus(`✔ Play Console invite confirmed`)

          // Step F: ask Google to revoke our OAuth tokens now that
          // provisioning has succeeded. From this point forward Capgo's build
          // workers authenticate via the service account JSON key — the
          // user's OAuth tokens are no longer needed. Revoking enforces the
          // trust statement on the pre-consent screen ("your tokens never
          // reach Capgo and we revoke them as soon as we're done"). Failure
          // is non-fatal: the token expires within ~1 hour regardless.
          if (refreshTokenState) {
            addSetupStatus('Revoking OAuth token (we don\'t need it anymore)...')
            try {
              await revokeToken(refreshTokenState)
              if (cancelled)
                return
              addSetupStatus('✔ OAuth token revoked')
            }
            catch (err) {
              if (cancelled)
                return
              const msg = err instanceof Error ? err.message : String(err)
              addSetupStatus(`⚠ Revoke request failed (${msg}) — token will expire on its own`)
            }
          }

          addLog(`✔ Google Cloud + Play setup complete`)
          setRetryCount(0)
          setStep('saving-credentials')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'gcp-setup-running')
        }
      })()
    }

    if (step === 'saving-credentials') {
      ;(async () => {
        try {
          // Self-heal: re-validate progress before attempting the save. If
          // the resume logic says we should be somewhere earlier (e.g. a
          // race lost the keystoreStorePassword between phases), route back
          // to the matching input step instead of crashing on a thrown
          // "keystore inputs missing" error.
          const fresh = await loadAndroidProgress(appId)
          if (fresh) {
            const expectedStep = getAndroidResumeStep(fresh)
            if (expectedStep !== 'saving-credentials') {
              if (cancelled)
                return
              addLog('ℹ Some required input was missing — sending you back to fill it in.', 'yellow')
              setStep(expectedStep)
              return
            }
          }
          const credentials = await doSaveCredentials()
          if (cancelled)
            return
          // Random-password backup hint: emitted only here (post-save) so the
          // claim "stored in credentials.json" is true. Note: on resume from a
          // crash that wiped the in-memory state, `randomPasswordGenerated` is
          // false and the hint is skipped — acceptable trade-off versus
          // persisting a one-off flag to progress.json.
          if (randomPasswordGenerated)
            addLog(`  ℹ Your auto-generated keystore password is now in ~/.capgo-credentials/credentials.json — back up that file.`, 'yellow')
          // Stash CI secret entries for later. We do NOT push to GitHub/GitLab
          // yet — the wizard now offers that step only AFTER a successful first
          // build, so users never end up with orphan secrets in a repo whose
          // build was never proven to work.
          //
          // Pass the API key so CAPGO_TOKEN gets included — the generated
          // GitHub Actions workflow references ${{ secrets.CAPGO_TOKEN }} for
          // --apikey, and users who pick "secrets only" still benefit from
          // having it ready in their repo for a workflow they'll write later.
          let capgoKey: string | undefined = apikey
          if (!capgoKey)
            capgoKey = findSavedKeySilent()
          const entries = createCiSecretEntries(credentials, capgoKey)
          setCiSecretEntries(entries)
          // Stash the raw credentials so the .env-export branch can write the
          // same shape `build credentials manage`'s export writes — without
          // CAPGO_TOKEN.
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
            // GitHub → new 3-option flow; GitLab → keep existing 2-option flow.
            // Workflow generation for GitLab CI is out of scope for v1.
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
          // Phase 1: resolve target repo via async gh — non-blocking so the
          // spinner keeps animating.
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
          // Phase 2: list existing secrets.
          setCiSecretCheckPhase(repoLabel
            ? `Checking existing env vars in ${repoLabel}…`
            : `Checking existing env vars in ${getCiSecretTargetLabel(ciSecretTarget)}…`)
          const existing = await listExistingCiSecretKeysAsync(ciSecretTarget, ciSecretEntries.map(entry => entry.key))
          if (cancelled)
            return
          setCiSecretExistingKeys(existing)
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
            undefined,
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
          // Branch on what the user picked at ask-github-actions-setup. GitLab
          // path leaves setupMode='undecided' and falls through to build-complete.
          if (setupMode === 'with-workflow') {
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
            catch {
              // Best-effort; pick-build-script falls back to empty list + escape hatches.
            }
            // Ask the user to confirm the package manager before we build the workflow.
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
          const proposed = generateWorkflow({
            appId,
            defaultPlatform: 'android',
            packageManager: selectedPackageManager ?? normalizePackageManager(pm.pm),
            buildScript: buildScriptChoice,
            secretKeys: ciSecretEntries.map(entry => entry.key),
          })
          const absolutePath = resolvePath(process.cwd(), WORKFLOW_GEN_PATH)
          let existing = ''
          let isNew = true
          if (existsSync(absolutePath)) {
            try {
              existing = readFileSync(absolutePath, 'utf8')
              isNew = false
            }
            catch {
              // Treat unreadable file as new.
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
              defaultPlatform: 'android',
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
          const targetPath = envExportTargetPath || defaultExportPath(appId, 'android')
          const result = exportCredentialsToEnv({
            appId,
            platform: 'android',
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
            platform: 'android',
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
          // CLI-flag key takes precedence over the saved one — same precedence
          // the iOS path uses (build/onboarding/ui/app.tsx#624). Without this,
          // `build init --platform android --apikey FOO` silently ignored FOO
          // and fell back to whichever key was on disk.
          let capgoKey: string | undefined = apikey
          if (!capgoKey)
            capgoKey = findSavedKeySilent()
          if (!capgoKey) {
            setBuildOutput(prev => [...prev, '⚠ No Capgo API key found.'])
            setBuildOutput(prev => [...prev, 'Run `capgo login` first, then `capgo build request --platform android`.'])
            setStep('build-complete')
            return
          }
          const buildLogger: BuildLogger = {
            info: (msg: string) => setBuildOutput(prev => [...prev, msg]),
            error: (msg: string) => setBuildOutput(prev => [...prev, `✖ ${msg}`]),
            warn: (msg: string) => setBuildOutput(prev => [...prev, `⚠ ${msg}`]),
            success: (msg: string) => setBuildOutput(prev => [...prev, `✔ ${msg}`]),
            buildLog: (msg: string) => setBuildOutput(prev => [...prev, ...sanitizeBuildLogLines(msg)]),
            uploadProgress: (percent: number) => {
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
                (line: string) => setBuildOutput(prev => [...prev, line]),
                (line: string) => setBuildOutput(prev => [...prev, line]),
              )
            },
          }
          setBuildOutput([`Requesting build for ${appId} (android)...`])
          const result = await requestBuildInternal(appId, {
            platform: 'android',
            apikey: capgoKey,
            // The Ink TUI owns the terminal — @clack/prompts inside
            // requestBuildInternal would corrupt rendering. Caller-handled mode
            // surfaces the captured log path via result.aiAnalysis and lets us
            // render the AI flow with Ink-native components.
            aiAnalysisMode: 'caller-handled',
          }, true, buildLogger)
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
            // Offer AI-assisted diagnosis when logs were captured. The log file
            // stays on disk until releaseCapturedLogs runs in 'build-complete'.
            if (result.aiAnalysis?.ready && result.aiAnalysis.jobId) {
              setAiJobId(result.aiAnalysis.jobId)
              setStep('ai-analysis-prompt')
              return
            }
          }
          setStep('build-complete')
        }
        catch (err) {
          if (!cancelled) {
            setBuildOutput(prev => [...prev, `⚠ ${err instanceof Error ? err.message : String(err)}`])
            setBuildOutput(prev => [...prev, 'Your credentials are saved. Run `capgo build request --platform android` to try again.'])
            setStep('build-complete')
          }
        }
      })()
    }

    // AI analysis — entered only when requestBuildInternal returned with
    // aiAnalysis.ready=true. See iOS sibling for full notes.
    if (step === 'ai-analysis-running' && aiJobId) {
      ;(async () => {
        await trackAiAnalysisChoice({
          apikey: resolvedApiKeyRef.current ?? apikey ?? '',
          orgId: resolvedOrgId ?? '',
          appId,
          platform: 'android',
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
          platform: 'android',
          jobId: aiJobId,
          result: resultTag,
          errorStatus: result.kind === 'error' ? result.status : undefined,
        }).catch(() => { /* telemetry never breaks the wizard */ })

        if (result.kind === 'ok') {
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
      // Report a successful outcome + durable summary to the shell/caller so it
      // can reprint the build URL + generated file paths to the PRIMARY buffer
      // (the alt-screen final frame is wiped on exit). ONLY place that fires
      // 'completed'; every other exit stays 'cancelled' by default.
      onResult?.({
        outcome: 'completed',
        summary: {
          buildUrl: buildUrl || undefined,
          ciSecretUploadSummary,
          workflowFilePath: workflowWrittenPath,
          envExportPath,
        },
      })
      // Best-effort cleanup of any leftover captured log.
      if (aiJobId) {
        void releaseCapturedLogs(aiJobId).catch(() => { /* best-effort */ })
      }
      // Do NOT auto-exit here. On the alt-screen, exit() restores the primary
      // buffer and wipes this success frame instantly — the user never gets to
      // read it. Stay rendered; a keypress (handled in useInput) exits, after
      // which command.ts reprints the durable summary to the primary buffer.
      return () => {
        cancelled = true
        validationCleanupRef.current?.()
        validationCleanupRef.current = null
      }
    }

    return () => {
      cancelled = true
      // Abort any in-flight SA validation. Safe to call when there isn't one
      // — the ref is reset to null on every step transition that doesn't
      // start a new validation.
      validationCleanupRef.current?.()
      validationCleanupRef.current = null
    }
  }, [step])

  // Route between the inline render and the scroll viewer based on the live
  // terminal size, BIDIRECTIONALLY (shrink → scroll, grow back → inline). See
  // iOS sibling + resolveAiResultRoute for the full rationale.
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

  const progressPct = ANDROID_STEP_PROGRESS[step] ?? 0
  const phaseLabel = getAndroidPhaseLabel(step)
  // See iOS sibling: conditional Header, visible on every interactive step
  // including the AI sub-flow, hidden on `requesting-build`, the scrollable AI
  // viewer, and the fullscreen workflow diff so those get the full terminal
  // height.
  const isAiResultScroll = step === 'ai-analysis-result-scroll'
  const isAiStep = step === 'ai-analysis-prompt' || step === 'ai-analysis-running' || step === 'ai-analysis-result' || isAiResultScroll
  // Tall fullscreen-style steps from the post-build GitHub Actions / .env
  // export flow hide Progress + Logs to avoid chrome-in-chrome-out flashing
  // between steps. Header stays visible across the whole flow.
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
  const showProgress = step !== 'welcome' && step !== 'error' && step !== 'build-complete' && step !== 'requesting-build' && step !== 'ai-analysis-result' && !isAiResultScroll && !tallStep
  const showLog = step !== 'requesting-build' && step !== 'build-complete' && !isAiStep && !tallStep

  // Streaming build output is a fullscreen takeover — see iOS sibling. As an
  // early return BEFORE the size gate it auto-tails inside a viewport that always
  // fits, so the unbounded output never trips "terminal too small": shrinking the
  // window mid-build keeps the live log on screen instead of hiding it behind the
  // resize prompt. (Matches the iOS app's ordering.)
  if (step === 'requesting-build')
    return <FullscreenBuildOutput title="Building..." lines={buildOutput} terminalRows={terminalRows} />

  // Fullscreen AI viewer is a takeover too — early return BEFORE the gate so it
  // owns the whole terminal (it paginates to the live size itself) and a mid-view
  // shrink can't replace the scrollable analysis with the resize prompt.
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

  // Size gate (resize-reactive): below the enforced floor, render the resize
  // prompt from THIS mounted component so all in-progress state is preserved — a
  // shrink shows the prompt, a re-grow shows the exact same step. Placed AFTER the
  // fullscreen build/AI takeovers above (which own the whole screen and must not
  // be hidden by the prompt) but before the normal step body. Matches iOS.
  if (!terminalFitsOnboarding(terminalCols, terminalRows, 'android'))
    return <TerminalTooSmallPrompt cols={terminalCols} rows={terminalRows} minRows={ANDROID_MIN_ROWS} />

  // `minHeight={terminalRows}` fills the viewport so Ink always uses its full
  // clear-screen redraw path, which avoids stale rows lingering after the
  // terminal shrinks. See iOS sibling for the full explanation.
  return (
    <Box flexDirection="column" minHeight={terminalRows} padding={1}>
      {showHeader && <Header />}
      {/* Banner pinned top; this flex spacer pushes the rest (log + body) to the
          bottom. Collapses to zero on a tight terminal (frame-fit unaffected);
          absorbs extra rows on a tall one. See iOS sibling. */}
      <Box flexGrow={1} />
      {/* Completed-steps log — OUTSIDE the measured body, capped to the rows the
          current step leaves (see logMaxRows + iOS sibling); CompletedStepsLog
          drops its leading gap when it collapses to one line. */}
      {showLog && <CompletedStepsLog entries={logLines} maxRows={logMaxRows} />}
      {/* Body: the current step (+ progress). Measured via `bodyRef`; the log
          above is excluded so the height is independent of completed-step count. */}
      <Box flexDirection="column" ref={bodyRef}>
      {showProgress && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="cyan">{phaseLabel}</Text>
          <Box marginTop={1}>
            <ProgressBar value={progressPct} />
            <Text dimColor>
              {' '}
              {progressPct}
              %
            </Text>
          </Box>
          <Divider />
        </Box>
      )}

      {/* Resume-or-restart prompt — only reachable when initialProgress is
          non-null AND getAndroidResumeStep didn't resolve to 'welcome'. The
          initial step useState above wires this branch. */}
      {step === 'resume-prompt' && initialProgress && (() => {
        const { startedAt, keystoreMethod, serviceAccountMethod, completedSteps } = initialProgress
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
        const keystoreLabel = keystoreMethod === 'existing'
          ? 'Import existing keystore'
          : keystoreMethod === 'generate' ? 'Generate new keystore' : 'Not chosen yet'
        const saLabel = serviceAccountMethod === 'existing'
          ? 'Import existing JSON'
          : serviceAccountMethod === 'generate' ? 'Create via Google' : null
        const keystoreReady = Boolean(completedSteps.keystoreReady)
        const androidPackage = completedSteps.androidPackageChosen
        // The service-account fork governs which downstream breadcrumbs make
        // sense. On the import path the user never signs in with Google or
        // picks a GCP project, so surfacing "Signed in with Google: No" there
        // is misleading — only show the OAuth-path lines once the user is
        // actually on (or has made progress along) that path. The import line
        // likewise only shows on the import path. Before either is chosen we
        // show neither, so a user who's about to auto-import isn't told they
        // haven't done OAuth steps that don't apply to them.
        const onImportPath = serviceAccountMethod === 'existing'
        const onOAuthPath = serviceAccountMethod === 'generate' || hasAnyOAuthProgress(initialProgress)
        const signedIn = completedSteps.googleSignInComplete
        const playAccount = completedSteps.playAccountChosen
        const gcpProject = completedSteps.gcpProjectChosen
        const saProvisioned = completedSteps.serviceAccountProvisioned
        const resumeLabel = getAndroidPhaseLabel(startStep) || startStep
        return (
          <Box flexDirection="column" marginTop={1} gap={1}>
            <Text bold color="cyan">{`↩️  Found in-progress onboarding for ${appId}`}</Text>
            <Text>Pick up where you left off, or start over from the welcome step.</Text>
            <Box flexDirection="column">
              <Text>{`•  Started: ${whenLabel}`}</Text>
              <Text>{`•  Keystore method: ${keystoreLabel}`}</Text>
              {saLabel && <Text>{`•  Service account method: ${saLabel}`}</Text>}
              <Text>{`•  Keystore ready: ${keystoreReady ? `Yes (${completedSteps.keystoreReady!.keystorePath})` : 'No'}`}</Text>
              {onImportPath && (
                <Text>{`•  Service account JSON: ${initialProgress.serviceAccountJsonPath ? `selected (${initialProgress.serviceAccountJsonPath})` : 'not selected yet'}`}</Text>
              )}
              {onOAuthPath && (
                <Text>{`•  Signed in with Google: ${signedIn ? `Yes (${signedIn.email})` : 'No'}`}</Text>
              )}
              {onOAuthPath && (
                <Text>{`•  Play Developer account: ${playAccount ? `Yes (${playAccount.displayName || playAccount.developerId})` : 'No'}`}</Text>
              )}
              {onOAuthPath && (
                <Text>{`•  GCP project: ${gcpProject ? `Yes (${gcpProject.displayName})` : 'No'}`}</Text>
              )}
              {(onImportPath || onOAuthPath) && (
                <Text>{`•  Android package: ${androidPackage ? `Yes (${androidPackage.packageName})` : 'No'}`}</Text>
              )}
              {onOAuthPath && (
                <Text>{`•  Service account provisioned: ${saProvisioned ? `Yes (${saProvisioned.email})` : 'No'}`}</Text>
              )}
              <Text dimColor>{`•  Resume target: ${resumeLabel}`}</Text>
            </Box>
            <Select
              options={[
                { label: '▶️  Continue from where I left off', value: 'continue' },
                { label: '🔄  Restart onboarding (wipe saved progress)', value: 'restart' },
              ]}
              onChange={async (value) => {
                // @inkjs/ui re-fire guard — see selectFiredRef JSDoc.
                if (selectFiredRef.current)
                  return
                selectFiredRef.current = true
                // Record which branch the user took. The funnel already shows
                // the resume-prompt step + the next step (welcome on restart,
                // the resume target on continue), but the explicit choice tag
                // gives a clean continue-vs-restart split without inferring it.
                trackAction('resume_prompt_decision', { choice: value })
                if (value === 'continue') {
                  // Now that the user has committed to picking up where they
                  // left off, replay the breadcrumb log so they see the
                  // in-progress state they're resuming into. Held back at
                  // mount so the resume-prompt screen itself wasn't surrounded
                  // by stale "✔ …" entries while they were still deciding.
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
      {step === 'welcome' && <WelcomeStep />}

      {step === 'no-platform' && <NoPlatformStep androidDir={androidDir} dense={false} />}

      {step === 'credentials-exist' && (
        <CredentialsExistStep
          appId={appId}
          dense={false}
          onChoose={(choice) => {
            if (choice === 'backup')
              setStep('backing-up')
            else
              exitOnboarding('Exiting onboarding.')
          }}
        />
      )}

      {step === 'backing-up' && <BackingUpStep />}

      {/* ── Phase 1 — Keystore ── */}

      {step === 'keystore-method-select' && (
        <KeystoreMethodSelectStep
          dense={false}
          onChoose={(choice) => {
            if (choice === 'learn') {
              setStep('keystore-explainer')
            }
            else if (choice === 'existing') {
              setKeystoreMethod('existing')
              persistAndStep((p) => ({ ...p, keystoreMethod: 'existing' }), 'keystore-existing-path')
            }
            else {
              setKeystoreMethod('generate')
              persistAndStep((p) => ({ ...p, keystoreMethod: 'generate' }), 'keystore-new-alias')
            }
          }}
        />
      )}

      {step === 'keystore-explainer' && (
        <KeystoreExplainerStep dense={false} onBack={() => setStep('keystore-method-select')} />
      )}

      {step === 'keystore-existing-path' && (
        <KeystoreExistingPathStep
          dense={false}
          showChooser={canUseFilePicker() && keystorePathMode === 'choose'}
          onChoosePicker={() => setStep('keystore-existing-picker')}
          onChooseManual={() => setKeystorePathMode('manual')}
          onSubmitPath={(val) => {
            const cleaned = cleanPath(val)
            if (!cleaned)
              return
            const abs = resolvePath(cleaned)
            if (!existsSync(abs)) {
              setError(`File not found: ${abs}`)
              setRetryStep('keystore-existing-path')
              setStep('error')
              return
            }
            setKeystoreExistingPath(abs)
            addLog(`✔ Keystore selected · ${abs}`)
            persistAndStep((p) => ({ ...p, keystoreExistingPath: abs }), 'keystore-existing-store-password')
          }}
        />
      )}

      {step === 'keystore-existing-picker' && <KeystoreExistingPickerStep />}

      {step === 'keystore-existing-store-password' && (
        <KeystoreExistingStorePasswordStep
          dense={false}
          onSubmit={(val) => {
            if (!val) {
              setError('Store password cannot be empty')
              setRetryStep('keystore-existing-store-password')
              setStep('error')
              return
            }
            setKeystoreStorePassword(val)
            addLog('✔ Store password set')
            persistAndStep((p) => ({ ...p, keystoreStorePassword: val }), 'keystore-existing-detecting-alias')
          }}
        />
      )}

      {step === 'keystore-existing-detecting-alias' && <KeystoreExistingDetectingAliasStep />}

      {step === 'keystore-existing-alias-select' && (
        <KeystoreExistingAliasSelectStep
          dense={false}
          aliases={detectedAliases}
          onSelect={(value) => {
            setKeystoreAlias(value)
            addLog(`✔ Alias selected · ${value}`)
            persistAndStep((p) => ({ ...p, keystoreAlias: value }), 'keystore-existing-key-password')
          }}
        />
      )}

      {step === 'keystore-existing-alias' && (
        <KeystoreExistingAliasStep
          dense={false}
          onSubmit={(val) => {
            const alias = val.trim() || RELEASE_ALIAS_DEFAULT
            setKeystoreAlias(alias)
            addLog(`✔ Key alias · ${alias}`)
            persistAndStep((p) => ({ ...p, keystoreAlias: alias }), 'keystore-existing-key-password')
          }}
        />
      )}

      {step === 'keystore-existing-key-password' && (
        <KeystoreExistingKeyPasswordStep
          dense={false}
          mode={keyPasswordProbe === 'prompt' ? 'prompt' : 'probing'}
          onSubmit={(val) => {
            const keyPw = val || keystoreStorePassword
            setKeystoreKeyPassword(keyPw)
            addLog('✔ Key password set')
            ;(async () => {
              try {
                const bytes = await readFile(keystoreExistingPath)
                const base64 = bytes.toString('base64')
                const ready: KeystoreReady = {
                  keystorePath: keystoreExistingPath,
                  alias: keystoreAlias || RELEASE_ALIAS_DEFAULT,
                  isGenerated: false,
                }
                setKeystoreBase64(base64)
                setKeystoreReady(ready)
                await persist((p) => ({
                  ...p,
                  keystoreKeyPassword: keyPw,
                  _keystoreBase64: base64,
                  serviceAccountForkSeen: true,
                  completedSteps: { ...p.completedSteps, keystoreReady: ready },
                }))
                addLog(`✔ Keystore loaded — ${keystoreExistingPath}`)
                // Smart-route: same pattern as the auto-probe branch above.
                // If the user has any OAuth-side progress (legacy resume or
                // mid-flow), pick up where they left off; otherwise drop
                // them on the new fork.
                const fresh = await loadAndroidProgress(appId)
                const hasOAuthProgress = fresh ? hasAnyOAuthProgress(fresh) : false
                if (hasOAuthProgress || fresh?.serviceAccountMethod !== undefined)
                  setStep(fresh ? getAndroidResumeStep(fresh) : 'service-account-method-select')
                else
                  setStep('service-account-method-select')
              }
              catch (err) {
                handleError(err, 'keystore-existing-path')
              }
            })()
          }}
        />
      )}

      {step === 'keystore-new-alias' && (
        <KeystoreNewAliasStep
          dense={false}
          onSubmit={(val) => {
            const alias = val.trim() || RELEASE_ALIAS_DEFAULT
            setKeystoreAlias(alias)
            addLog(`✔ Key alias · ${alias}`)
            persistAndStep((p) => ({ ...p, keystoreAlias: alias }), 'keystore-new-password-method')
          }}
        />
      )}

      {step === 'keystore-new-password-method' && (
        <KeystoreNewPasswordMethodStep
          dense={false}
          onChoose={(choice) => {
            if (choice === 'random') {
              const pw = generateRandomPassword()
              setKeystoreStorePassword(pw)
              setKeystoreKeyPassword(pw)
              setRandomPasswordGenerated(true)
              addLog('✔ Store + key passwords generated')
              persistAndStep((p) => ({ ...p, keystoreStorePassword: pw, keystoreKeyPassword: pw }), 'keystore-new-cn')
            }
            else {
              setStep('keystore-new-store-password')
            }
          }}
        />
      )}

      {step === 'keystore-new-store-password' && (
        <KeystoreNewStorePasswordStep
          dense={false}
          onSubmit={(val) => {
            if (val.length < 6) {
              setError('Password must be at least 6 characters')
              setRetryStep('keystore-new-store-password')
              setStep('error')
              return
            }
            setKeystoreStorePassword(val)
            addLog('✔ Store password set')
            persistAndStep((p) => ({ ...p, keystoreStorePassword: val }), 'keystore-new-key-password')
          }}
        />
      )}

      {step === 'keystore-new-key-password' && (
        <KeystoreNewKeyPasswordStep
          dense={false}
          onSubmit={(val) => {
            const keyPw = val || keystoreStorePassword
            setKeystoreKeyPassword(keyPw)
            addLog('✔ Key password set')
            persistAndStep((p) => ({ ...p, keystoreKeyPassword: keyPw }), 'keystore-new-cn')
          }}
        />
      )}

      {step === 'keystore-new-cn' && (
        <KeystoreNewCommonNameStep
          dense={false}
          appId={appId}
          onSubmit={(val) => {
            const cn = val.trim() || appId
            setKeystoreCommonName(cn)
            addLog(`✔ Common name · ${cn}`)
            persistAndStep((p) => ({ ...p, keystoreCommonName: cn }), 'keystore-generating')
          }}
        />
      )}

      {step === 'keystore-generating' && <KeystoreGeneratingStep />}

      {/* ── Phase 2 — Service account method fork ── */}

      {step === 'service-account-method-select' && (
        <ServiceAccountMethodSelectStep
          dense={false}
          onChoose={(method) => {
            if (selectFiredRef.current)
              return
            selectFiredRef.current = true
            setServiceAccountMethod(method)
            trackAction('android_sa_method_selected', { method })
            if (method === 'existing') {
              // Import path needs the package name first so validation can
              // probe edits.insert(packageName). The package-select step is
              // shared with the OAuth path and routes back here based on
              // serviceAccountMethod.
              persistAndStep(
                (p) => ({ ...p, serviceAccountMethod: 'existing' }),
                'android-package-select',
              )
            }
            else {
              persistAndStep(
                (p) => ({ ...p, serviceAccountMethod: 'generate' }),
                'google-sign-in',
              )
            }
          }}
        />
      )}

      {/* ── Phase 2a — Import existing service account JSON ── */}

      {step === 'sa-json-existing-path' && (
        <SaJsonExistingPathStep
          dense={false}
          showChooser={canUseFilePicker() && saJsonPathMode === 'choose'}
          onChoosePicker={() => {
            // The picker triggers a step transition that takes time — guard
            // against the @inkjs/ui re-fire bug before commit.
            if (selectFiredRef.current)
              return
            selectFiredRef.current = true
            setStep('sa-json-existing-picker')
          }}
          onChooseManual={() => {
            // 'manual' just flips the sub-mode (Select unmounts) and is safe
            // from the re-fire bug.
            setSaJsonPathMode('manual')
          }}
          onSubmitPath={(val) => {
            const cleaned = cleanPath(val)
            if (!cleaned)
              return
            const abs = resolvePath(cleaned)
            if (!existsSync(abs)) {
              setError(`File not found: ${abs}`)
              setRetryStep('sa-json-existing-path')
              setStep('error')
              return
            }
            setServiceAccountJsonPath(abs)
            addLog(`✔ Service account JSON · ${abs}`)
            persistAndStep(
              (p) => ({ ...p, serviceAccountJsonPath: abs }),
              'sa-json-validating',
            )
          }}
        />
      )}

      {step === 'sa-json-existing-picker' && <SaJsonExistingPickerStep />}

      {step === 'sa-json-validating' && <SaJsonValidatingStep />}

      {step === 'sa-json-validation-failed' && saValidationResult && !saValidationResult.ok && (
        <SaJsonValidationFailedStep
          dense={false}
          message={saValidationResult.message}
          onChoose={(value) => {
            if (selectFiredRef.current)
              return
            selectFiredRef.current = true
            // Defense-in-depth: the validation failure's errorCategory has
            // already been emitted on the `sa-json-validation-failed` step
            // event. Clearing the ref before leaving this step ensures any
            // subsequent error (e.g. disk failure at `saving-credentials`,
            // a failed re-validation, or an OAuth issue downstream) gets
            // its own freshly-mapped category instead of inheriting the
            // stale SA validation one. `handleError` overwrites this ref
            // before transitioning to `'error'`, so today this is
            // belt-and-suspenders — but it makes the ref's invariant
            // ("most recent unresolved error context") true at every
            // sa-json-validation-failed exit point.
            errorCategoryRef.current = undefined
            if (value === 'retry') {
              trackAction('android_sa_validation_recovery_selected', { recovery_action: 'retry' })
              // Clear the saved path so the picker chooser shows fresh.
              setServiceAccountJsonPath('')
              setSaValidationResult(null)
              setSaJsonPathMode('choose')
              persistAndStep(
                (p) => ({ ...p, serviceAccountJsonPath: undefined }),
                'sa-json-existing-path',
              )
              return
            }
            if (value === 'save-anyway') {
              trackAction('android_sa_validation_recovery_selected', { recovery_action: 'save_anyway' })
              ;(async () => {
                try {
                  if (!serviceAccountJsonPath)
                    throw new Error('No service account JSON path on record.')
                  const bytes = await readFile(serviceAccountJsonPath)
                  const base64 = bytes.toString('base64')
                  setServiceAccountKeyBase64(base64)
                  await persist((p) => ({
                    ...p,
                    _serviceAccountKeyBase64: base64,
                    serviceAccountValidationSkipped: true,
                  }))
                  addLog('⚠ Saved service account without validation — builds may fail if the SA isn\'t invited to your Play Console app.', 'yellow')
                  setStep('saving-credentials')
                }
                catch (err) {
                  handleError(err, 'sa-json-existing-path')
                }
              })()
              return
            }
            // oauth — fall back to the OAuth provisioning path.
            trackAction('android_sa_validation_recovery_selected', { recovery_action: 'fallback_oauth' })
            setServiceAccountMethod('generate')
            setSaValidationResult(null)
            persistAndStep(
              (p) => ({ ...p, serviceAccountMethod: 'generate' }),
              'google-sign-in',
            )
          }}
        />
      )}

      {/* ── Phase 2b — Google sign-in ── */}

      {step === 'google-sign-in' && !showOAuthLearnMore && (
        <GoogleSignInStep
          dense={false}
          onChoose={(value) => {
            if (value === 'go')
              setStep('google-sign-in-running')
            else if (value === 'learn')
              setShowOAuthLearnMore(true)
            else
              exitOnboarding('Run `capgo build init --platform android` again when ready.')
          }}
        />
      )}

      {step === 'google-sign-in' && showOAuthLearnMore && (
        <GoogleSignInLearnMoreStep dense={false} onBack={() => setShowOAuthLearnMore(false)} />
      )}

      {step === 'google-sign-in-running' && (
        <GoogleSignInRunningStep dense={false} statusMessages={oauthStatusMessages} />
      )}

      {/* ── Phase 3 — Play Developer account ID ── */}

      {step === 'play-developer-id-input' && playDevIdMode === 'actions' && (
        <PlayDeveloperIdActionsStep
          dense={false}
          playDeveloperUrl={PLAY_DEVELOPERS_URL}
          onChoose={async (value) => {
            if (value === 'open') {
              try {
                await open(PLAY_DEVELOPERS_URL)
                addLog('🌐 Opened Play Console in your browser', 'cyan')
              }
              catch {
                // Headless / WSL / SSH session — `open` has no display to
                // hand off to. Don't pretend it worked.
                addLog(`⚠ Couldn't auto-open the browser. Visit ${PLAY_DEVELOPERS_URL} manually.`, 'yellow')
              }
              setPlayDevIdMode('input')
            }
            else if (value === 'tutorial') {
              try {
                await open(PLAY_DEV_ID_TUTORIAL_URL)
                addLog('🎬 Opened video tutorial in your browser', 'cyan')
              }
              catch {
                addLog(`⚠ Couldn't auto-open the browser. Visit ${PLAY_DEV_ID_TUTORIAL_URL} manually.`, 'yellow')
              }
              // Stay on the actions screen so the user can still choose
              // "Open Play Console" or "I have my developer ID" after
              // watching.
            }
            else {
              setPlayDevIdMode('input')
            }
          }}
        />
      )}

      {step === 'play-developer-id-input' && playDevIdMode === 'input' && (
        <PlayDeveloperIdInputStep
          dense={false}
          onSubmit={(val) => {
            const id = extractDeveloperId(val)
            if (!id) {
              setError('Could not extract a developer ID. Paste the full Play Console URL or just the numeric ID.')
              setRetryStep('play-developer-id-input')
              setStep('error')
              return
            }
            const choice: PlayDeveloperAccountChoice = { developerId: id }
            setPlayAccountChoice(choice)
            addLog(`✔ Play Developer account — ${id}`)
            persistAndStep(
              (p) => ({
                ...p,
                completedSteps: { ...p.completedSteps, playAccountChosen: choice },
              }),
              'gcp-projects-loading',
            )
          }}
        />
      )}

      {/* ── Phase 4 — GCP project ── */}

      {step === 'gcp-projects-loading' && <GcpProjectsLoadingStep />}

      {step === 'gcp-projects-select' && (
        <GcpProjectsSelectStep
          dense={false}
          options={[
            { label: '🆕  Create a new project', value: '__new__' },
            ...gcpProjects.map(p => ({
              label: `${p.name} (${p.projectId})`,
              value: p.projectId,
            })),
          ]}
          onChange={(value) => {
            if (value === '__new__') {
              const defaultName = sanitizeGcpProjectDisplayName(`Capgo Native Build ${appId}`)
              setNewProjectDisplayName(defaultName)
              setStep('gcp-project-create-name')
              return
            }
            const chosen = gcpProjects.find(p => p.projectId === value)
            if (!chosen)
              return
            const choice: GcpProjectChoice = {
              projectId: chosen.projectId,
              projectNumber: chosen.projectNumber,
              displayName: chosen.name,
              createdByOnboarding: false,
            }
            setGcpProjectChoice(choice)
            addLog(`✔ GCP project — ${chosen.name}`)
            persistAndStep(
              (p) => ({
                ...p,
                completedSteps: { ...p.completedSteps, gcpProjectChosen: choice },
              }),
              'android-package-select',
            )
          }}
        />
      )}

      {step === 'gcp-project-create-name' && (
        <GcpProjectCreateNameStep
          dense={false}
          defaultDisplayName={newProjectDisplayName || sanitizeGcpProjectDisplayName(`Capgo ${appId}`)}
          onSubmit={(val) => {
            const displayName = sanitizeGcpProjectDisplayName(
              val.trim() || newProjectDisplayName || `Capgo ${appId}`,
            )
            const projectId = generateProjectId(appId)
            const choice: GcpProjectChoice = {
              projectId,
              displayName,
              createdByOnboarding: true,
            }
            setGcpProjectChoice(choice)
            setNewProjectDisplayName(displayName)
            addLog(`✔ GCP project (new) — ${displayName} / ${projectId}`)
            persistAndStep(
              (p) => ({
                ...p,
                pendingNewProjectId: projectId,
                pendingNewProjectDisplayName: displayName,
                completedSteps: { ...p.completedSteps, gcpProjectChosen: choice },
              }),
              'android-package-select',
            )
          }}
        />
      )}

      {step === 'android-package-select' && (() => {
        // Generate path: still listing the user's Play apps → show a loader.
        if (verifyAppLoading) {
          return (
            <Box flexDirection="column" marginTop={1}>
              <SpinnerLine text="Checking Play Console for your app..." />
              <Text dimColor>Listing your Play Store apps to confirm the build matches a real app.</Text>
            </Box>
          )
        }

        const reconcileKind = verifyReconcile?.kind
        // Enriched picker — generate path, apps exist but the build id matches
        // none (wrong-build-id) or several Gradle flavors need disambiguation
        // (multi-gradle). Lists the real Play apps first, then the Gradle ids.
        const showEnriched
          = serviceAccountMethod === 'generate'
            && !verifyDegraded
            && packageSelectMode === 'choose'
            && (reconcileKind === 'wrong-build-id' || reconcileKind === 'multi-gradle')

        if (showEnriched) {
          return (
            <Box flexDirection="column" marginTop={1}>
              <Alert variant="warning">
                {reconcileKind === 'multi-gradle'
                  ? 'Your project declares multiple Gradle applicationIds — pick the Play Store app you are building.'
                  : 'None of your Play Store apps match the package your project builds. Which app are you building?'}
              </Alert>
              <Newline />
              <Text dimColor>
                Apps marked
                {' '}
                <Text color="green">✓ in Play Console</Text>
                {' '}
                already exist in your account. Pick one whose package differs from your build id to let Capgo rename the project for you.
              </Text>
              <Newline />
              <Select
                key={`android-pkg-verify-${gateActionSeq}`}
                options={[
                  ...verifyPlayApps.map(a => ({
                    label: `✓ ${a.displayName || a.packageName} — ${a.packageName}  ·  in Play Console`,
                    value: `play:${a.packageName}`,
                  })),
                  ...detectedPackageIds.map(id => ({
                    label: verifyPlayApps.some(a => a.packageName === id)
                      ? `📦  ${id}  (from Gradle · ✓ in Play Console)`
                      : `📦  ${id}  (from Gradle · ⚠ not on Play yet — needs creating)`,
                    value: `gradle:${id}`,
                  })),
                  { label: '✍️   Type a different package name', value: '__manual__' },
                  { label: '➕  Create a new app in Play Console', value: '__create_new__' },
                ]}
                onChange={(value) => {
                  // This <Select> stays mounted across the async persistAndStep
                  // pick path, so bump the remount key to dodge the @inkjs/ui
                  // onChange re-fire bug.
                  setGateActionSeq(s => s + 1)
                  if (value === '__manual__') {
                    setPackageSelectMode('manual')
                    return
                  }
                  if (value === '__create_new__') {
                    setVerifyAttempt(0)
                    setVerifyAskReopen(false)
                    setStep('android-app-verify-create-app')
                    return
                  }
                  if (value.startsWith('play:')) {
                    const pkg = value.slice('play:'.length)
                    trackVerifyPicked(pkg, 'play-app')
                    // A Play app whose package already matches a Gradle build id
                    // is a valid target → pick it, no rename needed.
                    if (detectedPackageIds.includes(pkg)) {
                      pickAndroidPackageAndAdvance(pkg, 'gradle')
                      return
                    }
                    // packageName != any build id → Path A (offer the rename).
                    setVerifyChosenPlayApp(verifyPlayApps.find(a => a.packageName === pkg) ?? null)
                    setRenamePhase('menu')
                    setRenameOutput([])
                    setStep('android-app-verify-rename')
                    return
                  }
                  if (value.startsWith('gradle:')) {
                    const id = value.slice('gradle:'.length)
                    trackVerifyPicked(id, 'gradle')
                    // The build id must be a REAL Play app: the SA invite grants
                    // per-package and Google 400s on a package that doesn't exist.
                    // If apps:search doesn't list it, steer to create-app instead
                    // of advancing into a doomed provision.
                    if (verifyPlayApps.some(a => a.packageName === id)) {
                      pickAndroidPackageAndAdvance(id, 'gradle')
                    }
                    else {
                      setVerifyAttempt(0)
                      setVerifyAskReopen(false)
                      setStep('android-app-verify-create-app')
                    }
                  }
                }}
              />
            </Box>
          )
        }

        // Fallback — today's plain Gradle-only picker. Used on the import path,
        // the degraded generate path, when no reconcile result applies, and for
        // the shared manual-entry mode. A banner explains a skipped verification.
        return (
          <Box flexDirection="column">
            {(verifyImportSkipped || verifyDegraded) && packageSelectMode === 'choose' && (
              <Box marginTop={1}>
                <Alert variant="warning">
                  {verifyImportSkipped
                    ? 'App existence isn\'t verified on the imported-service-account path (it needs Google sign-in). Proceeding with the package from build.gradle — make sure it exists in Play Console.'
                    : 'Couldn\'t verify your app against Play Console — proceeding with the package from build.gradle. Make sure it exists in Play Console.'}
                </Alert>
              </Box>
            )}
            <AndroidPackageSelectStep
              dense={false}
              androidDir={androidDir}
              showChooser={detectedPackageIds.length > 0 && packageSelectMode === 'choose'}
              detectedCount={detectedPackageIds.length}
              detectedOptions={[
                ...detectedPackageIds.map(id => ({
                  label: `📦  ${id}`,
                  value: id,
                })),
                { label: '✍️   Type a different package name', value: '__manual__' },
              ]}
              onChooseDetected={(value) => {
                // Mode-switch path unmounts the <Select> synchronously, so the
                // @inkjs/ui re-fire bug can't replay it. The package-pick path
                // goes through async persistAndStep, which keeps the <Select>
                // mounted long enough for the bug to spam — gate it with the
                // per-step guard.
                if (value === '__manual__') {
                  setPackageSelectMode('manual')
                  return
                }
                if (selectFiredRef.current)
                  return
                selectFiredRef.current = true
                trackVerifyPicked(value, 'gradle')
                pickAndroidPackageAndAdvance(value, 'gradle')
              }}
              onSubmitManual={(val) => {
                const name = val.trim()
                if (!/^[a-z][\w]*(?:\.[a-z][\w]*)+$/i.test(name)) {
                  setError(`"${name}" doesn't look like a valid Android package name (e.g. com.example.app).`)
                  setRetryStep('android-package-select')
                  setStep('error')
                  return
                }
                trackVerifyPicked(name, 'manual')
                // On the verified generate path the typed package must be a real
                // Play app — otherwise the per-package SA invite 400s. Steer an
                // unknown package to create-app. (The import/degraded path has no
                // apps list to check against and keeps the old behavior + banner.)
                const verifiedGenerate = serviceAccountMethod === 'generate' && !verifyDegraded && !verifyImportSkipped
                if (verifiedGenerate && !verifyPlayApps.some(a => a.packageName === name)) {
                  setVerifyAttempt(0)
                  setVerifyAskReopen(false)
                  setStep('android-app-verify-create-app')
                  return
                }
                pickAndroidPackageAndAdvance(name, detectedPackageIds.includes(name) ? 'gradle' : 'user-input')
              }}
            />
          </Box>
        )
      })()}

      {/* Path A — the chosen Play app's package differs from the build id. We
          OFFER a Trapeze rename (applicationId + namespace) + cap sync + re-check
          as ONE explicit opt-in; nothing is rewritten unless the user picks it.
          Mirrors the iOS verify-app gate's loader / re-check mechanics. */}
      {step === 'android-app-verify-rename' && (() => {
        const target = verifyChosenPlayApp?.packageName ?? ''
        const fromIds = detectedPackageIds.join(', ') || '(no applicationId found)'
        const chosenName = verifyChosenPlayApp?.displayName || verifyChosenPlayApp?.packageName || 'the selected app'

        // `npm`/`npx` need the `.cmd` shim on Windows when spawned without a
        // shell; `node`/`pgrep` are bare everywhere we use them.
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
        const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
        const STUDIO_POLL_MS = 1000
        // Hard cap (~10 min) so a never-closing Studio can't spin forever; after
        // it we proceed anyway rather than trapping the user.
        const MAX_STUDIO_POLLS = 600

        const sleep = (ms: number) => new Promise<void>((resolveSleep) => {
          setTimeout(resolveSleep, ms)
        })

        // Spawn a command, accumulate combined stdout+stderr, resolve
        // { code, output }. Never rejects — a missing binary resolves code 1 so
        // the orchestration shows the manual fallback instead of crashing.
        const runCapture = (cmd: string, args: string[], cwd?: string) =>
          new Promise<{ code: number, output: string }>((resolveRun) => {
            let out = ''
            try {
              const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
              child.stdout?.setEncoding('utf8')
              child.stderr?.setEncoding('utf8')
              child.stdout?.on('data', (chunk: string) => { out += chunk })
              child.stderr?.on('data', (chunk: string) => { out += chunk })
              child.once('error', (e: Error) => resolveRun({ code: 1, output: `${out}${e.message}` }))
              child.once('close', code => resolveRun({ code: code ?? 1, output: out }))
            }
            catch (e) {
              resolveRun({ code: 1, output: e instanceof Error ? e.message : String(e) })
            }
          })

        // Run the rename script, verify it landed (re-read Gradle ids), cap sync,
        // re-reconcile, advance. NEVER claims false success — an unverified
        // rename surfaces the script output + a manual fallback.
        const doRename = async (tmpDir: string, studioWaitMs: number) => {
          const epoch = verifyAsyncEpochRef.current
          const projectCwd = process.cwd()
          setRenamePhase('renaming')
          const renameRun = await runCapture('node', [join(tmpDir, 'rename.mjs'), target], projectCwd)
          const freshIds = await findAndroidApplicationIds(androidDir)
          if (verifyAsyncEpochRef.current !== epoch) {
            await rm(tmpDir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ })
            return
          }
          setDetectedPackageIds(freshIds)
          if (!verifyRenamed(freshIds, target)) {
            const tail = renameRun.output.trim()
            setRenameOutput([
              `The rename didn't take — ${androidDir}/app/build.gradle still doesn't use ${target}.`,
              ...(tail ? [tail] : []),
            ])
            setRenamePhase('failed')
            await rm(tmpDir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ })
            renameTmpDirRef.current = null
            return
          }
          addLog(`🔧 Renamed your Android project to "${target}".`)
          // cap sync keeps Capacitor consistent after the native rename. A
          // non-zero exit is surfaced but non-fatal (spec §5.4).
          setRenamePhase('syncing')
          const sync = await runCapture(npxCmd, ['cap', 'sync'], projectCwd)
          if (verifyAsyncEpochRef.current !== epoch) {
            await rm(tmpDir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ })
            return
          }
          const capSyncOk = sync.code === 0
          if (!capSyncOk)
            addLog('⚠ npx cap sync reported an issue — review it later if the build misbehaves; continuing.', 'yellow')
          await rm(tmpDir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ })
          renameTmpDirRef.current = null
          trackVerifyEvent('Android App Verify Auto Fixed', '🔧', {
            from: fromIds,
            to: target,
            cap_sync_ok: capSyncOk,
            studio_wait_ms: studioWaitMs,
          })
          setRenamePhase('rechecking')
          // Read via the ref — the closure snapshot can be stale by the time a
          // long npm-install / cap-sync completes (see verifyPlayAppsRef).
          const playApps = verifyPlayAppsRef.current
          const result = reconcileAndroidApp({ gradleIds: freshIds, apps: playApps })
          setVerifyReconcile(result)
          if (result.kind === 'exact-match') {
            const matched = playApps.find(a => a.packageName === result.packageName)
            addLog(`✔ Building "${matched?.displayName || target}" (${target}) — matches your Play Store app.`)
            pickAndroidPackageAndAdvance(result.packageName, 'gradle')
            return
          }
          // The rename verified but reconcile didn't collapse to exact-match
          // (e.g. several Gradle flavors). The chosen Play app is real and now
          // matches a build id, so proceed with it rather than dead-ending.
          addLog(`✔ Building "${chosenName}" (${target}).`)
          pickAndroidPackageAndAdvance(target, 'gradle')
        }

        // Prepare the temp workspace (mkdtemp + write files + npm install), then
        // run the close-Android-Studio gate, then doRename. Explicit opt-in only.
        const startRename = async () => {
          const epoch = verifyAsyncEpochRef.current
          setRenameOutput([])
          setRenamePhase('preparing')
          let tmpDir: string
          try {
            tmpDir = await mkdtemp(join(tmpdir(), 'capgo-android-rename-'))
            const { packageJson, renameMjs } = buildRenameWorkspaceFiles(target)
            await writeFile(join(tmpDir, 'package.json'), packageJson)
            await writeFile(join(tmpDir, 'rename.mjs'), renameMjs)
          }
          catch (e) {
            if (verifyAsyncEpochRef.current !== epoch)
              return
            setRenameOutput([`Couldn't prepare the renamer workspace: ${e instanceof Error ? e.message : String(e)}`])
            setRenamePhase('failed')
            return
          }
          const install = await runCapture(npmCmd, ['install'], tmpDir)
          if (verifyAsyncEpochRef.current !== epoch) {
            await rm(tmpDir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ })
            return
          }
          if (install.code !== 0) {
            const tail = install.output.trim().split('\n').slice(-8).join('\n')
            setRenameOutput([
              'Couldn\'t install the project renamer (@trapezedev/project).',
              ...(tail ? [tail] : []),
              `Rename manually instead: set applicationId + namespace to ${target} in ${androidDir}/app/build.gradle, then re-check.`,
            ])
            setRenamePhase('failed')
            await rm(tmpDir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ })
            return
          }
          renameTmpDirRef.current = tmpDir
          // Close-Android-Studio gate. macOS auto-detects + polls; other OSes get
          // a one-time confirm (we can't reliably probe there).
          if (process.platform === 'darwin') {
            setRenamePhase('await-studio')
            const startedAt = Date.now()
            for (let i = 0; i < MAX_STUDIO_POLLS; i++) {
              const probe = await runCapture('pgrep', ['-f', 'Android Studio'])
              if (verifyAsyncEpochRef.current !== epoch)
                return
              if (isAndroidStudioRunning('darwin', probe.output) !== 'running')
                break
              await sleep(STUDIO_POLL_MS)
            }
            if (verifyAsyncEpochRef.current !== epoch)
              return
            await doRename(tmpDir, Date.now() - startedAt)
            return
          }
          setRenamePhase('await-studio-confirm')
        }

        // "I'll fix build.gradle myself — re-check": re-read Gradle ids and
        // reconcile without renaming anything.
        const recheckBuildId = async () => {
          const epoch = verifyAsyncEpochRef.current
          setRenamePhase('rechecking')
          const freshIds = await findAndroidApplicationIds(androidDir)
          if (verifyAsyncEpochRef.current !== epoch)
            return
          const playApps = verifyPlayAppsRef.current
          setDetectedPackageIds(freshIds)
          const result = reconcileAndroidApp({ gradleIds: freshIds, apps: playApps })
          setVerifyReconcile(result)
          trackVerifyEvent('Android App Verify Result', '🔎', {
            result: result.kind,
            app_count: playApps.length,
            gradle_id_count: freshIds.length,
          })
          if (result.kind === 'exact-match') {
            const matched = playApps.find(a => a.packageName === result.packageName)
            addLog(`✔ Building "${matched?.displayName || result.packageName}" (${result.packageName}) — matches your Play Store app.`)
            pickAndroidPackageAndAdvance(result.packageName, 'gradle')
            return
          }
          if (target && freshIds.includes(target)) {
            addLog(`✔ Building "${chosenName}" (${target}) — matches your Play Store app.`)
            pickAndroidPackageAndAdvance(target, 'gradle')
            return
          }
          setRenamePhase('menu')
        }

        const backToPicker = () => {
          setVerifyChosenPlayApp(null)
          setRenamePhase('menu')
          setRenameOutput([])
          setStep('android-package-select')
        }

        if (renamePhase === 'preparing') {
          return (
            <Box flexDirection="column" marginTop={1}>
              <SpinnerLine text="Preparing the project renamer…" />
              <Text dimColor>Installing @trapezedev/project into a temporary folder (one-time).</Text>
            </Box>
          )
        }
        if (renamePhase === 'await-studio') {
          return (
            <Box flexDirection="column" marginTop={1}>
              <SpinnerLine text="Waiting for Android Studio to close…" />
              <Text dimColor>Quit Android Studio to avoid clobbering the rename — this continues automatically once it's closed.</Text>
            </Box>
          )
        }
        if (renamePhase === 'renaming') {
          return (
            <Box flexDirection="column" marginTop={1}>
              <SpinnerLine text="Renaming your Android project…" />
              <Text dimColor>{`Setting applicationId + namespace to ${target} via Trapeze.`}</Text>
            </Box>
          )
        }
        if (renamePhase === 'syncing') {
          return (
            <Box flexDirection="column" marginTop={1}>
              <SpinnerLine text="Running npx cap sync…" />
              <Text dimColor>Keeping your Capacitor Android project consistent after the rename.</Text>
            </Box>
          )
        }
        if (renamePhase === 'rechecking') {
          return (
            <Box flexDirection="column" marginTop={1}>
              <SpinnerLine text="Re-checking against Play Console…" />
            </Box>
          )
        }

        if (renamePhase === 'await-studio-confirm') {
          return (
            <Box flexDirection="column" marginTop={1}>
              <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
                <Text bold color="cyan">Close Android Studio before continuing</Text>
                <Newline />
                <Text>If Android Studio has this project open, quit it first — editing the native files while it holds them open can corrupt the change.</Text>
              </Box>
              <Newline />
              <Select
                key={`android-rename-confirm-${gateActionSeq}`}
                options={[
                  { label: '➡  Android Studio is closed — continue', value: 'continue' },
                  { label: '❌ Cancel onboarding', value: 'cancel' },
                ]}
                onChange={(value) => {
                  setGateActionSeq(s => s + 1)
                  if (value === 'continue') {
                    // startRename always sets the workspace ref before this
                    // screen renders — if it's somehow gone, fail honestly
                    // instead of running `node rename.mjs` against ''.
                    const tmpDir = renameTmpDirRef.current
                    if (!tmpDir) {
                      setRenameOutput(['Internal error: the rename workspace was lost — use the manual steps below, or go Back and retry.'])
                      setRenamePhase('failed')
                      return
                    }
                    void doRename(tmpDir, 0)
                    return
                  }
                  addLog('Exiting onboarding.', 'yellow')
                  exitOnboarding()
                }}
              />
            </Box>
          )
        }

        if (renamePhase === 'failed') {
          return (
            <Box flexDirection="column" marginTop={1}>
              <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1}>
                <Text bold color="red">Couldn't rename your Android project automatically</Text>
                <Newline />
                <Text>
                  {'Set '}
                  <Text bold>applicationId</Text>
                  {' + '}
                  <Text bold>namespace</Text>
                  {' to '}
                  <Text bold color="cyan">{target}</Text>
                  {` in ${androidDir}/app/build.gradle, run `}
                  <Text bold>npx cap sync</Text>
                  {', then re-check.'}
                </Text>
                {renameOutput.map((line, i) => (
                  <Text key={i} dimColor>{line}</Text>
                ))}
              </Box>
              <Newline />
              <Select
                key={`android-rename-failed-${gateActionSeq}`}
                options={[
                  { label: '✅ I\'ve fixed build.gradle myself — re-check', value: 'recheck' },
                  { label: '↩  Back — pick a different app', value: 'back' },
                  { label: '❌ Cancel onboarding', value: 'cancel' },
                ]}
                onChange={(value) => {
                  setGateActionSeq(s => s + 1)
                  if (value === 'recheck') {
                    void recheckBuildId()
                    return
                  }
                  if (value === 'back') {
                    backToPicker()
                    return
                  }
                  addLog('Exiting onboarding.', 'yellow')
                  exitOnboarding()
                }}
              />
            </Box>
          )
        }

        // menu — the explicit opt-in offer.
        return (
          <Box flexDirection="column" marginTop={1}>
            <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
              <Text bold color="cyan">{`Build ID doesn't match "${chosenName}"`}</Text>
              <Newline />
              <Text>
                {'Your project builds '}
                <Text bold color="red">{fromIds}</Text>
                {', but the Play Store app you picked is '}
                <Text bold color="green">{target}</Text>
                {'.'}
              </Text>
              <Newline />
              <Text>
                {'Capgo can rename your Android project ('}
                <Text bold>applicationId</Text>
                {' + '}
                <Text bold>namespace</Text>
                {') to '}
                <Text bold color="cyan">{target}</Text>
                {', run '}
                <Text bold>npx cap sync</Text>
                {', and re-check — or fix build.gradle yourself.'}
              </Text>
              <Text dimColor>Nothing is changed unless you pick "Rename … for me" below.</Text>
            </Box>
            <Newline />
            <Select
              key={`android-rename-${gateActionSeq}`}
              options={[
                { label: `🔧 Rename my Android project to ${target} for me`, value: 'rename' },
                { label: '✅ I\'ll fix build.gradle myself — re-check', value: 'recheck' },
                { label: '↩  Back — pick a different app', value: 'back' },
                { label: '❌ Cancel onboarding', value: 'cancel' },
              ]}
              onChange={(value) => {
                setGateActionSeq(s => s + 1)
                if (value === 'rename') {
                  void startRename()
                  return
                }
                if (value === 'recheck') {
                  void recheckBuildId()
                  return
                }
                if (value === 'back') {
                  backToPicker()
                  return
                }
                addLog('Exiting onboarding.', 'yellow')
                exitOnboarding()
              }}
            />
          </Box>
        )
      })()}

      {/* Path B — no Play app exists yet. This is a real GATE on the generate
          path, NOT inform-and-proceed: the SA invite grants per-package and
          Google 400s on a package that doesn't exist, so onboarding cannot
          proceed until the app exists in Play Console. Create it (one manual
          click — the API can't), then re-check until apps:search sees it and we
          auto-advance. Re-check uses a loader + attempt counter + ask-before-reopen. */}
      {step === 'android-app-verify-create-app' && (() => {
        const pkgLabel = detectedPackageIds.join(', ') || 'your project'
        const attemptMarker = verifyAttempt > 0 ? ` (attempt ${verifyAttempt})` : ''

        // Open Play Console's app list so the user clicks "Create app" (the only
        // irreducible manual step). Asked before RE-opening on later attempts.
        const openCreatePlayConsole = async () => {
          const epoch = verifyAsyncEpochRef.current
          trackVerifyEvent('Android App Verify Create App Opened', '🌐', { attempt: verifyAttempt })
          let openFailed = false
          try {
            await open('https://play.google.com/console')
          }
          catch {
            openFailed = true
          }
          if (verifyAsyncEpochRef.current !== epoch)
            return
          if (openFailed)
            addLog('⚠ Could not open your browser. Visit https://play.google.com/console to create the app.', 'yellow')
          setVerifyAskReopen(false)
        }

        // Re-list Play apps + reconcile, with a loader + attempt counting. A
        // clean match advances; apps that now exist (but the build id doesn't
        // match) route to the enriched picker; otherwise ask before re-opening.
        const recheckCreateApp = async () => {
          const epoch = verifyAsyncEpochRef.current
          setVerifyRechecking(true)
          const attempt = verifyAttempt + 1
          try {
            const gradleIds = await findAndroidApplicationIds(androidDir)
            const token = await ensureAccessToken()
            const apps = await listPlayApps(token)
            if (verifyAsyncEpochRef.current !== epoch)
              return
            setDetectedPackageIds(gradleIds)
            setVerifyPlayApps(apps)
            const result = reconcileAndroidApp({ gradleIds, apps })
            setVerifyReconcile(result)
            trackVerifyEvent('Android App Verify Result', '🔎', {
              result: result.kind,
              app_count: apps.length,
              gradle_id_count: gradleIds.length,
            })
            if (result.kind === 'exact-match') {
              const matched = apps.find(a => a.packageName === result.packageName)
              addLog(`✔ Building "${matched?.displayName || result.packageName}" (${result.packageName}) — matches your Play Store app.`)
              pickAndroidPackageAndAdvance(result.packageName, 'gradle')
              return
            }
            if (result.kind === 'wrong-build-id' || result.kind === 'multi-gradle') {
              setVerifyAttempt(attempt)
              setVerifyAskReopen(false)
              setStep('android-package-select')
              return
            }
            // Still no app → count the attempt + ask before re-opening.
            setVerifyAttempt(attempt)
            setVerifyAskReopen(true)
          }
          catch (err) {
            if (verifyAsyncEpochRef.current !== epoch)
              return
            setVerifyAttempt(attempt)
            setVerifyAskReopen(true)
            const why = err instanceof ReportingApiHttpError && err.status === 403
              ? 'the Play Developer Reporting permission was not granted'
              : 'Play Console could not be reached'
            addLog(`⚠ Couldn't re-check Play Console — ${why}. Create the app, then re-check.`, 'yellow')
          }
          finally {
            // Deliberately NOT epoch-guarded: leaving the step mid-flight must
            // still clear the spinner flag, or a later return to this screen
            // would show a stale loader forever (React drops the write
            // harmlessly if the component already unmounted).
            setVerifyRechecking(false)
          }
        }

        if (verifyRechecking) {
          return (
            <Box flexDirection="column" marginTop={1}>
              <SpinnerLine text="Re-checking Play Console for your app..." />
              <Text dimColor>Re-listing your Play Store apps to confirm the app now exists.</Text>
            </Box>
          )
        }

        // After a blocked re-check we ASK before re-opening the browser.
        if (verifyAskReopen) {
          return (
            <Box flexDirection="column" marginTop={1}>
              <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
                <Text bold color="yellow">{`Still no Play Store app for ${pkgLabel}${attemptMarker}`}</Text>
                <Newline />
                <Text>{'We re-checked Play Console and didn\'t find an app yet. Newly-created apps can take a moment to appear — re-check again. Onboarding can\'t continue until the app exists, because Capgo grants your build access to that specific package.'}</Text>
              </Box>
              <Newline />
              <Select
                key={`android-create-reopen-${gateActionSeq}`}
                options={[
                  { label: '🔁 I\'ve created it — re-check', value: 'recheck' },
                  { label: '🌐 Re-open Play Console', value: 'reopen' },
                  ...(verifyPlayApps.length > 0 ? [{ label: '↩  Back — pick a different app', value: 'back' }] : []),
                  { label: '❌ Cancel onboarding', value: 'cancel' },
                ]}
                onChange={(value) => {
                  setGateActionSeq(s => s + 1)
                  if (value === 'recheck') {
                    void recheckCreateApp()
                    return
                  }
                  if (value === 'reopen') {
                    void openCreatePlayConsole()
                    return
                  }
                  if (value === 'back') {
                    setVerifyAttempt(0)
                    setVerifyAskReopen(false)
                    packageLoadedRef.current = true
                    setStep('android-package-select')
                    return
                  }
                  addLog('Exiting onboarding.', 'yellow')
                  exitOnboarding()
                }}
              />
            </Box>
          )
        }

        return (
          <Box flexDirection="column" marginTop={1}>
            <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
              <Text bold color="cyan">{`Create your app in Play Console${attemptMarker}`}</Text>
              <Newline />
              <Text>
                {'No Play Store app exists yet for '}
                <Text bold color="cyan">{pkgLabel}</Text>
                {'. Create it once in Play Console (the only manual step), then re-check. Onboarding continues automatically once the app exists — Capgo grants your build access to that specific package, so it must exist first.'}
              </Text>
              <Text dimColor>The Play Console API cannot create apps — this is a one-time manual step on the web.</Text>
            </Box>
            <Newline />
            <Select
              key={`android-create-${gateActionSeq}`}
              options={[
                { label: '🌐 Open Play Console to create this app', value: 'open' },
                { label: '🔁 I\'ve created it — re-check', value: 'recheck' },
                ...(verifyPlayApps.length > 0 ? [{ label: '↩  Back — pick a different app', value: 'back' }] : []),
                { label: '❌ Cancel onboarding', value: 'cancel' },
              ]}
              onChange={(value) => {
                setGateActionSeq(s => s + 1)
                if (value === 'open') {
                  void openCreatePlayConsole()
                  return
                }
                if (value === 'recheck') {
                  void recheckCreateApp()
                  return
                }
                if (value === 'back') {
                  setVerifyAttempt(0)
                  setVerifyAskReopen(false)
                  packageLoadedRef.current = true
                  setStep('android-package-select')
                  return
                }
                addLog('Exiting onboarding.', 'yellow')
                exitOnboarding()
              }}
            />
          </Box>
        )
      })()}

      {step === 'gcp-setup-running' && (
        <GcpSetupRunningStep dense={false} statusMessages={setupStatus} />
      )}

      {/* ── Phase 6 ── */}

      {step === 'saving-credentials' && (
        <SavingCredentialsStep />
      )}

      {step === 'detecting-ci-secrets' && (
        <DetectingCiSecretsStep />
      )}

      {step === 'ci-secrets-setup' && (
        <CiSecretsSetupStep
          dense={false}
          advice={ciSecretSetupAdvice}
          onChoose={(choice) => {
            setStep(choice === 'retry' ? 'detecting-ci-secrets' : 'build-complete')
          }}
        />
      )}

      {step === 'ci-secrets-target-select' && (
        <CiSecretsTargetSelectStep
          dense={false}
          options={[
            ...ciSecretTargets.map(target => ({
              label: target.provider === 'github' ? 'GitHub Actions repository secrets' : 'GitLab CI/CD variables',
              value: target.provider,
            })),
            { label: 'Skip', value: 'skip' },
          ]}
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
          dense={false}
          entryCount={ciSecretEntries.length}
          targetLabel={getCiSecretTargetLabel(ciSecretTarget)}
          cli={ciSecretTarget?.cli || 'CLI'}
          onChoose={(choice) => {
            setStep(choice === 'yes' ? 'checking-ci-secrets' : 'build-complete')
          }}
        />
      )}

      {step === 'ask-github-actions-setup' && (
        <Box flexDirection="column" marginTop={1}>
          <SuccessLine text="Android credentials saved · GitHub detected" />
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
            {defaultExportPath(appId, 'android').split('/').slice(-1)[0]}
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
              { label: `📝  Yes — write .env.capgo.${appId}.android`, value: 'yes' },
              { label: '❌  No, exit without exporting', value: 'no' },
            ]}
            onChange={(value) => {
              if (value === 'yes') {
                setEnvExportTargetPath(defaultExportPath(appId, 'android'))
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
          <SpinnerLine text={`Writing ${defaultExportPath(appId, 'android').split('/').slice(-1)[0]}…`} />
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
        <Box marginTop={1}><SpinnerLine text={`Preparing diff for ${WORKFLOW_PATH}…`} /></Box>
      )}

      {/* view-workflow-diff renders as a fullscreen early-return takeover above. */}

      {step === 'writing-workflow-file' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text={`Writing ${WORKFLOW_PATH}…`} />
        </Box>
      )}

      {step === 'checking-ci-secrets' && (
        <Box marginTop={1}><SpinnerLine text={ciSecretCheckPhase} /></Box>
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
          dense={false}
          existingKeys={ciSecretExistingKeys}
          onChoose={(choice) => {
            setStep(choice === 'replace' ? 'uploading-ci-secrets' : 'build-complete')
          }}
        />
      )}

      {step === 'uploading-ci-secrets' && (
        <Box marginTop={1}>
          <SpinnerLine
            text={ciSecretUploadProgress
              ? `Pushing ${ciSecretUploadProgress.current} of ${ciSecretUploadProgress.total}: ${ciSecretUploadProgress.key}…`
              : `Uploading env vars to ${ciSecretRepoLabel ?? getCiSecretTargetLabel(ciSecretTarget)}…`}
          />
        </Box>
      )}

      {step === 'ci-secrets-failed' && (
        <CiSecretsFailedStep
          dense={false}
          error={ciSecretError}
          onChoose={(choice) => {
            setStep(choice === 'retry' ? (ciSecretTarget ? 'checking-ci-secrets' : 'detecting-ci-secrets') : 'build-complete')
          }}
        />
      )}

      {step === 'ask-build' && (
        <AskBuildStep
          dense={false}
          onChoose={(choice) => {
            if (choice === 'yes')
              setStep('requesting-build')
            else
              setStep('build-complete')
          }}
        />
      )}

      {/* Requesting build: handled by the FullscreenBuildOutput early return
          above — nothing renders here in the measured body. */}

      {step === 'build-complete' && (
        <BuildCompleteStep
          uploadSummary={ciSecretUploadSummary}
          buildUrl={buildUrl}
          workflowWrittenPath={workflowWrittenPath}
          envExportPath={envExportPath}
          envExportError={envExportError}
          dense={false}
        />
      )}

      {/* AI debug — ask the user whether to send the captured log */}
      {step === 'ai-analysis-prompt' && (
        <AiAnalysisPromptStep
          dense={false}
          onChoose={async (choice) => {
            if (choice === 'debug') {
              setStep('ai-analysis-running')
            }
            else {
              if (aiJobId) {
                await trackAiAnalysisChoice({
                  apikey: resolvedApiKeyRef.current ?? apikey ?? '',
                  orgId: resolvedOrgId ?? '',
                  appId,
                  platform: 'android',
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
          // See iOS sibling: marker only when dismissed AND still too tall.
          collapsed={aiViewedFull && !!aiAnalysisText && isAiAnalysisTooTall(aiAnalysisText, terminalRows, terminalCols)}
          result={aiResult}
          retryCount={aiRetryCount}
          maxRetries={MAX_AI_RETRIES}
          dense={false}
          onReread={() => setStep('ai-analysis-result-scroll')}
          onRetry={async () => {
            if (aiJobId) {
              await trackAiAnalysisChoice({
                apikey: resolvedApiKeyRef.current ?? apikey ?? '',
                orgId: resolvedOrgId ?? '',
                appId,
                platform: 'android',
                jobId: aiJobId,
                choice: 'retry',
                triggeredBy: 'onboarding',
              }).catch(() => { /* telemetry never breaks the wizard */ })
              void releaseCapturedLogs(aiJobId).catch(() => { /* best-effort */ })
            }
            setAiJobId(null)
            setAiAnalysisText(null)
            setAiResult(null)
            setAiViewedFull(false)
            setAiRetryCount(prev => prev + 1)
            setStep('requesting-build')
          }}
          onSkipOrContinue={() => setStep('build-complete')}
        />
      )}

      {/* (ai-analysis-result-scroll renders as a fullscreen early return above.) */}

      {step === 'error' && error && retryStep && (
        <ErrorStep
          message={error}
          dense={false}
          onChoose={(choice) => {
            if (choice === 'retry') {
              setError(null)
              errorCategoryRef.current = undefined
              const target = retryStep
              setRetryStep(null)
              setStep(target)
            }
            else {
              exitOnboarding('Run `capgo build init --platform android` to resume.')
            }
          }}
        />
      )}
      </Box>
    </Box>
  )
}

export default AndroidOnboardingApp
