import type { FC } from 'react'
import type { BuildLogger } from '../../request.js'
import type { DiscoveredProfile, IdentityProfileMatch, SigningIdentity } from '../macos-signing.js'
import type { ApiKeyData, CertificateData, OnboardingErrorCategory, OnboardingProgress, OnboardingStep, ProfileData } from '../types.js'
import { handleCustomMsg } from '../../qr.js'
import { spawn } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { existsSync, readFileSync } from 'node:fs'
import { copyFile, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { Alert, ProgressBar, Select } from '@inkjs/ui'
import { Box, Newline, Text, useApp, useInput } from 'ink'
import open from 'open'
// src/build/onboarding/ui/app.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { writeOnboardingSupportBundle } from '../../../onboarding-support.js'
import { formatRunnerCommand, splitRunnerCommand } from '../../../runner-command.js'
import { createSupabaseClient, findBuildCommandForProjectType, findProjectType, findSavedKeySilent, getOrganizationId, getPackageScripts, getPMAndCommand } from '../../../utils.js'
import { loadSavedCredentials, updateSavedCredentials } from '../../credentials.js'
import { requestBuildInternal } from '../../request.js'
import { CertificateLimitError, createCertificate, createProfile, deleteProfile, DuplicateProfileError, ensureBundleId, findCertIdBySha1, generateJwt, listProfilesForCert, revokeCertificate, verifyApiKey } from '../apple-api.js'
import { createP12, DEFAULT_P12_PASSWORD, generateCsr } from '../csr.js'
import { mapIosOnboardingError } from '../error-categories.js'
import { canUseFilePicker, openFilePicker } from '../file-picker.js'
import { exportP12FromKeychain, isHelperCached, isMacOS, listSigningIdentities, matchIdentitiesToProfiles, precompileSwiftHelper, scanProvisioningProfiles } from '../macos-signing.js'
import { deleteProgress, getImportEntryStep, getResumeStep, loadProgress, saveProgress } from '../progress.js'
import { getBuildOnboardingRecoveryAdvice } from '../recovery.js'
import { createCiSecretEntries, detectCiSecretTargets, getCiSecretRepoLabelAsync, getCiSecretTargetLabel, listExistingCiSecretKeysAsync, uploadCiSecretsAsync } from '../ci-secrets.js'
import type { CiSecretEntry, CiSecretSetupAdvice, CiSecretTarget } from '../ci-secrets.js'
import { defaultExportPath, exportCredentialsToEnv } from '../env-export.js'
import { trackBuilderOnboardingStep } from '../telemetry.js'
import { writeWorkflowFile, WORKFLOW_PATH } from '../workflow-writer.js'
import type { BuildScriptChoice, PackageManager } from '../workflow-generator.js'
import type { BuildCredentials } from '../../../schemas/build.js'
import {
  getPhaseLabel,

  STEP_PROGRESS,
} from '../types.js'
import { DiffSummary, Divider, ErrorLine, FilteredTextInput, FullscreenDiffViewer, Header, SecretsTable, SpinnerLine, SuccessLine } from './components.js'
import { diffLines } from '../diff-utils.js'
import type { DiffLine } from '../diff-utils.js'
import { generateWorkflow, WORKFLOW_PATH as WORKFLOW_GEN_PATH } from '../workflow-generator.js'
import { getWorkflowDiffTelemetry, trackBuildOnboardingWorkflowEvent } from '../analytics.js'
import type { BuildOnboardingWorkflowDecision, BuildOnboardingWorkflowEvent, WorkflowDiffTelemetry } from '../analytics.js'
import { buildScriptPickerOptions, normalizePackageManager } from '../workflow-ui-helpers.js'

const OUTPUT_LINE_SPLIT_RE = /\r?\n/
const CARRIAGE_RETURN_RE = /\r/g

interface LogEntry { text: string, color?: string }

interface AppProps {
  appId: string
  initialProgress: OnboardingProgress | null
  /** Resolved iOS directory from capacitor.config (defaults to 'ios') */
  iosDir: string
  /** Optional Capgo API key passed via -a/--apikey flag; takes precedence over saved key */
  apikey?: string
  terminalRows?: number
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

const OnboardingApp: FC<AppProps> = ({ appId, initialProgress, iosDir, apikey, terminalRows = 24 }) => {
  const { exit } = useApp()
  const startStep = getResumeStep(initialProgress)

  const [step, setStep] = useState<OnboardingStep>(startStep === 'welcome' ? 'welcome' : startStep)

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
    errorCategory?: OnboardingErrorCategory
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
  const [keyId, setKeyId] = useState(initialProgress?.completedSteps.apiKeyVerified?.keyId || initialProgress?.keyId || '')
  const [issuerId, setIssuerId] = useState(initialProgress?.completedSteps.apiKeyVerified?.issuerId || initialProgress?.issuerId || '')

  // Get terminal height for build output sizing
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

    // (2) Now safely skip the duplicate-step path.
    if (isDuplicateStep)
      return

    const now = Date.now()
    // Initial step (previous.step === null) and same-step error re-entries have
    // no meaningful previous-step duration.
    const durationMs = previous.step === null || previous.step === step
      ? undefined
      : now - previous.startedAt

    const eventPayload = {
      step,
      durationMs,
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

  const [teamId, setTeamId] = useState(initialProgress?.completedSteps.certificateCreated?.teamId || '')
  const [certData, setCertData] = useState<CertificateData | null>(initialProgress?.completedSteps.certificateCreated || null)
  const [profileData, setProfileData] = useState<ProfileData | null>(initialProgress?.completedSteps.profileCreated || null)
  const [buildUrl, setBuildUrl] = useState('')
  const [buildOutput, setBuildOutput] = useState<string[]>([])
  const [supportBundlePath, setSupportBundlePath] = useState<string | null>(null)
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
  const [pendingRecoveryAction, setPendingRecoveryAction] = useState<'fetching-profile' | 'create-profile-only' | null>(null)
  /**
   * Records which step triggered the shared `duplicate-profile-prompt` so the
   * `deleting-duplicate-profiles` handler routes the retry correctly. Without
   * this, an import-flow duplicate (raised from `import-create-profile-only`)
   * would retry `creating-profile` — the create-new path — which can't
   * succeed in import mode because `certData.certificateId` is never set.
   */
  const [duplicateProfileOrigin, setDuplicateProfileOrigin] = useState<'creating-profile' | 'import-create-profile-only'>('creating-profile')

  const addLog = useCallback((text: string, color = 'green') => {
    setLog(prev => [...prev, { text, color }])
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

  // Extract Key ID from .p8 filename (e.g. "AuthKey_ABC123.p8" or "ApiKey_ABC123.p8")
  function extractKeyIdFromPath(filePath: string): string {
    const match = filePath.match(/(?:Auth|Api)Key_([A-Z0-9]+)\.p8$/i)
    return match?.[1] || ''
  }

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

  // Populate log with already-completed steps from progress (including partial input)
  useEffect(() => {
    if (!initialProgress)
      return
    // Show partial input steps
    if (initialProgress.p8Path) {
      addLog(`✔ Key file selected · ${initialProgress.p8Path}`)
    }
    if (initialProgress.keyId && !initialProgress.completedSteps.apiKeyVerified) {
      addLog(`✔ Key ID · ${initialProgress.keyId}`)
    }
    if (initialProgress.issuerId && !initialProgress.completedSteps.apiKeyVerified) {
      addLog(`✔ Issuer ID · ${initialProgress.issuerId}`)
    }
    // Show fully completed steps
    const { completedSteps } = initialProgress
    if (completedSteps.apiKeyVerified) {
      addLog(`✔ API Key verified — Key: ${completedSteps.apiKeyVerified.keyId}`)
    }
    if (completedSteps.certificateCreated) {
      addLog(`✔ Distribution certificate created — Expires ${completedSteps.certificateCreated.expirationDate}`)
    }
    if (completedSteps.profileCreated) {
      addLog(`✔ Provisioning profile created — "${completedSteps.profileCreated.profileName}"`)
    }
  }, []) // Only on mount

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
    // to the Capacitor app ID for the create-new path.
    const provisioningBundleId = importMode && chosenProfile?.bundleId ? chosenProfile.bundleId : appId
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
          setStep(getImportEntryStep(await loadProgress(appId)))
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'import-scanning')
        }
      })()
    }

    if (step === 'import-compiling-helper') {
      ;(async () => {
        try {
          const startedAt = Date.now()
          await precompileSwiftHelper()
          if (cancelled)
            return
          const elapsedMs = Date.now() - startedAt
          addLog(`✔ Compiled keychain-export helper in ${elapsedMs}ms`)
          setStep('import-exporting')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'import-compiling-helper')
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

    if (step === 'import-fetching-profile') {
      ;(async () => {
        try {
          if (!chosenIdentity)
            throw new Error('Internal error: no identity chosen for profile fetch.')
          const token = await getFreshToken()
          const certId = await findCertIdBySha1(token, chosenIdentity.sha1)
          if (cancelled)
            return
          if (!certId) {
            throw new Error(
              `Apple does not have a certificate matching the Keychain identity "${chosenIdentity.name}". `
              + `Either it was revoked on Apple's side or it was never uploaded. Use "Create new" instead.`,
            )
          }
          const profiles = await listProfilesForCert(token, certId)
          if (cancelled)
            return
          if (profiles.length === 0) {
            addLog('⚠ Apple has the cert but no profiles linked to it — try "Create new profile" instead.', 'yellow')
            setStep('import-no-match-recovery')
            return
          }
          // Synthesize DiscoveredProfile entries from the Apple-side data so
          // they can be picked through the normal `import-pick-profile` UI.
          // path is left empty; the export step reads profileBase64 directly.
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
            // Embed the base64 so the export step can use it without reading from disk
            profileBase64: p.profileContent,
          } as DiscoveredProfile & { profileBase64: string }))
          // Inject into the match list so import-pick-profile shows them
          setImportMatches(prev => prev.map(m => m.identity.sha1 === chosenIdentity.sha1
            ? { ...m, profiles: [...m.profiles, ...synthesized] }
            : m,
          ))
          addLog(`✔ Apple returned ${profiles.length} profile${profiles.length === 1 ? '' : 's'} for this cert`)
          setStep('import-pick-profile')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'import-fetching-profile')
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
          const { bundleIdResourceId } = await ensureBundleId(token, appId)
          if (cancelled)
            return
          const profile = await createProfile(token, bundleIdResourceId, certId, appId)
          if (cancelled)
            return
          // Use the freshly-created profile directly as the chosen profile.
          const synthesized = {
            path: '',
            uuid: profile.profileId,
            name: profile.profileName,
            applicationIdentifier: '',
            bundleId: appId,
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
            addLog(`✔ Key file selected · ${selected}`)
            void savePartialProgress({ p8Path: selected })
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
            setStep('import-pick-identity')
          }
          else {
            setStep('creating-certificate')
          }
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'verifying-key')
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
          const { bundleIdResourceId } = await ensureBundleId(token, appId)
          const profile = await createProfile(token, bundleIdResourceId, certData!.certificateId, appId)
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
            catch {
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
            buildLog: (msg: string) => setBuildOutput(prev => [...prev, msg]),
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

    if (step === 'build-complete') {
      setBuildOutput([])
      // Exit immediately after rendering the final screen
      const timer = setTimeout(() => {
        if (!cancelled)
          exit()
      }, 100)
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }

    return () => {
      cancelled = true
    }
  }, [step])

  // ── Render ──

  const progress = STEP_PROGRESS[step] ?? 0
  const phaseLabel = getPhaseLabel(step)
  // Tall fullscreen-style steps. Their content overflows the wizard chrome on
  // smaller terminals and Ink can leak the previous frame above the new one
  // on transition. Hide chrome so each tall step renders cleanly.
  // The whole post-build GHA flow runs WITHOUT Progress + Logs so transitions
  // don't flash chrome in and out and leftover content from a previous tall
  // step doesn't bleed into the next short step's live area. The Header
  // ("🚀 Capgo Cloud Build · Onboarding") stays visible for branding /
  // orientation — only `requesting-build` (which streams live build output
  // and needs the full terminal) hides the Header.
  const tallStep = step === 'requesting-build'
    || step === 'detecting-ci-secrets'
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
  const showProgress = step !== 'welcome' && step !== 'platform-select' && step !== 'adding-platform' && step !== 'no-platform' && step !== 'error' && step !== 'build-complete' && !tallStep
  // Header stays on every tall step except `requesting-build` (which streams
  // multi-line build output and would otherwise fight for vertical space).
  const showHeader = step !== 'requesting-build' && step !== 'view-workflow-diff'
  const showLog = step !== 'build-complete' && !tallStep
  const recoveryAdvice = error
    ? getBuildOnboardingRecoveryAdvice(error, retryStep, pm.runner, appId)
    : null
  return (
    <Box flexDirection="column" padding={1}>
      {showHeader && <Header />}

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

      {/* Completed steps log */}
      {showLog && log.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {log.map((entry, i) => (
            <Text key={i} color={entry.color as any}>{entry.text}</Text>
          ))}
        </Box>
      )}

      {/* Welcome */}
      {step === 'welcome' && (
        <Box marginTop={1} justifyContent="center">
          <SpinnerLine text="Detecting project..." />
        </Box>
      )}

      {/* Platform select */}
      {step === 'platform-select' && (
        <Box flexDirection="column" marginTop={1}>
          <SuccessLine text="Detected Capacitor project" detail={appId} />
          <Newline />
          <Text bold>Which platform do you want to set up?</Text>
          <Newline />
          <Select
            options={[
              { label: '🍎  iOS', value: 'ios' },
              { label: '🤖  Android', value: 'android' },
            ]}
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
        </Box>
      )}

      {/* No platform directory */}
      {step === 'no-platform' && (
        <Box flexDirection="column" marginTop={1}>
          <ErrorLine text={`No ${iosDir}/ directory found.`} />
          <Newline />
          <Text>This onboarding flow needs a generated native iOS project before credentials can be created.</Text>
          <Newline />
          <Text dimColor>{`Suggested commands: ${addIosCommand} && ${syncIosCommand}`}</Text>
          <Newline />
          <Select
            options={[
              { label: `🛠  Run ${addIosCommand} now`, value: 'run' },
              { label: '🔄  I already fixed it, re-check', value: 'recheck' },
              { label: '✖  Exit onboarding', value: 'exit' },
            ]}
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
        </Box>
      )}

      {step === 'adding-platform' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text={`Running ${addIosCommand}...`} />
          <Text dimColor>{`If this still fails, try ${doctorCommand} and keep the support bundle path from the error screen.`}</Text>
        </Box>
      )}

      {/* Existing credentials warning */}
      {step === 'credentials-exist' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">
            ⚠ iOS credentials already exist for
            {appId}
          </Text>
          <Newline />
          <Text>Onboarding will create new certificates and profiles, replacing your existing credentials.</Text>
          <Newline />
          <Select
            options={[
              { label: '📦  Start fresh (backup existing credentials first)', value: 'backup' },
              { label: '✖  Exit onboarding', value: 'exit' },
            ]}
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
        </Box>
      )}

      {/* Backing up credentials */}
      {step === 'backing-up' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Backing up existing credentials..." />
        </Box>
      )}

      {/* Setup-method fork (macOS only) */}
      {step === 'setup-method-select' && (
        <Box flexDirection="column" marginTop={1}>
          <Alert variant="info">
            How do you want to set up iOS credentials?
          </Alert>
          <Newline />
          <Select
            options={[
              { label: '🆕  Create new via App Store Connect API', value: 'create' },
              { label: '📥  Import existing from this Mac (Keychain + Xcode profiles)', value: 'import' },
            ]}
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
              existing.setupMethod = value === 'import' ? 'import-existing' : 'create-new'
              await saveProgress(appId, existing)

              if (value === 'import') {
                setImportMode(true)
                setStep('import-scanning')
              }
              else {
                setImportMode(false)
                setStep('api-key-instructions')
              }
            }}
          />
          <Newline />
          <Text dimColor>
            Tip: Importing reuses the certificate Xcode already installed,
            so it doesn't count against Apple's 3-cert limit.
          </Text>
        </Box>
      )}

      {/* Import: scanning */}
      {step === 'import-scanning' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Scanning Keychain and provisioning profiles..." />
          <Text dimColor>This is read-only — no Keychain password prompt yet.</Text>
        </Box>
      )}

      {/* Import: distribution mode (now FIRST visible step in import flow) */}
      {step === 'import-distribution-mode' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>How will Capgo distribute your build?</Text>
          <Newline />
          <Text dimColor>
            • App Store: builds upload to TestFlight automatically (requires an App Store Connect API key)
          </Text>
          <Text dimColor>
            • Ad-hoc: builds are signed and either downloaded from Capgo or installed via QR. No ASC key needed.
          </Text>
          <Newline />
          <Select
            options={[
              { label: '🛫  App Store / TestFlight', value: 'app_store' },
              { label: '📦  Ad-hoc (no TestFlight upload)', value: 'ad_hoc' },
              { label: '↩️   Cancel and use Create new instead', value: '__cancel__' },
            ]}
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
              addLog(`✔ Distribution · ${mode}`)
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
                setStep('import-pick-identity')
              }
            }}
          />
        </Box>
      )}

      {/* Import: pick identity */}
      {step === 'import-pick-identity' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>
            Found
            {' '}
            {importMatches.length}
            {' '}
            distribution identity
            {importMatches.length === 1 ? '' : 'ies'}
            {' '}
            in your Keychain. Pick one:
          </Text>
          <Newline />
          <Select
            options={[
              ...importMatches.map((m) => {
                const matchCount = m.profiles.length
                const label = matchCount > 0
                  ? `🔑  ${m.identity.name} · ${matchCount} matching profile${matchCount === 1 ? '' : 's'}`
                  : `🔑  ${m.identity.name} · ⚠ no matching profiles on this Mac (recovery available)`
                return { label, value: m.identity.sha1 }
              }),
              { label: '↩️   Cancel and use Create new instead', value: '__cancel__' },
            ]}
            onChange={async (value) => {
              if (value === '__cancel__') {
                setImportMode(false)
                // Persist the switch so a CLI restart doesn't resume into
                // the import flow the user just abandoned. Mirrors the same
                // pattern in import-distribution-mode's cancel path.
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
              addLog(`✔ Identity · ${match.identity.name}`)
              if (match.profiles.length === 0) {
                // No local match — offer recovery instead of dead-ending
                setStep('import-no-match-recovery')
                return
              }
              setStep('import-pick-profile')
            }}
          />
        </Box>
      )}

      {/* Import: pick profile */}
      {step === 'import-pick-profile' && chosenIdentity && (() => {
        const allMatchedProfiles = importMatches.find(m => m.identity.sha1 === chosenIdentity.sha1)?.profiles || []
        // Filter to profiles that are actually usable for THIS app + THIS
        // distribution mode. Without this filter, a user with a cert reused
        // across multiple apps (or with both app_store and ad_hoc profiles
        // linked to one cert) could pick a profile whose bundleId !== appId
        // or whose profileType !== importDistribution. `doSaveCredentials`
        // would then persist a mismatched provisioning_map / distribution
        // pair, producing unusable signing credentials.
        const matchedProfiles = allMatchedProfiles.filter(p =>
          p.bundleId === appId
          && (!importDistribution || p.profileType === importDistribution),
        )
        const droppedCount = allMatchedProfiles.length - matchedProfiles.length
        return (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>
              Pick a provisioning profile (
              {matchedProfiles.length}
              {' '}
              matching this app's bundle ID
              {importDistribution ? ` and ${importDistribution} distribution` : ''}
              ):
            </Text>
            {droppedCount > 0 && (
              <Text dimColor>
                (
                {droppedCount}
                {' '}
                other profile
                {droppedCount === 1 ? '' : 's'}
                {' '}
                hidden — wrong bundle ID or distribution mode)
              </Text>
            )}
            <Newline />
            <Select
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
                // silently save bad creds.
                if (profile.bundleId !== appId
                  || (importDistribution && profile.profileType !== importDistribution)) {
                  handleError(
                    new Error(
                      `Profile "${profile.name}" doesn't match this app: `
                      + `bundle ${profile.bundleId} (expected ${appId}), `
                      + `type ${profile.profileType} (expected ${importDistribution ?? 'any'}).`,
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
          </Box>
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
          <Box flexDirection="column" marginTop={1}>
            <Alert variant="warning">
              No provisioning profile on this Mac is linked to "
              {chosenIdentity.name}
              ".
            </Alert>
            <Newline />
            <Text dimColor>
              The cert is in your Keychain but the matching profile isn't on disk. Pick a recovery path:
            </Text>
            <Newline />
            <Select
              options={[
                {
                  label: `🌐  Open Apple Developer Portal (download manually, then re-scan)`,
                  value: 'browser',
                },
                {
                  label: hasAscKey
                    ? `🔍  Fetch matching profile from Apple now`
                    : `🔍  Provide ASC API key, then fetch profile from Apple`,
                  value: 'fetch',
                },
                ...(canCreateProfile
                  ? [{
                      label: hasAscKey
                        ? `✨  Create a new App Store profile for this cert via Apple`
                        : `✨  Provide ASC API key, then create a new App Store profile for this cert`,
                      value: 'create',
                    }]
                  : []),
                { label: '↩️   Back to identity selection', value: 'back' },
              ]}
              onChange={(value) => {
                if (value === 'browser') {
                  open('https://developer.apple.com/account/resources/profiles/list')
                  addLog('✔ Opened Apple Developer Portal — re-running scan in 5s', 'yellow')
                  setTimeout(() => {
                    if (!exitRequestedRef.current)
                      setStep('import-scanning')
                  }, 5000)
                  return
                }
                if (value === 'back') {
                  setStep('import-pick-identity')
                  return
                }
                if (value === 'fetch' || value === 'create') {
                  const action = value === 'fetch' ? 'fetching-profile' : 'create-profile-only'
                  if (hasAscKey) {
                    setStep(`import-${action}` as OnboardingStep)
                  }
                  else {
                    setPendingRecoveryAction(action)
                    setStep('api-key-instructions')
                  }
                }
              }}
            />
          </Box>
        )
      })()}

      {/* Import: fetching profile from Apple by cert SHA1 */}
      {step === 'import-fetching-profile' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Looking up your cert on Apple and listing its profiles..." />
        </Box>
      )}

      {/* Import: D2 — creating a new profile via Apple for the existing cert */}
      {step === 'import-create-profile-only' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Creating a new App Store profile via Apple for your existing certificate..." />
          <Text dimColor>
            (Skipping cert creation — using the cert already in your Keychain.)
          </Text>
        </Box>
      )}

      {/* Import: export warning (heads-up before the one Keychain dialog) */}
      {step === 'import-export-warning' && chosenIdentity && (
        <Box flexDirection="column" marginTop={1}>
          <Alert variant="warning">
            macOS will now ask permission to access your private key.
          </Alert>
          <Newline />
          <Box flexDirection="column" marginLeft={2}>
            <Text>
              <Text bold color="white">1.</Text>
              {' '}
              A Keychain dialog will pop up asking
              {' '}
              <Text bold>"security wants to use your confidential information"</Text>
            </Text>
            <Text>
              <Text bold color="white">2.</Text>
              {' '}
              Click
              {' '}
              <Text bold color="green">"Always Allow"</Text>
              {' '}
              so it doesn't ask again on retry
            </Text>
            <Text>
              <Text bold color="white">3.</Text>
              {' '}
              That's the only prompt — the export is otherwise non-interactive
            </Text>
          </Box>
          <Newline />
          <Select
            options={[
              { label: `🔓  Export "${chosenIdentity.name}" now`, value: 'go' },
              { label: '↩️   Back', value: 'back' },
              { label: '✖  Exit onboarding', value: 'exit' },
            ]}
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
        </Box>
      )}

      {/* Import: compiling helper (one-time per CLI version) */}
      {step === 'import-compiling-helper' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Compiling keychain-export helper (one-time, ~2-3s)..." />
          <Newline />
          <Box flexDirection="column" marginLeft={2}>
            <Text dimColor>
              We ship a small Swift program (~350 lines) that wraps Apple's
              Security framework. It compiles via
              {' '}
              <Text bold>swiftc</Text>
              {' '}
              into your OS temp folder.
            </Text>
            <Text dimColor>
              The result is cached for this CLI version — future runs of
              {' '}
              <Text bold>build init</Text>
              {' '}
              skip this step.
            </Text>
          </Box>
        </Box>
      )}

      {/* Import: exporting (the one Keychain prompt happens here) */}
      {step === 'import-exporting' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Exporting from Keychain — check for the macOS dialog..." />
          <Text dimColor>
            If you don't see a dialog, look behind other windows or check the menu bar.
          </Text>
        </Box>
      )}

      {/* API key instructions + .p8 input */}
      {step === 'api-key-instructions' && (
        <Box flexDirection="column" marginTop={1}>
          <Alert variant="info">
            We need an App Store Connect API key to manage certificates and profiles for you.
          </Alert>
          <Newline />
          <Box flexDirection="column" marginLeft={2}>
            <Text>
              <Text bold color="white">1.</Text>
              {' '}
              Go to
              {' '}
              <Text color="cyan" underline>appstoreconnect.apple.com/access/integrations/api</Text>
            </Text>
            <Text>
              <Text bold color="white">2.</Text>
              {' '}
              Click
              {' '}
              <Text bold>"Generate API Key"</Text>
            </Text>
            <Text>
              <Text bold color="white">3.</Text>
              {' '}
              Name it
              {' '}
              <Text color="yellow">"Capgo Builder"</Text>
              {' '}
              · Access:
              {' '}
              <Text bold color="green">"Admin"</Text>
            </Text>
            <Text>
              <Text bold color="white">4.</Text>
              {' '}
              Download the
              {' '}
              <Text bold>.p8</Text>
              {' '}
              file
            </Text>
          </Box>
          <Newline />
          <Box>
            <Text dimColor>Press </Text>
            <Text bold color="white">Ctrl+O</Text>
            <Text dimColor> to open App Store Connect in your browser</Text>
          </Box>
          <Newline />
          <Divider />
          <Newline />
          {canUseFilePicker() && (
            <>
              <Text bold>How do you want to provide the .p8 file?</Text>
              <Newline />
              <Select
                options={[
                  { label: '📂  Open file picker', value: 'picker' },
                  { label: '📝  Type the path', value: 'manual' },
                ]}
                onChange={(value) => {
                  if (value === 'picker') {
                    setStep('p8-method-select')
                  }
                  else {
                    setStep('input-p8-path')
                  }
                }}
              />
            </>
          )}
          {!canUseFilePicker() && (
            <>
              <Text bold>Path to your .p8 file:</Text>
              <Box marginTop={1}>
                <FilteredTextInput
                  placeholder="~/Downloads/AuthKey_XXXXXXXXXX.p8"
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
                      void savePartialProgress({ p8Path: filePath })
                      setStep('input-key-id')
                    }
                    catch {
                      handleError(new Error(`File not found: ${filePath}`), 'api-key-instructions')
                    }
                  }}
                />
              </Box>
            </>
          )}
        </Box>
      )}

      {/* File picker opening */}
      {step === 'p8-method-select' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Opening file picker..." />
        </Box>
      )}

      {/* Manual .p8 path input */}
      {step === 'input-p8-path' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Path to your .p8 file:</Text>
          <Box marginTop={1}>
            <FilteredTextInput
              placeholder="~/Downloads/AuthKey_XXXXXXXXXX.p8"
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
                  void savePartialProgress({ p8Path: filePath })
                  setStep('input-key-id')
                }
                catch {
                  handleError(new Error(`File not found: ${value}`), 'input-p8-path')
                }
              }}
            />
          </Box>
        </Box>
      )}

      {/* Key ID */}
      {step === 'input-key-id' && (
        <Box flexDirection="column" marginTop={1}>
          {keyId
            ? (
                <>
                  <Text bold>
                    Key ID
                    {' '}
                    <Text dimColor>(detected from filename)</Text>
                    :
                  </Text>
                  <Box marginTop={1}>
                    <Text color="green">✔ </Text>
                    <Text>{keyId}</Text>
                    <Text dimColor> — press Enter to confirm, or type a different one</Text>
                  </Box>
                  <Box marginTop={1}>
                    <FilteredTextInput
                      placeholder={keyId}
                      onSubmit={(value) => {
                        const finalKeyId = (value || keyId).trim()
                        setKeyId(finalKeyId)
                        addLog(`✔ Key ID · ${finalKeyId}`)
                        void savePartialProgress({ keyId: finalKeyId })
                        setStep('input-issuer-id')
                      }}
                    />
                  </Box>
                </>
              )
            : (
                <>
                  <Text bold>
                    Key ID
                    {' '}
                    <Text dimColor>(shown next to the key name in App Store Connect)</Text>
                    :
                  </Text>
                  <Box marginTop={1}>
                    <FilteredTextInput
                      placeholder="ABC123DEF"
                      onSubmit={(value) => {
                        const cleaned = value.trim()
                        if (!cleaned)
                          return
                        setKeyId(cleaned)
                        addLog(`✔ Key ID · ${cleaned}`)
                        void savePartialProgress({ keyId: cleaned })
                        setStep('input-issuer-id')
                      }}
                    />
                  </Box>
                </>
              )}
        </Box>
      )}

      {/* Issuer ID */}
      {step === 'input-issuer-id' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>
            Issuer ID
            {' '}
            <Text dimColor>(UUID at the very top of the API keys page, above the key list)</Text>
            :
          </Text>
          <Newline />
          <Box>
            <Text dimColor>Press </Text>
            <Text bold color="white">Ctrl+O</Text>
            <Text dimColor> to open App Store Connect in your browser</Text>
          </Box>
          <Box marginTop={1}>
            <FilteredTextInput
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              onSubmit={(value) => {
                const cleaned = value.trim()
                if (!cleaned)
                  return
                setIssuerId(cleaned)
                addLog(`✔ Issuer ID · ${cleaned}`)
                void savePartialProgress({ issuerId: cleaned })
                setStep('verifying-key')
              }}
            />
          </Box>
        </Box>
      )}

      {/* Verifying */}
      {step === 'verifying-key' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Verifying API key with Apple..." />
        </Box>
      )}

      {/* Creating certificate */}
      {step === 'creating-certificate' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Generating signing key and CSR..." />
          <SpinnerLine text="Creating iOS distribution certificate..." />
        </Box>
      )}

      {/* Certificate limit — ask which to revoke */}
      {step === 'cert-limit-prompt' && (
        <Box flexDirection="column" marginTop={1}>
          <ErrorLine text={`iOS distribution certificate limit reached (${existingCerts.length} existing).`} />
          <Newline />
          <Text bold>Select a certificate to revoke:</Text>
          <Newline />
          <Select
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
        </Box>
      )}

      {/* Revoking certificate */}
      {step === 'revoking-certificate' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Revoking old certificate..." />
        </Box>
      )}

      {/* Creating profile */}
      {step === 'creating-profile' && (
        <Box flexDirection="column" marginTop={1}>
          <SuccessLine text="Bundle ID" detail={appId} />
          <Newline />
          <SpinnerLine text="Creating App Store provisioning profile..." />
        </Box>
      )}

      {/* Duplicate profile prompt */}
      {step === 'duplicate-profile-prompt' && (
        <Box flexDirection="column" marginTop={1}>
          <ErrorLine text={`Found ${duplicateProfiles.length} existing Capgo profile(s) for this app.`} />
          <Newline />
          <Text bold>Delete old profiles and create a new one?</Text>
          <Newline />
          <Select
            options={[
              { label: '✔  Yes, delete old profiles and recreate', value: 'delete' },
              { label: '✖  No, exit onboarding', value: 'exit' },
            ]}
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
        </Box>
      )}

      {/* Deleting duplicate profiles */}
      {step === 'deleting-duplicate-profiles' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text={`Deleting ${duplicateProfiles.length} old profile(s)...`} />
        </Box>
      )}

      {/* Saving credentials */}
      {step === 'saving-credentials' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Saving credentials..." />
        </Box>
      )}

      {step === 'detecting-ci-secrets' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Checking git hosting..." />
        </Box>
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
              if (!target) {
                setStep('build-complete')
                return
              }
              setStep(target.provider === 'github' ? 'ask-github-actions-setup' : 'ask-ci-secrets')
            }}
          />
        </Box>
      )}

      {step === 'ask-ci-secrets' && (
        <Box flexDirection="column" marginTop={1}>
          <SuccessLine text="Credentials saved" />
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

      {step === 'view-workflow-diff' && previewDiff.length > 0 && (
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
      )}

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
              <Newline />
              <Text>
                Repository:
                {' '}
                <Text bold color="cyan">{ciSecretRepoLabel}</Text>
              </Text>
              <Text dimColor>(resolved via `gh repo view` from this directory)</Text>
              <Newline />
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
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine
            text={ciSecretUploadProgress
              ? `Pushing ${ciSecretUploadProgress.current} of ${ciSecretUploadProgress.total}: ${ciSecretUploadProgress.key}…`
              : `Uploading env vars to ${ciSecretRepoLabel ?? getCiSecretTargetLabel(ciSecretTarget)}…`}
          />
        </Box>
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

      {/* Ask to build */}
      {step === 'ask-build' && (
        <Box flexDirection="column" marginTop={1}>
          <SuccessLine text="Credentials saved" />
          <Newline />
          <Text bold>Start your first cloud build now?</Text>
          <Newline />
          <Select
            options={[
              { label: '🚀  Yes, build now', value: 'yes' },
              { label: '⏭️   No, I\'ll build later', value: 'no' },
            ]}
            onChange={(value) => {
              if (value === 'yes') {
                setStep('requesting-build')
              }
              else {
                setStep('build-complete')
              }
            }}
          />
        </Box>
      )}

      {/* Requesting build — live output fills terminal, spinner at bottom */}
      {step === 'requesting-build' && (() => {
        // 3 lines overhead: 1 divider + 1 spinner + 1 padding
        const visibleLines = Math.max(5, terminalRows - 3)
        return (
          <Box flexDirection="column" marginTop={1}>
            {buildOutput.slice(-visibleLines).map((line, i) => {
              const isSuccess = line.startsWith('✔')
              const isError = line.startsWith('✖') || line.startsWith('❌')
              const isWarn = line.startsWith('⚠')
              const isBold = line.startsWith('✔ Build') || line.startsWith('✔ Created') || line.startsWith('Uploading:')
              const color = isSuccess ? 'green' : isError ? 'red' : isWarn ? 'yellow' : undefined
              return (
                <Text key={i} color={color} dimColor={!color && !isBold} bold={isBold}>
                  {line}
                </Text>
              )
            })}
            <Divider />
            <Box>
              <SpinnerLine text="Building..." />
              <Text dimColor>
                {' '}
                (
                {buildOutput.length}
                {' '}
                lines)
              </Text>
            </Box>
          </Box>
        )
      })()}

      {/* Error with retry */}
      {step === 'error' && error && (
        <Box flexDirection="column" marginTop={1}>
          <ErrorLine text={error} />
          <Newline />
          {recoveryAdvice && (
            <>
              <Text bold>Recovery plan</Text>
              <Box flexDirection="column" marginTop={1} marginLeft={2}>
                {recoveryAdvice.summary.map(line => (
                  <Text key={`recovery-summary-${line}`}>{`• ${line}`}</Text>
                ))}
              </Box>
              {recoveryAdvice.commands.length > 0 && (
                <>
                  <Newline />
                  <Text bold>Helpful commands</Text>
                  <Box flexDirection="column" marginTop={1} marginLeft={2}>
                    {recoveryAdvice.commands.map(command => (
                      <Text key={`recovery-command-${command}`} dimColor>{command}</Text>
                    ))}
                  </Box>
                </>
              )}
              {recoveryAdvice.docs.length > 0 && (
                <>
                  <Newline />
                  <Text bold>Docs</Text>
                  <Box flexDirection="column" marginTop={1} marginLeft={2}>
                    {recoveryAdvice.docs.map(doc => (
                      <Text key={`recovery-doc-${doc}`} color="cyan">{doc}</Text>
                    ))}
                  </Box>
                </>
              )}
            </>
          )}
          {supportBundlePath && (
            <>
              <Newline />
              <Text bold>Support bundle</Text>
              <Text dimColor>{supportBundlePath}</Text>
            </>
          )}
          <Newline />
          {retryStep && (
            <>
              <Text bold>What do you want to do?</Text>
              <Newline />
              <Select
                options={[
                  { label: '🔄  Try again', value: 'retry' },
                  { label: '↩️   Restart onboarding', value: 'restart' },
                  { label: '❌  Exit', value: 'exit' },
                ]}
                onChange={async (value) => {
                  if (value === 'retry') {
                    setError(null)
                    errorCategoryRef.current = undefined
                    pickerOpenedRef.current = false
                    setStep(retryStep)
                  }
                  else if (value === 'restart') {
                    // Wipe persisted progress so the next run starts truly fresh.
                    // Without this, getResumeStep would skip the user back to
                    // wherever they were — re-triggering the same broken state.
                    await deleteProgress(appId).catch(() => { /* best-effort */ })
                    // Also reset all in-memory import-flow state so a previously-
                    // chosen identity/profile/distribution doesn't leak across.
                    setImportMode(false)
                    setImportMatches([])
                    setImportProfiles([])
                    setChosenIdentity(null)
                    setChosenProfile(null)
                    setImportDistribution(null)
                    setImportedP12Password('')
                    setPendingRecoveryAction(null)
                    setCertData(null)
                    setProfileData(null)
                    setError(null)
                    errorCategoryRef.current = undefined
                    setRetryCount(0)
                    pickerOpenedRef.current = false
                    setSupportBundlePath(null)
                    addLog('↩️  Onboarding reset — starting fresh', 'yellow')
                    setStep('welcome')
                  }
                  else {
                    setError(`Run \`${buildInitCommand}\` to resume.`)
                    exitOnboarding()
                  }
                }}
              />
            </>
          )}
        </Box>
      )}

      {/* Done */}
      {step === 'build-complete' && (
        <Box flexDirection="column" marginTop={1}>
          <Newline />
          <Box
            borderStyle="round"
            borderColor="green"
            paddingX={3}
            paddingY={1}
            flexDirection="column"
            alignItems="center"
          >
            <Text bold color="green">
              🎉  You're all set!
            </Text>
            <Newline />
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
            <Newline />
            {ciSecretUploadSummary && (
              <>
                <Text>{ciSecretUploadSummary}.</Text>
                <Newline />
              </>
            )}
            {workflowWrittenPath && (
              <>
                <Text color="green">
                  ✔ Workflow file written:
                  {' '}
                  {workflowWrittenPath}
                </Text>
                <Text dimColor>
                  Dispatch it from GitHub Actions to kick off a build, or run
                  {' '}
                  <Text bold>{buildRequestCommand}</Text>
                  {' '}
                  locally.
                </Text>
                <Newline />
              </>
            )}
            {envExportPath && (
              <>
                <Text color="green">
                  ✔ Credentials exported to:
                  {' '}
                  {envExportPath}
                </Text>
                <Text dimColor>
                  When you're ready, push them with
                  {' '}
                  <Text bold>{`gh secret set -f ${envExportPath.split('/').slice(-1)[0]}`}</Text>
                  {' '}
                  (or your CI's equivalent). Add the file to
                  {' '}
                  <Text bold>.gitignore</Text>
                  {' '}
                  — never commit it.
                </Text>
                <Newline />
              </>
            )}
            {envExportError && (
              <>
                <Text color="yellow">
                  ⚠ Could not export .env:
                  {' '}
                  {envExportError}
                </Text>
                <Newline />
              </>
            )}
            <Text dimColor>
              Run
              {' '}
              <Text bold color="white">{buildRequestCommand}</Text>
              {' '}
              anytime to start a build.
            </Text>
          </Box>
          <Newline />
        </Box>
      )}
    </Box>
  )
}

export default OnboardingApp
