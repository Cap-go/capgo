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
import { handleCustomMsg } from '../../../qr.js'
import { existsSync } from 'node:fs'
import { copyFile, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import process from 'node:process'
import { Alert, ProgressBar, Select } from '@inkjs/ui'
import { Box, Newline, Text, useApp, useInput, useStdout } from 'ink'
// src/build/onboarding/android/ui/app.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createSupabaseClient, findSavedKey, findSavedKeySilent, getOrganizationId } from '../../../../utils.js'
import { loadSavedCredentials, updateSavedCredentials } from '../../../credentials.js'
import { releaseCapturedLogs, runCapgoAiAnalysis } from '../../../../ai/analyze.js'
import { renderMarkdown } from '../../../../ai/render-markdown.js'
import { trackAiAnalysisChoice, trackAiAnalysisResult } from '../../../../ai/telemetry.js'
import { requestBuildInternal } from '../../../request.js'
import { isAiAnalysisTooTall } from '../../ai-fit.js'

// Upper bound on "I fixed it, retry build" attempts after an AI diagnosis.
// Three total attempts (initial + two retries) caps the AI cost when a model
// suggestion doesn't actually fix the failure mode while still giving the user
// a couple of in-wizard chances to iterate.
const MAX_AI_RETRIES = 2
import type { CiSecretEntry, CiSecretSetupAdvice, CiSecretTarget } from '../../ci-secrets.js'
import { createCiSecretEntries, detectCiSecretTargets, getCiSecretTargetLabel, listExistingCiSecretKeys, uploadCiSecrets } from '../../ci-secrets.js'
import { mapAndroidOnboardingError, mapSaValidationKindToCategory } from '../../error-categories.js'
import { canUseFilePicker, openKeystorePicker, openServiceAccountJsonPicker } from '../../file-picker.js'
import { trackBuilderOnboardingStep } from '../../telemetry.js'
import { Divider, ErrorLine, FilteredTextInput, FullscreenAiViewer, Header, SpinnerLine, SuccessLine } from '../../ui/components.js'
import { findAndroidApplicationIds } from '../gradle-parser.js'
import { validateServiceAccountJson } from '../service-account-validation.js'
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
import { deleteAndroidProgress, getAndroidResumeStep, loadAndroidProgress, saveAndroidProgress } from '../progress.js'
import { ANDROID_STEP_PROGRESS, getAndroidPhaseLabel } from '../types.js'

interface LogEntry { text: string, color?: string }

interface AppProps {
  appId: string
  initialProgress: AndroidOnboardingProgress | null
  androidDir: string
  /** Optional Capgo API key passed via -a/--apikey flag; takes precedence over saved key. */
  apikey?: string
}

const RELEASE_ALIAS_DEFAULT = 'release'

/** OAuth scopes — superset of `androidpublisher` because we also need
 *  cloud-platform to create GCP projects, service accounts, and keys on the
 *  user's behalf. userinfo.email + openid are for identifying the signed-in
 *  user in the UI. */
const OAUTH_SCOPES_FOR_ONBOARDING = [
  ...GOOGLE_OAUTH_SCOPES_ANDROIDPUBLISHER,
  'https://www.googleapis.com/auth/cloud-platform',
] as const

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

const AndroidOnboardingApp: FC<AppProps> = ({ appId, initialProgress, androidDir, apikey }) => {
  const { exit } = useApp()
  const startStep: AndroidOnboardingStep = getAndroidResumeStep(initialProgress)

  const [step, setStep] = useState<AndroidOnboardingStep>(
    startStep === 'welcome' ? 'welcome' : startStep,
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
    errorCategory?: AndroidOnboardingErrorCategory
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

    // (2) Now safely skip the duplicate-step path.
    if (isDuplicateStep)
      return

    const now = Date.now()
    // Initial step (previous.step === null) and same-step error re-entries have
    // no meaningful previous-step duration.
    const durationMs = previous.step === null || previous.step === step
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
  const [aiResultMessage, setAiResultMessage] = useState<string | null>(null)
  const [aiRetryCount, setAiRetryCount] = useState(0)
  // See iOS sibling for full notes on aiViewedFull.
  const [aiViewedFull, setAiViewedFull] = useState(false)
  const [ciSecretEntries, setCiSecretEntries] = useState<CiSecretEntry[]>([])
  const [ciSecretTargets, setCiSecretTargets] = useState<CiSecretTarget[]>([])
  const [ciSecretTarget, setCiSecretTarget] = useState<CiSecretTarget | null>(null)
  const [ciSecretSetupAdvice, setCiSecretSetupAdvice] = useState<CiSecretSetupAdvice[]>([])
  const [ciSecretExistingKeys, setCiSecretExistingKeys] = useState<string[]>([])
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

  const addLog = useCallback((text: string, color = 'green') => {
    setLogLines(prev => [...prev, { text, color }])
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

  useEffect(() => {
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
  }, [])

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
          if (existing?.android && !initialProgress)
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
          // Stash the validation failure kind so the PostHog
          // `sa-json-validation-failed` step event carries the dimension.
          // Read by the telemetry useEffect on the upcoming step transition.
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
          const hasAnyOAuthProgress = !!(
            fresh?.completedSteps.googleSignInComplete
            || fresh?.completedSteps.playAccountChosen
            || fresh?.completedSteps.gcpProjectChosen
            || fresh?.completedSteps.androidPackageChosen
            || fresh?._oauthRefreshToken
          )
          if (hasAnyOAuthProgress || fresh?.serviceAccountMethod !== undefined)
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
            if (!/already|exists|duplicate/i.test(msg))
              throw err
            addSetupStatus(`ℹ Service account was already invited — continuing`)
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
          const entries = createCiSecretEntries(credentials)
          setCiSecretEntries(entries)
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
            setCiSecretTarget(discovery.targets[0])
            setStep('ask-ci-secrets')
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
          const existing = listExistingCiSecretKeys(ciSecretTarget, ciSecretEntries.map(entry => entry.key))
          if (cancelled)
            return
          setCiSecretExistingKeys(existing)
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
          uploadCiSecrets(ciSecretTarget, ciSecretEntries, ciSecretExistingKeys)
          if (cancelled)
            return
          const summary = `Uploaded ${ciSecretEntries.length} env var${ciSecretEntries.length === 1 ? '' : 's'} to ${getCiSecretTargetLabel(ciSecretTarget)}`
          setCiSecretUploadSummary(summary)
          addLog(`✔ ${summary}`)
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

    if (step === 'requesting-build') {
      ;(async () => {
        try {
          // CLI-flag key takes precedence over the saved one — same precedence
          // the iOS path uses (build/onboarding/ui/app.tsx#624). Without this,
          // `build init --platform android --apikey FOO` silently ignored FOO
          // and fell back to whichever key was on disk.
          let capgoKey: string | undefined = apikey
          if (!capgoKey) {
            try {
              capgoKey = findSavedKey(true)
            }
            catch {}
          }
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
            buildLog: (msg: string) => setBuildOutput(prev => [...prev, msg]),
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
          setAiResultMessage(null)
        }
        else if (result.kind === 'already_analyzed') {
          setAiAnalysisText(null)
          setAiResultMessage('AI analysis was already requested for this build (only one per job).')
        }
        else if (result.kind === 'too_big') {
          setAiAnalysisText(null)
          setAiResultMessage('Build log is too large for Capgo AI (>10 MB). Try a local AI tool with the captured log.')
        }
        else {
          setAiAnalysisText(null)
          const detail = [
            result.status ? `(status ${result.status})` : null,
            result.message,
          ].filter(Boolean).join(' ')
          setAiResultMessage(`AI analysis failed${detail ? `: ${detail}` : ''}.`)
        }
        setStep('ai-analysis-result')
      })()
    }

    if (step === 'build-complete') {
      setBuildOutput([])
      // Best-effort cleanup of any leftover captured log.
      if (aiJobId) {
        void releaseCapturedLogs(aiJobId).catch(() => { /* best-effort */ })
      }
      const timer = setTimeout(() => {
        if (!cancelled)
          exit()
      }, 100)
      return () => {
        cancelled = true
        clearTimeout(timer)
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

  // Re-evaluate AI-analysis fit on step entry AND on terminal resize, routing
  // inline → scroll viewer when it no longer fits. See iOS sibling for why
  // this needs its own resize-dependent effect.
  useEffect(() => {
    if (step !== 'ai-analysis-result' || !aiAnalysisText || aiViewedFull)
      return
    if (isAiAnalysisTooTall(aiAnalysisText, terminalRows, terminalCols))
      setStep('ai-analysis-result-scroll')
  }, [step, aiAnalysisText, aiViewedFull, terminalRows, terminalCols])

  const progressPct = ANDROID_STEP_PROGRESS[step] ?? 0
  const phaseLabel = getAndroidPhaseLabel(step)
  // See iOS sibling: conditional Header, visible on every interactive step
  // including the AI sub-flow, hidden on `requesting-build` and on the
  // scrollable AI viewer so those get the full terminal height.
  const isAiResultScroll = step === 'ai-analysis-result-scroll'
  const isAiStep = step === 'ai-analysis-prompt' || step === 'ai-analysis-running' || step === 'ai-analysis-result' || isAiResultScroll
  const showHeader = step !== 'requesting-build' && !isAiResultScroll
  const showProgress = step !== 'welcome' && step !== 'error' && step !== 'build-complete' && step !== 'requesting-build' && step !== 'ai-analysis-result' && !isAiResultScroll
  const showLog = step !== 'requesting-build' && step !== 'build-complete' && !isAiStep

  return (
    <Box flexDirection="column" padding={1}>
      {showHeader && <Header />}
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

      {showLog && logLines.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {logLines.map((entry, i) => (
            <Text key={i} color={entry.color as any}>{entry.text}</Text>
          ))}
        </Box>
      )}

      {step === 'welcome' && (
        <Box marginTop={1} justifyContent="center">
          <SpinnerLine text="Detecting Android project..." />
        </Box>
      )}

      {step === 'no-platform' && (
        <Box flexDirection="column" marginTop={1}>
          <ErrorLine text={`No ${androidDir}/ directory found.`} />
          <Newline />
          <Text>Run <Text bold color="white">npx cap add android</Text> first, then re-run onboarding.</Text>
        </Box>
      )}

      {step === 'credentials-exist' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">⚠ Android credentials already exist for {appId}</Text>
          <Newline />
          <Text>Onboarding will create new credentials, replacing the existing ones.</Text>
          <Newline />
          <Select
            options={[
              { label: '📦  Start fresh (backup existing credentials first)', value: 'backup' },
              { label: '✖  Exit onboarding', value: 'exit' },
            ]}
            onChange={(value) => {
              if (value === 'backup')
                setStep('backing-up')
              else
                exitOnboarding('Exiting onboarding.')
            }}
          />
        </Box>
      )}

      {step === 'backing-up' && (
        <Box marginTop={1}><SpinnerLine text="Backing up existing credentials..." /></Box>
      )}

      {/* ── Phase 1 — Keystore ── */}

      {step === 'keystore-method-select' && (
        <Box flexDirection="column" marginTop={1}>
          <Alert variant="info">
            Android apps must be signed by a keystore. Google Play requires the same keystore for every update, forever.
          </Alert>
          <Newline />
          <Text bold>Do you already have a keystore?</Text>
          <Newline />
          <Select
            options={[
              { label: '✅  Yes, I have one', value: 'existing' },
              { label: '🆕  No, create one for me', value: 'generate' },
              { label: 'ℹ️   What is a keystore?', value: 'learn' },
            ]}
            onChange={(value) => {
              if (value === 'learn') {
                setStep('keystore-explainer')
              }
              else if (value === 'existing') {
                setKeystoreMethod('existing')
                persistAndStep((p) => ({ ...p, keystoreMethod: 'existing' }), 'keystore-existing-path')
              }
              else {
                setKeystoreMethod('generate')
                persistAndStep((p) => ({ ...p, keystoreMethod: 'generate' }), 'keystore-new-alias')
              }
            }}
          />
        </Box>
      )}

      {step === 'keystore-explainer' && (
        <Box flexDirection="column" marginTop={1}>
          <Alert variant="info">
            A keystore is a file that holds a cryptographic key used to sign your Android app.
          </Alert>
          <Newline />
          <Box flexDirection="column" marginLeft={2}>
            <Text>• Google Play uses the key to verify that every update really came from you.</Text>
            <Text>• You must use the <Text bold>same</Text> keystore for every release of this app.</Text>
            <Text>• If you lose it, you lose the ability to publish updates.</Text>
            <Text>• If you&apos;ve never published this app before, let us create one for you.</Text>
          </Box>
          <Newline />
          <Select options={[{ label: '← Back', value: 'back' }]} onChange={() => setStep('keystore-method-select')} />
        </Box>
      )}

      {step === 'keystore-existing-path' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Existing keystore (.jks, .keystore, or .p12)</Text>
          <Newline />
          {canUseFilePicker() && keystorePathMode === 'choose'
            ? (
                <>
                  <Text>How do you want to provide it?</Text>
                  <Newline />
                  <Select
                    options={[
                      { label: '📂  Open file picker', value: 'picker' },
                      { label: '📝  Type the path', value: 'manual' },
                    ]}
                    onChange={(value) => {
                      if (value === 'picker')
                        setStep('keystore-existing-picker')
                      else
                        setKeystorePathMode('manual')
                    }}
                  />
                </>
              )
            : (
                <>
                  <Text dimColor>Tip: drag a file into this window to paste its path.</Text>
                  <Newline />
                  <FilteredTextInput
                    placeholder="/path/to/release.jks"
                    filter=""
                    onSubmit={(val) => {
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
                </>
              )}
        </Box>
      )}

      {step === 'keystore-existing-picker' && (
        <Box marginTop={1}><SpinnerLine text="Waiting for file selection..." /></Box>
      )}

      {step === 'keystore-existing-store-password' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Store password:</Text>
          <Text dimColor>We'll use this to unlock the keystore and auto-detect the alias.</Text>
          <Newline />
          <FilteredTextInput
            placeholder="(hidden)"
            filter=""
            mask
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
        </Box>
      )}

      {step === 'keystore-existing-detecting-alias' && (
        <Box marginTop={1}><SpinnerLine text="Unlocking keystore and reading aliases..." /></Box>
      )}

      {step === 'keystore-existing-alias-select' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Multiple aliases in the keystore. Which one do you use for this app?</Text>
          <Newline />
          <Select
            options={detectedAliases.map(a => ({ label: a, value: a }))}
            onChange={(value) => {
              setKeystoreAlias(value)
              addLog(`✔ Alias selected · ${value}`)
              persistAndStep((p) => ({ ...p, keystoreAlias: value }), 'keystore-existing-key-password')
            }}
          />
        </Box>
      )}

      {step === 'keystore-existing-alias' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Key alias:</Text>
          <Text dimColor>We couldn't auto-detect it — please enter it manually.</Text>
          <Newline />
          <FilteredTextInput
            placeholder="release"
            filter=""
            onSubmit={(val) => {
              const alias = val.trim() || RELEASE_ALIAS_DEFAULT
              setKeystoreAlias(alias)
              addLog(`✔ Key alias · ${alias}`)
              persistAndStep((p) => ({ ...p, keystoreAlias: alias }), 'keystore-existing-key-password')
            }}
          />
        </Box>
      )}

      {step === 'keystore-existing-key-password' && keyPasswordProbe !== 'prompt' && (
        <Box marginTop={1}>
          <SpinnerLine text="Checking if the key uses the same password as the store..." />
        </Box>
      )}

      {step === 'keystore-existing-key-password' && keyPasswordProbe === 'prompt' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Key password (press Enter to use the same as store password):</Text>
          <Newline />
          <FilteredTextInput
            placeholder="(hidden — same as store)"
            filter=""
            mask
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
                    completedSteps: { ...p.completedSteps, keystoreReady: ready },
                  }))
                  addLog(`✔ Keystore loaded — ${keystoreExistingPath}`)
                  // Smart-route: same pattern as the auto-probe branch above.
                  // If the user has any OAuth-side progress (legacy resume or
                  // mid-flow), pick up where they left off; otherwise drop
                  // them on the new fork.
                  const fresh = await loadAndroidProgress(appId)
                  const hasAnyOAuthProgress = !!(
                    fresh?.completedSteps.googleSignInComplete
                    || fresh?.completedSteps.playAccountChosen
                    || fresh?.completedSteps.gcpProjectChosen
                    || fresh?.completedSteps.androidPackageChosen
                    || fresh?._oauthRefreshToken
                  )
                  if (hasAnyOAuthProgress || fresh?.serviceAccountMethod !== undefined)
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
        </Box>
      )}

      {step === 'keystore-new-alias' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Key alias (press Enter for "release"):</Text>
          <Newline />
          <FilteredTextInput
            placeholder="release"
            filter=""
            onSubmit={(val) => {
              const alias = val.trim() || RELEASE_ALIAS_DEFAULT
              setKeystoreAlias(alias)
              addLog(`✔ Key alias · ${alias}`)
              persistAndStep((p) => ({ ...p, keystoreAlias: alias }), 'keystore-new-password-method')
            }}
          />
        </Box>
      )}

      {step === 'keystore-new-password-method' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>How would you like to set the keystore password?</Text>
          <Newline />
          <Select
            options={[
              { label: '🔐  Generate a strong random password (recommended)', value: 'random' },
              { label: '✍️   I\'ll set my own', value: 'manual' },
            ]}
            onChange={(value) => {
              if (value === 'random') {
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
        </Box>
      )}

      {step === 'keystore-new-store-password' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Store password:</Text>
          <Newline />
          <FilteredTextInput
            placeholder="(hidden, minimum 6 characters)"
            filter=""
            mask
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
        </Box>
      )}

      {step === 'keystore-new-key-password' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Key password (press Enter to match store password):</Text>
          <Newline />
          <FilteredTextInput
            placeholder="(hidden — same as store)"
            filter=""
            mask
            onSubmit={(val) => {
              const keyPw = val || keystoreStorePassword
              setKeystoreKeyPassword(keyPw)
              addLog('✔ Key password set')
              persistAndStep((p) => ({ ...p, keystoreKeyPassword: keyPw }), 'keystore-new-cn')
            }}
          />
        </Box>
      )}

      {step === 'keystore-new-cn' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Common Name for the certificate (press Enter to use app ID):</Text>
          <Text dimColor>Google Play doesn&apos;t display this — default is safe.</Text>
          <Newline />
          <FilteredTextInput
            placeholder={appId}
            filter=""
            onSubmit={(val) => {
              const cn = val.trim() || appId
              setKeystoreCommonName(cn)
              addLog(`✔ Common name · ${cn}`)
              persistAndStep((p) => ({ ...p, keystoreCommonName: cn }), 'keystore-generating')
            }}
          />
        </Box>
      )}

      {step === 'keystore-generating' && (
        <Box marginTop={1}><SpinnerLine text="Generating 2048-bit RSA keystore..." /></Box>
      )}

      {/* ── Phase 2 — Service account method fork ── */}

      {step === 'service-account-method-select' && (
        <Box flexDirection="column" marginTop={1}>
          <Alert variant="info">
            Capgo needs a Google Play service account JSON to upload AABs on your behalf. You can bring your own or let Capgo set one up via Google sign-in.
          </Alert>
          <Newline />
          <Text bold>Do you already have a service account JSON?</Text>
          <Newline />
          <Select
            options={[
              { label: '🔐  No, set one up for me via Google', value: 'generate' },
              { label: '✅  Yes, I have my service account JSON file', value: 'existing' },
            ]}
            onChange={(value) => {
              if (selectFiredRef.current)
                return
              selectFiredRef.current = true
              const method: 'existing' | 'generate' = value === 'existing' ? 'existing' : 'generate'
              setServiceAccountMethod(method)
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
        </Box>
      )}

      {/* ── Phase 2a — Import existing service account JSON ── */}

      {step === 'sa-json-existing-path' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Existing service account JSON (.json)</Text>
          <Newline />
          {canUseFilePicker() && saJsonPathMode === 'choose'
            ? (
                <>
                  <Text>How do you want to provide it?</Text>
                  <Newline />
                  <Select
                    options={[
                      { label: '📂  Open file picker', value: 'picker' },
                      { label: '📝  Type the path', value: 'manual' },
                    ]}
                    onChange={(value) => {
                      // 'manual' just flips the sub-mode (Select unmounts) and
                      // is safe from the re-fire bug. 'picker' triggers a step
                      // transition that takes time — guard against re-fires
                      // before commit.
                      if (value === 'picker') {
                        if (selectFiredRef.current)
                          return
                        selectFiredRef.current = true
                        setStep('sa-json-existing-picker')
                      }
                      else {
                        setSaJsonPathMode('manual')
                      }
                    }}
                  />
                </>
              )
            : (
                <>
                  <Text dimColor>Tip: drag a file into this window to paste its path.</Text>
                  <Newline />
                  <FilteredTextInput
                    placeholder="/path/to/service-account.json"
                    filter=""
                    onSubmit={(val) => {
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
                </>
              )}
        </Box>
      )}

      {step === 'sa-json-existing-picker' && (
        <Box marginTop={1}><SpinnerLine text="Opening file picker..." /></Box>
      )}

      {step === 'sa-json-validating' && (
        <Box marginTop={1}>
          <SpinnerLine text="Validating service account against Google Play..." />
        </Box>
      )}

      {step === 'sa-json-validation-failed' && saValidationResult && !saValidationResult.ok && (
        <Box flexDirection="column" marginTop={1}>
          <Alert variant="warning">
            Service account validation failed.
          </Alert>
          <Newline />
          <Box flexDirection="column" marginLeft={2}>
            <Text color="red">{saValidationResult.message}</Text>
          </Box>
          <Newline />
          <Text bold>What would you like to do?</Text>
          <Newline />
          <Select
            options={[
              { label: '🔄  Try a different service account file', value: 'retry' },
              { label: '💾  Save credentials anyway (skip validation)', value: 'save-anyway' },
              { label: '🆕  Set up a new service account via Google', value: 'oauth' },
            ]}
            onChange={(value) => {
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
              setServiceAccountMethod('generate')
              setSaValidationResult(null)
              persistAndStep(
                (p) => ({ ...p, serviceAccountMethod: 'generate' }),
                'google-sign-in',
              )
            }}
          />
        </Box>
      )}

      {/* ── Phase 2b — Google sign-in ── */}

      {step === 'google-sign-in' && !showOAuthLearnMore && (
        <Box flexDirection="column" marginTop={1}>
          <Alert variant="info">
            Sign in with Google so Capgo can set up Play Store publishing on your account — your tokens never reach Capgo's servers.
          </Alert>
          <Newline />
          <Text>We'll open Google's consent screen. The two access requests are:</Text>
          <Box flexDirection="column" marginLeft={2} marginTop={1}>
            <Text>• <Text bold>Google Cloud access</Text> — to create a service account in a project you pick</Text>
            <Text>• <Text bold>Google Play Developer access</Text> — to invite that service account to your Play Console with release-only permissions</Text>
          </Box>
          <Newline />
          <Select
            options={[
              { label: '🔐  Continue to Google sign-in', value: 'go' },
              { label: 'ℹ️   Learn why the onboarding via Google is secure', value: 'learn' },
              { label: '✖  Exit (I\'ll do it later)', value: 'exit' },
            ]}
            onChange={(value) => {
              if (value === 'go')
                setStep('google-sign-in-running')
              else if (value === 'learn')
                setShowOAuthLearnMore(true)
              else
                exitOnboarding('Run `capgo build init --platform android` again when ready.')
            }}
          />
        </Box>
      )}

      {step === 'google-sign-in' && showOAuthLearnMore && (
        <Box flexDirection="column" marginTop={1}>
          <Alert variant="info">
            What Capgo can and can't do with the access you're about to grant.
          </Alert>
          <Newline />
          <Box flexDirection="column" marginLeft={2}>
            <Text bold>Can Capgo touch other GCP projects on my account?</Text>
            <Text>The scope allows it, but this CLI only calls APIs against the project you'll pick on the next screen. It creates one service account named <Text color="cyan">capgo-native-build</Text> in that one project and stops.</Text>
            <Newline />
            <Text bold>Will Capgo upload anything to Play Store without me knowing?</Text>
            <Text>No. The flow invites one service account into one app (the package you confirm) with release-only permissions. Future builds use that service account, not your OAuth tokens.</Text>
            <Newline />
            <Text bold>Can Capgo employees access my Google account?</Text>
            <Text>No. The refresh token never leaves your machine. Capgo's servers only serve the OAuth client ID — they never see your tokens. When provisioning finishes, the CLI asks Google to revoke that token, so even your local copy stops working.</Text>
            <Newline />
            <Text bold>What if I change my mind later?</Text>
            <Text>Revoke anytime at <Text color="cyan">myaccount.google.com/permissions</Text>, or just delete the service account in Google Cloud. Neither needs Capgo's involvement.</Text>
            <Newline />
            <Text dimColor>Capgo passed Google's OAuth verification on 2026-05-02 for these scopes. Source code: github.com/Cap-go/capgo</Text>
          </Box>
          <Newline />
          <Select
            options={[
              { label: '← Back to sign-in', value: 'back' },
            ]}
            onChange={() => setShowOAuthLearnMore(false)}
          />
        </Box>
      )}

      {step === 'google-sign-in-running' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Waiting for Google sign-in..." />
          {oauthStatusMessages.length > 0 && (
            <Box flexDirection="column" marginTop={1} marginLeft={2}>
              {oauthStatusMessages.map((msg, i) => (<Text key={i} dimColor>{msg}</Text>))}
            </Box>
          )}
        </Box>
      )}

      {/* ── Phase 3 — Play Developer account ID ── */}

      {step === 'play-developer-id-input' && playDevIdMode === 'actions' && (
        <Box flexDirection="column" marginTop={1}>
          <Alert variant="info">
            We need your Google Play Console Developer account ID.
          </Alert>
          <Newline />
          <Text>Every Google Play Developer account (the one you paid the $25 one-time fee for) has a unique numeric ID. We invite Capgo&apos;s service account into that specific account, which is how builds get uploaded to Play.</Text>
          <Newline />
          <Text>You&apos;ll find the ID in the Play Console URL after signing in:</Text>
          <Box marginLeft={2} marginTop={1}>
            <Text dimColor>{PLAY_DEVELOPERS_URL}</Text>
            <Text bold color="cyan">1234567890123456789</Text>
            <Text dimColor>/…</Text>
          </Box>
          <Newline />
          <Text dimColor>The digits after <Text color="cyan">/developers/</Text> are what we need. Copy them, or copy the whole URL — we&apos;ll parse it.</Text>
          <Newline />
          <Select
            options={[
              { label: '🌐  Open Play Console in my browser', value: 'open' },
              { label: '🎬  Watch a quick video tutorial', value: 'tutorial' },
              { label: '📝  I have my developer ID — let me paste it', value: 'manual' },
            ]}
            onChange={async (value) => {
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
        </Box>
      )}

      {step === 'play-developer-id-input' && playDevIdMode === 'input' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Paste the Play Console URL, or just the developer ID:</Text>
          <Text dimColor>Either the whole address bar value or the 16–20 digit number works.</Text>
          <Newline />
          <FilteredTextInput
            placeholder="https://play.google.com/console/u/0/developers/…"
            filter=""
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
        </Box>
      )}

      {/* ── Phase 4 — GCP project ── */}

      {step === 'gcp-projects-loading' && (
        <Box marginTop={1}><SpinnerLine text="Loading your Google Cloud projects..." /></Box>
      )}

      {step === 'gcp-projects-select' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Which Google Cloud project should host the service account?</Text>
          <Text dimColor>We'll create a `capgo-native-build` service account in the chosen project.</Text>
          <Newline />
          <Select
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
        </Box>
      )}

      {step === 'gcp-project-create-name' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Name for the new Google Cloud project:</Text>
          <Text dimColor>≤30 chars. The project ID will be auto-generated from your app ID plus a random suffix.</Text>
          <Newline />
          <FilteredTextInput
            placeholder={newProjectDisplayName || sanitizeGcpProjectDisplayName(`Capgo ${appId}`)}
            filter=""
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
        </Box>
      )}

      {step === 'android-package-select' && (
        <Box flexDirection="column" marginTop={1}>
          <Alert variant="info">
            Which Android package (applicationId) should Capgo have release access to?
          </Alert>
          <Newline />
          <Text>This is the package name the Play Console uses — it must match the <Text bold>applicationId</Text> in <Text color="cyan">{androidDir}/app/build.gradle</Text>, not the Capacitor JS-level appId (those can differ when plugins like CapacitorUpdater override the base ID).</Text>
          <Newline />
          {detectedPackageIds.length > 0 && packageSelectMode === 'choose'
            ? (
                <>
                  <Text bold>Found these in your Gradle config. Pick one, or enter a different package:</Text>
                  <Newline />
                  <Select
                    options={[
                      ...detectedPackageIds.map(id => ({
                        label: `📦  ${id}`,
                        value: id,
                      })),
                      { label: '✍️   Type a different package name', value: '__manual__' },
                    ]}
                    onChange={(value) => {
                      // Mode-switch path unmounts the <Select> synchronously,
                      // so the @inkjs/ui re-fire bug can't replay it. The
                      // package-pick path goes through async persistAndStep,
                      // which keeps the <Select> mounted long enough for the
                      // bug to spam — gate it with the per-step guard.
                      if (value === '__manual__') {
                        setPackageSelectMode('manual')
                        return
                      }
                      if (selectFiredRef.current)
                        return
                      selectFiredRef.current = true
                      const choice: AndroidPackageChoice = {
                        packageName: value,
                        source: 'gradle',
                      }
                      setAndroidPackageChoice(choice)
                      addLog(`✔ Android package — ${value}`)
                      const nextStep: AndroidOnboardingStep
                        = serviceAccountMethod === 'existing' ? 'sa-json-existing-path' : 'gcp-setup-running'
                      persistAndStep(
                        (p) => ({
                          ...p,
                          completedSteps: { ...p.completedSteps, androidPackageChosen: choice },
                        }),
                        nextStep,
                      )
                    }}
                  />
                </>
              )
            : (
                <>
                  <Text bold>Android package name:</Text>
                  <Newline />
                  <FilteredTextInput
                    placeholder="com.example.app"
                    filter=""
                    onSubmit={(val) => {
                      const name = val.trim()
                      if (!/^[a-z][\w]*(?:\.[a-z][\w]*)+$/i.test(name)) {
                        setError(`"${name}" doesn't look like a valid Android package name (e.g. com.example.app).`)
                        setRetryStep('android-package-select')
                        setStep('error')
                        return
                      }
                      const choice: AndroidPackageChoice = {
                        packageName: name,
                        source: detectedPackageIds.includes(name) ? 'gradle' : 'user-input',
                      }
                      setAndroidPackageChoice(choice)
                      addLog(`✔ Android package — ${name}`)
                      const nextStep: AndroidOnboardingStep
                        = serviceAccountMethod === 'existing' ? 'sa-json-existing-path' : 'gcp-setup-running'
                      persistAndStep(
                        (p) => ({
                          ...p,
                          completedSteps: { ...p.completedSteps, androidPackageChosen: choice },
                        }),
                        nextStep,
                      )
                    }}
                  />
                </>
              )}
        </Box>
      )}

      {step === 'gcp-setup-running' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Provisioning Google Cloud + Play Console..." />
          {setupStatus.length > 0 && (
            <Box flexDirection="column" marginTop={1} marginLeft={2}>
              {setupStatus.map((msg, i) => (<Text key={i} dimColor>{msg}</Text>))}
            </Box>
          )}
        </Box>
      )}

      {/* ── Phase 6 ── */}

      {step === 'saving-credentials' && (
        <Box marginTop={1}><SpinnerLine text="Saving credentials..." /></Box>
      )}

      {step === 'detecting-ci-secrets' && (
        <Box marginTop={1}><SpinnerLine text="Checking git hosting..." /></Box>
      )}

      {step === 'ci-secrets-setup' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Set up your git hosting CLI to upload env vars</Text>
          <Newline />
          {ciSecretSetupAdvice.map(advice => (
            <Box key={advice.target.provider} flexDirection="column" marginBottom={1}>
              <Text>{advice.target.label}</Text>
              <Text dimColor>{advice.message}</Text>
              {advice.commands.map(command => (
                <Text key={`${advice.target.provider}-${command}`} color="cyan">{command}</Text>
              ))}
            </Box>
          ))}
          <Text dimColor>Run this in another terminal, then come back here.</Text>
          <Newline />
          <Select
            options={[
              { label: 'I installed and logged in, check again', value: 'retry' },
              { label: 'Skip upload', value: 'skip' },
            ]}
            onChange={(value) => {
              setStep(value === 'retry' ? 'detecting-ci-secrets' : 'build-complete')
            }}
          />
        </Box>
      )}

      {step === 'ci-secrets-target-select' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Where should Capgo upload the build env vars?</Text>
          <Newline />
          <Select
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
              setStep(target ? 'ask-ci-secrets' : 'build-complete')
            }}
          />
        </Box>
      )}

      {step === 'ask-ci-secrets' && (
        <Box flexDirection="column" marginTop={1}>
          <SuccessLine text="Android credentials saved" />
          <Newline />
          <Text bold>
            Upload
            {' '}
            {ciSecretEntries.length}
            {' '}
            build env var
            {ciSecretEntries.length === 1 ? '' : 's'}
            {' '}
            to
            {' '}
            {getCiSecretTargetLabel(ciSecretTarget)}
            ?
          </Text>
          <Text dimColor>Capgo will check for existing names first and ask before replacing anything.</Text>
          <Newline />
          <Select
            options={[
              { label: `Upload with ${ciSecretTarget?.cli || 'CLI'}`, value: 'yes' },
              { label: 'Skip', value: 'no' },
            ]}
            onChange={(value) => {
              setStep(value === 'yes' ? 'checking-ci-secrets' : 'build-complete')
            }}
          />
        </Box>
      )}

      {step === 'checking-ci-secrets' && (
        <Box marginTop={1}><SpinnerLine text={`Checking existing env vars in ${getCiSecretTargetLabel(ciSecretTarget)}...`} /></Box>
      )}

      {step === 'confirm-ci-secret-overwrite' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">These env vars already exist and will be replaced:</Text>
          <Box flexDirection="column" marginTop={1} marginLeft={2}>
            {ciSecretExistingKeys.map(key => (
              <Text key={key}>{`• ${key}`}</Text>
            ))}
          </Box>
          <Newline />
          <Select
            options={[
              { label: 'Replace existing env vars', value: 'replace' },
              { label: 'Skip upload', value: 'skip' },
            ]}
            onChange={(value) => {
              setStep(value === 'replace' ? 'uploading-ci-secrets' : 'build-complete')
            }}
          />
        </Box>
      )}

      {step === 'uploading-ci-secrets' && (
        <Box marginTop={1}><SpinnerLine text={`Uploading env vars to ${getCiSecretTargetLabel(ciSecretTarget)}...`} /></Box>
      )}

      {step === 'ci-secrets-failed' && (
        <Box flexDirection="column" marginTop={1}>
          <ErrorLine text={ciSecretError || 'Could not upload env vars.'} />
          <Newline />
          <Text dimColor>You can continue; credentials are already saved locally.</Text>
          <Newline />
          <Select
            options={[
              { label: 'Try upload again', value: 'retry' },
              { label: 'Continue without upload', value: 'continue' },
            ]}
            onChange={(value) => {
              setStep(value === 'retry' ? (ciSecretTarget ? 'checking-ci-secrets' : 'detecting-ci-secrets') : 'build-complete')
            }}
          />
        </Box>
      )}

      {step === 'ask-build' && (
        <Box flexDirection="column" marginTop={1}>
          <SuccessLine text="Android credentials saved" />
          <Newline />
          <Text bold>Request a build now?</Text>
          <Newline />
          <Select
            options={[
              { label: '🚀  Yes, request a build', value: 'yes' },
              { label: '⏭   Not now', value: 'no' },
            ]}
            onChange={(value) => {
              if (value === 'yes')
                setStep('requesting-build')
              else
                setStep('build-complete')
            }}
          />
        </Box>
      )}

      {step === 'requesting-build' && (
        <Box flexDirection="column" marginTop={1}>
          {buildOutput.slice(-Math.max(terminalRows - 6, 5)).map((line, i) => (<Text key={i}>{line}</Text>))}
        </Box>
      )}

      {step === 'build-complete' && (
        <Box flexDirection="column" marginTop={1}>
          <SuccessLine text="Onboarding complete" />
          {ciSecretUploadSummary && (
            <>
              <Newline />
              <Text>{ciSecretUploadSummary}.</Text>
            </>
          )}
          {buildUrl && (
            <>
              <Newline />
              <Text>Track your build: <Text color="cyan" underline>{buildUrl}</Text></Text>
            </>
          )}
        </Box>
      )}

      {/* AI debug — ask the user whether to send the captured log */}
      {step === 'ai-analysis-prompt' && (
        <Box flexDirection="column" marginTop={1}>
          <ErrorLine text="Build failed." />
          <Newline />
          <Text>We can analyze the build log with Capgo AI (Kimi K2.5) and suggest a fix.</Text>
          <Newline />
          <Select
            options={[
              { label: '🤖  Debug with AI', value: 'debug' },
              { label: '⏭   Skip', value: 'skip' },
            ]}
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
        </Box>
      )}

      {/* AI debug — spinner while the edge function is running */}
      {step === 'ai-analysis-running' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Analyzing build log with Capgo AI (Kimi K2.5)..." />
        </Box>
      )}

      {/* AI debug — render the diagnosis (or fallback message), then offer
          retry-or-skip. Retry transitions back to 'requesting-build' so the
          user can rebuild after applying the AI's fix in another terminal,
          without re-running the credential wizard. Capped at MAX_AI_RETRIES. */}
      {step === 'ai-analysis-result' && (() => {
        const retriesLeft = MAX_AI_RETRIES - aiRetryCount
        const canRetry = retriesLeft > 0
        const retryLabel = retriesLeft === 1
          ? '🔄  I fixed it, retry build (last retry)'
          : `🔄  I fixed it, retry build (${retriesLeft} retries left)`
        return (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="cyan">AI analysis</Text>
            <Newline />
            {aiAnalysisText && !aiViewedFull && <Text>{aiAnalysisText}</Text>}
            {aiAnalysisText && aiViewedFull && (
              <Text dimColor>
                📖  Analysis already shown above (scroll your terminal back to re-read it).
              </Text>
            )}
            {aiResultMessage && <Text>{aiResultMessage}</Text>}
            <Newline />
            <Text color="yellow">⚠ AI can make mistakes. Always verify the diagnosis against the full log before applying the suggested fix.</Text>
            <Newline />
            {!canRetry && (
              <>
                <Text dimColor>You've used all {MAX_AI_RETRIES} retries. Exit and re-run the wizard if you need another attempt.</Text>
                <Newline />
              </>
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
              onChange={async (value) => {
                if (value === 'retry') {
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
                  setAiResultMessage(null)
                  setAiViewedFull(false)
                  setAiRetryCount(prev => prev + 1)
                  setStep('requesting-build')
                  return
                }
                setStep('build-complete')
              }}
            />
          </Box>
        )
      })()}

      {/* AI debug — scrollable viewer (see iOS sibling). */}
      {step === 'ai-analysis-result-scroll' && aiAnalysisText && (
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
      )}

      {step === 'error' && error && retryStep && (
        <Box flexDirection="column" marginTop={1}>
          <ErrorLine text={error} />
          <Newline />
          <Select
            options={[
              { label: '↻  Retry', value: 'retry' },
              { label: '✖  Exit', value: 'exit' },
            ]}
            onChange={(value) => {
              if (value === 'retry') {
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
        </Box>
      )}
    </Box>
  )
}

export default AndroidOnboardingApp
