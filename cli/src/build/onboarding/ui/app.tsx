import type { FC } from 'react'
import type { BuildLogger } from '../../request.js'
import type { DiscoveredProfile, IdentityProfileMatch, SigningIdentity } from '../macos-signing.js'
import type { ApiKeyData, CertificateData, EnrichedIdentityAvailability, OnboardingProgress, OnboardingStep, ProfileData } from '../types.js'
import { handleCustomMsg } from '../../qr.js'
import { spawn } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { copyFile, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { Alert, ProgressBar, Select } from '@inkjs/ui'
import { Box, Newline, Text, useApp, useInput, useStdout } from 'ink'
import open from 'open'
// src/build/onboarding/ui/app.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { writeOnboardingSupportBundle } from '../../../onboarding-support.js'
import { formatRunnerCommand, splitRunnerCommand } from '../../../runner-command.js'
import { findSavedKeySilent, getPMAndCommand } from '../../../utils.js'
import { loadSavedCredentials, updateSavedCredentials } from '../../credentials.js'
import { requestBuildInternal } from '../../request.js'
import { CertificateLimitError, classifyCertAvailability, createCertificate, createProfile, deleteProfile, DuplicateProfileError, ensureBundleId, findCertBySha1, findCertIdBySha1, generateJwt, listProfilesForCert, revokeCertificate, verifyApiKey } from '../apple-api.js'
import { detectIosBundleIds } from '../bundle-id-detector.js'
import { createP12, DEFAULT_P12_PASSWORD, generateCsr } from '../csr.js'
import { canUseFilePicker, openFilePicker, openMobileprovisionPicker } from '../file-picker.js'
import { parseMobileprovisionDetailed } from '../../mobileprovision-parser.js'
import { exportP12FromKeychain, filterProfilesForApp, isHelperCached, isMacOS, listSigningIdentities, matchIdentitiesToProfiles, precompileSwiftHelper, scanProvisioningProfiles } from '../macos-signing.js'
import { deleteProgress, getImportEntryStep, getResumeStep, loadProgress, saveProgress } from '../progress.js'
import { getBuildOnboardingRecoveryAdvice } from '../recovery.js'
import { createCiSecretEntries, detectCiSecretTargets, getCiSecretTargetLabel, listExistingCiSecretKeys, uploadCiSecrets } from '../ci-secrets.js'
import type { CiSecretEntry, CiSecretSetupAdvice, CiSecretTarget } from '../ci-secrets.js'
import {
  getPhaseLabel,

  STEP_PROGRESS,
} from '../types.js'
import { Divider, ErrorLine, FilteredTextInput, Header, SpinnerLine, SuccessLine, Table } from './components.js'

const OUTPUT_LINE_SPLIT_RE = /\r?\n/
const CARRIAGE_RETURN_RE = /\r/g

interface LogEntry { text: string, color?: string }

interface AppProps {
  /**
   * Capgo lookup key (used for progress files, saved credentials, and the
   * Capgo SaaS build API). This is what `getAppId()` returns — which prefers
   * `config.plugins.CapacitorUpdater.appId` over `config.appId` so dev-tunnel
   * sandboxes can override the Capgo-side identifier without renaming the
   * iOS bundle.
   *
   * Do NOT use this for Apple-side operations — see `iosBundleIdInitial`.
   */
  appId: string
  /**
   * Default value for the iOS bundle ID used for Apple-side operations
   * (cert lookup, profile filtering, ensureBundleId, createProfile, and the
   * provisioning_map key). Sourced from `config.appId` directly because
   * `cap sync` writes that into project.pbxproj's
   * PRODUCT_BUNDLE_IDENTIFIER — not the plugin override.
   *
   * When `config.appId` is missing, command.ts falls back to `appId` so
   * the prop is always a valid string.
   */
  iosBundleIdInitial: string
  initialProgress: OnboardingProgress | null
  /** Resolved iOS directory from capacitor.config (defaults to 'ios') */
  iosDir: string
  /** Optional Capgo API key passed via -a/--apikey flag; takes precedence over saved key */
  apikey?: string
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

const OnboardingApp: FC<AppProps> = ({ appId, iosBundleIdInitial, initialProgress, iosDir, apikey }) => {
  const { exit } = useApp()
  const startStep = getResumeStep(initialProgress)

  const [step, setStep] = useState<OnboardingStep>(startStep === 'welcome' ? 'welcome' : startStep)
  const [log, setLog] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [retryStep, setRetryStep] = useState<OnboardingStep | null>(null)
  // askOverwrite removed — credential check happens at start now
  const [duplicateProfiles, setDuplicateProfiles] = useState<Array<{ id: string, name: string, profileType: string }>>([])
  const [existingCerts, setExistingCerts] = useState<Array<{ id: string, name: string, serialNumber: string, expirationDate: string }>>([])
  const [certToRevoke, setCertToRevoke] = useState<string | null>(null)
  const pickerOpenedRef = useRef(false)
  /**
   * Separate guard for the mobileprovision picker so it doesn't re-open on
   * re-render. Reset to false whenever the user navigates away from the
   * import-provide-profile-path step (e.g. cancels back to recovery menu).
   */
  const mobileprovisionPickerOpenedRef = useRef(false)
  const exitRequestedRef = useRef(false)
  // overwriteConfirmedRef removed — credential check happens at start now

  // Collected data — restore p8Path from progress if resuming
  const [p8Path, setP8Path] = useState(initialProgress?.p8Path || '')
  const [p8Content, _setP8Content] = useState('')
  const [keyId, setKeyId] = useState(initialProgress?.completedSteps.apiKeyVerified?.keyId || initialProgress?.keyId || '')
  const [issuerId, setIssuerId] = useState(initialProgress?.completedSteps.apiKeyVerified?.issuerId || initialProgress?.issuerId || '')

  // Get terminal height for build output sizing
  const { stdout } = useStdout()
  const terminalRows = stdout?.rows ?? 24

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
  const [ciSecretError, setCiSecretError] = useState<string | null>(null)
  const [ciSecretUploadSummary, setCiSecretUploadSummary] = useState<string | null>(null)

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
  const [pendingRecoveryAction, setPendingRecoveryAction] = useState<'create-profile-only' | null>(null)
  /**
   * Records which step triggered the shared `duplicate-profile-prompt` so the
   * `deleting-duplicate-profiles` handler routes the retry correctly. Without
   * this, an import-flow duplicate (raised from `import-create-profile-only`)
   * would retry `creating-profile` — the create-new path — which can't
   * succeed in import mode because `certData.certificateId` is never set.
   */
  const [duplicateProfileOrigin, setDuplicateProfileOrigin] = useState<'creating-profile' | 'import-create-profile-only'>('creating-profile')
  /**
   * Result of the proactive Apple-side cert lookup for the user's chosen
   * identity, used to curate the no-match-recovery menu so we only offer
   * actions that can actually succeed:
   *   - `undefined` → not checked yet (e.g. ad_hoc without ASC API key —
   *     menu falls back to the legacy "Provide ASC API key, then …" options
   *     which route through `api-key-instructions` first)
   *   - `null`      → checked, Apple's API returned no match. Hide the
   *     "Fetch profile / Create profile via Apple" options (they can't
   *     work) and surface "Switch to Create new" as the escape hatch.
   *   - `string`    → checked, Apple has the cert. Show the API-driven
   *     options; the cached id is reused so the handlers don't re-query.
   * Reset to `undefined` whenever the chosen identity changes.
   */
  const [appleCertIdForChosen, setAppleCertIdForChosen] = useState<string | null | undefined>(undefined)
  /**
   * Per-identity Apple-side availability — keyed by Keychain SHA1. Populated
   * by the `import-validating-all-certs` step (when we have a verified API
   * key) and consumed by the two-table picker to classify each identity as
   * Available vs Unavailable with a stable reason string. Empty map = no
   * eager check performed (e.g. ad_hoc users who haven't provided a .p8);
   * the picker falls back to its single-list layout in that case.
   */
  const [identityAvailability, setIdentityAvailability] = useState<Record<string, EnrichedIdentityAvailability>>({})

  // ─── iOS bundle id detection + confirmation ───────────────────────────
  //
  // The Capgo lookup key (`appId` prop, resolved by getAppId()) prefers
  // config.plugins.CapacitorUpdater.appId — which is correct for tracking
  // a dev-tunnel sandbox inside Capgo SaaS but is the wrong value for iOS
  // signing. `cap sync` only ever writes `config.appId` (the top-level
  // field) into project.pbxproj's PRODUCT_BUNDLE_IDENTIFIER, so that's the
  // value Apple Dev Portal will know about.
  //
  // `iosBundleIdInitial` is wired in from command.ts as `config.appId`
  // (falling back to the resolved `appId` only when config.appId is
  // missing). We use it as the default for everything Apple-side; the
  // resolved `appId` keeps owning the progress file key, the credentials
  // store key, and the `capgo build request` command shown to the user.
  //
  // Detection is synchronous (small files, no network), so a single useMemo
  // captures the result for the lifetime of the component. The
  // confirm-app-id step renders only when `detectedIds.mismatch === true`
  // AND the user hasn't already chosen this session (tracked via
  // `appIdConfirmed`, persisted in progress as `iosBundleIdOverride`).
  const detectedIds = useMemo(
    () => detectIosBundleIds({ cwd: process.cwd(), iosDir, capacitorAppId: iosBundleIdInitial }),
    [iosDir, iosBundleIdInitial],
  )
  // Trust the saved override only when it was confirmed for the SAME
  // `config.appId` we're seeing this run. If the user renamed the app
  // (added/removed a dev-tunnel suffix, changed reverse-DNS, etc.) the
  // previously-saved override is stale relative to the new files — fall
  // back to `iosBundleIdInitial` so the mismatch detector can re-ask via
  // the confirm-app-id step instead of silently using the old value.
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
  // Stale overrides (context drift between runs) don't count as confirmed
  // for this session — the next redirect re-asks.
  const [appIdConfirmed, setAppIdConfirmed] = useState<boolean>(savedOverrideIsFresh)
  // The step we would have routed to had there been no mismatch. The
  // confirm-app-id onChange handler picks this up and continues there.
  // `null` = no confirmation pending.
  const [pendingAppIdNext, setPendingAppIdNext] = useState<OnboardingStep | null>(null)
  // The shared sites that fan out into Apple-side work (end of
  // import-scanning, end of verifying-key) wrap their setStep call with
  // this so the confirmation question gets injected at the right moment
  // without duplicating the "is there a mismatch?" logic per call site.
  const redirectIfMismatch = (target: OnboardingStep): OnboardingStep => {
    if (appIdConfirmed)
      return target
    if (!detectedIds.mismatch)
      return target
    setPendingAppIdNext(target)
    return 'confirm-app-id'
  }
  // Sub-mode for the confirm-app-id step. `false` = render the suggestion
  // Select; `true` = render a FilteredTextInput so the user can type a
  // custom value (e.g. when neither pbxproj nor capacitor matches what
  // they want to sign with). Reset when leaving the step so a future re-
  // visit (shouldn't happen, but) starts fresh.
  const [confirmAppIdTyping, setConfirmAppIdTyping] = useState(false)

  const addLog = useCallback((text: string, color = 'green') => {
    // Dedupe consecutive identical entries. The import-distribution-mode
    // Select's async onChange can fire more than once on rapid Enter presses
    // (and on resume + repick), producing repeated "✔ Distribution · …" lines.
    // Guarding here covers every caller without changing call sites.
    setLog((prev) => {
      const last = prev.at(-1)
      if (last && last.text === text && last.color === color)
        return prev
      return [...prev, { text, color }]
    })
  }, [])

  /**
   * Append OR replace a log entry identified by a stable prefix. Used for
   * field-update events that the user can re-enter mid-session (Key file,
   * Key ID, Issuer ID, Distribution, Identity, Profile). When the user
   * edits a value, the previous "✔ <field> · OLD" line is rewritten to
   * "✔ <field> · NEW" in place instead of stacking — otherwise the log
   * grows misleading audit-trail entries every time the user edits a typo.
   * Pure addLog still applies for one-shot events (verified, created, etc).
   */
  const upsertLog = useCallback((prefix: string, text: string, color = 'green') => {
    setLog((prev) => {
      const idx = prev.findIndex(entry => entry.text.startsWith(prefix))
      if (idx < 0)
        return [...prev, { text, color }]
      return prev.map((entry, i) => i === idx ? { text, color } : entry)
    })
  }, [])

  const pm = getPMAndCommand()
  const addIosCommand = formatRunnerCommand(pm.runner, ['cap', 'add', 'ios'])
  const syncIosCommand = formatRunnerCommand(pm.runner, ['cap', 'sync', 'ios'])
  const doctorCommand = formatRunnerCommand(pm.runner, ['@capgo/cli@latest', 'doctor'])
  const buildInitCommand = formatRunnerCommand(pm.runner, ['@capgo/cli@latest', 'build', 'init'])
  const buildRequestCommand = formatRunnerCommand(pm.runner, ['@capgo/cli@latest', 'build', 'request', appId, '--platform', 'ios'])
  const loginCommand = formatRunnerCommand(pm.runner, ['@capgo/cli@latest', 'login'])

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
      upsertLog('✔ Key file', `✔ Key file selected · ${initialProgress.p8Path}`)
    }
    if (initialProgress.keyId && !initialProgress.completedSteps.apiKeyVerified) {
      upsertLog('✔ Key ID · ', `✔ Key ID · ${initialProgress.keyId}`)
    }
    if (initialProgress.issuerId && !initialProgress.completedSteps.apiKeyVerified) {
      upsertLog('✔ Issuer ID · ', `✔ Issuer ID · ${initialProgress.issuerId}`)
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
    // to the user-confirmed iOS bundle id (or capacitor.config.appId when no
    // override) for the create-new path. Whichever we end up writing here
    // becomes the provisioning_map key, which the iOS build system looks up
    // by PRODUCT_BUNDLE_IDENTIFIER at sign time — so capacitor.config.appId
    // would be wrong for any project where the two diverge.
    const provisioningBundleId = importMode && chosenProfile?.bundleId ? chosenProfile.bundleId : iosBundleId
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
      //   3. macOS, fresh run → setup-method-select (Import vs Create new fork)
      //   4. Non-macOS, fresh run → api-key-instructions (import needs Keychain
      //      access, which Linux/Windows hosts don't have)
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
          //
          // redirectIfMismatch then short-circuits to confirm-app-id when
          // capacitor.config.appId and project.pbxproj's
          // PRODUCT_BUNDLE_IDENTIFIER disagree — surfaced after p8 setup
          // (i.e. by the time we reach this code path for app_store) so
          // the user has context before Apple-side filtering kicks in.
          setStep(redirectIfMismatch(getImportEntryStep(await loadProgress(appId))))
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

    // Defense-in-depth: if we land on `import-pick-profile` with no profile
    // usable for THIS app + distribution mode, route to no-match-recovery
    // instead of rendering an empty picker with only "Back". This covers
    // every entry point uniformly (identity pick, Apple fetch, resume, back
    // navigation from later steps).
    if (step === 'import-pick-profile' && chosenIdentity) {
      const profilesForIdentity = importMatches.find(m => m.identity.sha1 === chosenIdentity.sha1)?.profiles ?? []
      const usable = filterProfilesForApp(profilesForIdentity, iosBundleId, importDistribution)
      if (usable.length === 0) {
        // Same gating as the identity-pick onChange — pre-check Apple when
        // we have an API key so the recovery menu only offers viable
        // options. Skip the pre-check on resume if we already have a result
        // for this identity (avoid a redundant round-trip).
        if (appleCertIdForChosen !== undefined) {
          setStep('import-no-match-recovery')
        }
        else {
          ;(async () => {
            const apiKeyAvailable = !!(p8ContentRef.current || (await loadProgress(appId))?.completedSteps?.apiKeyVerified)
            setStep(apiKeyAvailable ? 'import-checking-apple-cert' : 'import-no-match-recovery')
          })()
        }
      }
    }

    // Eager batch validation: classify every scanned distribution identity
    // against Apple's API up-front, so the picker can show two tables
    // (Available + Unavailable) with concrete reasons instead of
    // user-clicks-an-option → lookup-fails-late.
    if (step === 'import-validating-all-certs' && importMatches.length > 0) {
      ;(async () => {
        try {
          const token = await getFreshToken()
          // Run lookups in parallel — N typically 1-3 for most teams, max
          // ~10 even for prolific accounts. Allow each to fail independently
          // (a network blip on one lookup shouldn't disqualify all certs).
          //
          // Uses findCertBySha1 (not findCertIdBySha1) so we capture the
          // full Apple-side record — name, expirationDate, serialNumber —
          // and cache it in identityAvailability. The manual-portal
          // walkthrough surfaces those as disambiguators when multiple
          // distribution certs are listed for the same team.
          const results = await Promise.all(importMatches.map(async (m) => {
            try {
              const cert = await findCertBySha1(token, m.identity.sha1)
              return { sha1: m.identity.sha1, cert, error: null as unknown }
            }
            catch (err) {
              return { sha1: m.identity.sha1, cert: null, error: err }
            }
          }))
          if (cancelled)
            return
          const map: Record<string, EnrichedIdentityAvailability> = {}
          let availableCount = 0
          for (const r of results) {
            const classified = classifyCertAvailability({
              appleCertId: r.cert ? r.cert.id : null,
              lookupError: r.error,
            })
            // Build an EnrichedIdentityAvailability by widening the
            // classifier output with the Apple-side cert metadata when
            // we have it. Kept separate from CertAvailability so the
            // pure classifier stays decoupled from rendering concerns.
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
          setStep('import-pick-identity')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'import-validating-all-certs')
        }
      })()
    }

    if (step === 'import-checking-apple-cert' && chosenIdentity) {
      ;(async () => {
        try {
          // Trust the cached appleCertId from the eager batch validation
          // (`import-validating-all-certs`) when present — that step
          // already proved Apple has this cert via the same
          // findCertIdBySha1 call. A redundant lookup here just burns an
          // API round-trip and exposes us to transient-blip false
          // negatives that flip a known-good cert into "Scenario B".
          // Falls back to the live lookup when no cache exists (e.g.
          // resume from progress before batch validation ran).
          const token = await getFreshToken()
          const cached = identityAvailability[chosenIdentity.sha1]
          let certId: string | null
          if (cached?.available && cached.appleCertId) {
            certId = cached.appleCertId
          }
          else {
            certId = await findCertIdBySha1(token, chosenIdentity.sha1)
            if (cancelled)
              return
            setAppleCertIdForChosen(certId)
            if (!certId) {
              // Should be unreachable from the table picker (only
              // available certs are selectable), but kept as a defensive
              // route — log + bounce to recovery rather than crashing.
              addLog(
                `⚠ Apple lookup returned no match for "${chosenIdentity.name}". `
                + `Open Developer Portal or use "Switch to Create new" from the picker.`,
                'yellow',
              )
              setStep('import-no-match-recovery')
              return
            }
          }
          setAppleCertIdForChosen(certId)
          addLog(`✔ Apple recognizes this certificate (ASC id ${certId.slice(0, 8)}…)`)

          // Auto-fetch profiles for this cert. Sends the user straight to
          // import-pick-profile when Apple has a matching profile waiting,
          // skipping the recovery menu entirely in the happy path.
          const profiles = await listProfilesForCert(token, certId)
          if (cancelled)
            return

          if (profiles.length === 0) {
            addLog('ℹ️  Apple has the cert but no profiles are linked to it yet — use "Create a new App Store profile" to add one.', 'yellow')
            setStep('import-no-match-recovery')
            return
          }

          // Synthesize so `filterProfilesForApp` and the picker can use
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
          if (usableHere.length > 0) {
            addLog(`✔ Apple has ${usableHere.length} matching profile${usableHere.length === 1 ? '' : 's'} for "${iosBundleId}" — opening the picker`)
            setStep('import-pick-profile')
            return
          }

          // Apple returned profiles but none target this app. Surface what
          // WAS returned so the user understands why we're still on the
          // recovery screen.
          const otherBundleIds = Array.from(new Set(synthesized.map(p => p.bundleId).filter(b => b && b !== iosBundleId)))
          const otherDistribTypes = Array.from(new Set(synthesized.filter(p => p.bundleId === iosBundleId && p.profileType !== importDistribution).map(p => p.profileType)))
          if (otherBundleIds.length > 0) {
            addLog(
              `⚠ Apple returned ${profiles.length} profile${profiles.length === 1 ? '' : 's'} for this cert but none target "${iosBundleId}". `
              + `Bundle ID${otherBundleIds.length === 1 ? '' : 's'} found: ${otherBundleIds.join(', ')}. `
              + `Use "Create a new App Store profile for this cert" to add one for "${iosBundleId}".`,
              'yellow',
            )
          }
          else if (otherDistribTypes.length > 0) {
            addLog(
              `⚠ Apple has ${profiles.length} profile${profiles.length === 1 ? '' : 's'} for "${iosBundleId}" but with distribution type ${otherDistribTypes.join(', ')} (need ${importDistribution}). `
              + `Use "Create a new App Store profile for this cert" to add the right one.`,
              'yellow',
            )
          }
          setStep('import-no-match-recovery')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'import-checking-apple-cert')
        }
      })()
    }

    if (step === 'import-provide-profile-path' && !mobileprovisionPickerOpenedRef.current && chosenIdentity) {
      mobileprovisionPickerOpenedRef.current = true
      ;(async () => {
        const handleSelectedPath = async (filePath: string) => {
          // Parse the .mobileprovision (CMS-signed plist) and validate
          // every constraint that would otherwise produce a broken build
          // far downstream: bundleId must match THIS app, profileType
          // must match THIS distribution, and one of the linked cert
          // SHA1s must match the user's chosen Keychain identity.
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
          if (detail.bundleId !== iosBundleId) {
            handleError(
              new Error(
                `This .mobileprovision is for bundle ID "${detail.bundleId}" but the current app is "${iosBundleId}". `
                + `Pick a profile that targets the right app, or use "Create a new App Store profile" in the recovery menu.`,
              ),
              'import-provide-profile-path',
            )
            return
          }
          if (importDistribution && detail.profileType !== importDistribution) {
            handleError(
              new Error(
                `This .mobileprovision has distribution type "${detail.profileType}" but you picked "${importDistribution}". `
                + `Pick a profile of the correct type, or go back and change the distribution mode.`,
              ),
              'import-provide-profile-path',
            )
            return
          }
          if (!detail.certificateSha1s.includes(chosenIdentity.sha1)) {
            handleError(
              new Error(
                `This .mobileprovision doesn't include "${chosenIdentity.name}" in its allowed certificate list. `
                + `The profile lists ${detail.certificateSha1s.length} cert SHA1${detail.certificateSha1s.length === 1 ? '' : 's'}, none matching this Keychain identity. `
                + `Either pick a profile that trusts this cert, or go back to identity selection and pick the one this profile expects.`,
              ),
              'import-provide-profile-path',
            )
            return
          }
          // All checks pass — build a DiscoveredProfile and route to the
          // existing export flow. We keep the file path so the
          // import-exporting step reads the bytes (no need to embed
          // profileBase64 here).
          const synth: DiscoveredProfile = {
            path: filePath,
            uuid: detail.uuid,
            name: detail.name,
            applicationIdentifier: detail.applicationIdentifier,
            bundleId: detail.bundleId,
            teamId: detail.teamId,
            expirationDate: detail.expirationDate,
            profileType: detail.profileType,
            certificateSha1s: detail.certificateSha1s,
          }
          setChosenProfile(synth)
          upsertLog('✔ Profile · ', `✔ Profile · ${detail.name} (from ${filePath.split('/').pop()})`)
          setStep('import-export-warning')
        }

        // On macOS use the native picker; everywhere else (and as a
        // fallback when the picker fails) the user types the path in
        // the dedicated render below — handled outside this handler.
        if (canUseFilePicker()) {
          try {
            const picked = await openMobileprovisionPicker()
            if (cancelled)
              return
            if (picked) {
              await handleSelectedPath(picked)
              return
            }
            // User cancelled the native dialog — bounce back to recovery
            // menu rather than leaving them on a spinner-less screen.
            mobileprovisionPickerOpenedRef.current = false
            setStep('import-no-match-recovery')
          }
          catch (err) {
            if (!cancelled)
              handleError(err, 'import-provide-profile-path')
          }
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
              + 'Use "Use a .mobileprovision file from disk" or "Open Apple Developer Portal" instead.',
            )
          }
          const token = await getFreshToken()
          const certId = await findCertIdBySha1(token, chosenIdentity.sha1)
          if (cancelled)
            return
          if (!certId) {
            // Route back to the recovery menu instead of dead-ending at the
            // support bundle. The listDistributionCerts filter occasionally
            // misses a cert legitimately on Apple (eager batch already
            // succeeded — see the note in apple-api.ts) so the user can
            // recover via "Open Apple Developer Portal" or a different
            // identity rather than restarting.
            addLog(
              `⚠ Apple did not return a cert match for "${chosenIdentity.name}". `
              + `Can't create a profile without an Apple-side cert ID. Returning to recovery menu — try "Open Apple Developer Portal" or pick a different identity.`,
              'yellow',
            )
            setStep('import-no-match-recovery')
            return
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
            upsertLog('✔ Key file', `✔ Key file selected · ${selected}`)
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
            // Eager Apple-side validation BEFORE the picker renders: fan out
            // findCertIdBySha1 across every scanned identity in parallel so
            // the picker can split them into Available / Unavailable tables
            // and surface specific reasons for the unavailable rows.
            // Bypass when there's nothing to check (defensive — scanning
            // already routed away on zero identities).
            //
            // redirectIfMismatch wrapping covers the second entry point
            // into Apple-side work: app_store users finish verifying-key
            // here, and we want to confirm the bundle id BEFORE the eager
            // batch fans out lookups using the (possibly wrong) appId.
            setStep(redirectIfMismatch(importMatches.length > 0 ? 'import-validating-all-certs' : 'import-pick-identity'))
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
          const entries = createCiSecretEntries(credentials)
          setCiSecretEntries(entries)
          if (entries.length === 0)
            setStep('ask-build')
          else
            setStep('detecting-ci-secrets')
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
            setStep('ask-build')
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
          setStep('ask-build')
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
  const showProgress = step !== 'welcome' && step !== 'platform-select' && step !== 'adding-platform' && step !== 'no-platform' && step !== 'error' && step !== 'build-complete' && step !== 'requesting-build'
  const showHeader = step !== 'requesting-build'
  const showLog = step !== 'requesting-build' && step !== 'build-complete'
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

      {/* Confirm iOS bundle id when capacitor.config and project.pbxproj
          disagree. Routed in only by redirectIfMismatch — never shown on
          fresh runs where everything lines up. */}
      {step === 'confirm-app-id' && (() => {
        const onChoose = async (chosen: string) => {
          setIosBundleId(chosen)
          setAppIdConfirmed(true)
          setConfirmAppIdTyping(false)
          // Persist immediately so resume / restart picks the override
          // without re-prompting. Merge with whatever progress already
          // exists (setupMethod, importDistribution, etc.) — never reset.
          const existing = await loadProgress(appId) || {
            platform: 'ios' as const,
            appId,
            startedAt: new Date().toISOString(),
            completedSteps: {},
          }
          existing.iosBundleIdOverride = chosen
          // Snapshot the current config.appId so the next CLI run can
          // detect "the user changed the app id, our saved override is
          // stale" and re-ask instead of silently using `chosen`. See
          // the savedOverrideIsFresh check at component init.
          existing.iosBundleIdContextAppId = iosBundleIdInitial
          await saveProgress(appId, existing)
          if (chosen !== iosBundleIdInitial) {
            addLog(`✔ Using "${chosen}" as the iOS bundle ID for Apple operations (capacitor.config.appId is "${iosBundleIdInitial}")`)
          }
          else {
            addLog(`✔ Confirmed "${chosen}" as the iOS bundle ID`)
          }
          // Resume the journey at whichever step requested the redirect.
          // Fallback to import-pick-identity for defensive completeness —
          // every site that calls redirectIfMismatch sets the destination
          // first, but a future code path might forget.
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
                allowedPattern={/[A-Za-z0-9._-]/}
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
              { label: '🆕  Switch to "Create new" (Apple generates a fresh cert + profile)', value: '__cancel__' },
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
                setStep('import-pick-identity')
              }
            }}
          />
        </Box>
      )}

      {/* Import: pick identity */}
      {step === 'import-pick-identity' && (() => {
        // Partition scanned identities by Apple-side availability. When the
        // batch validation didn't run (ad_hoc with no .p8), every identity
        // lands in the "unclassified" bucket — rendered identically to
        // Available since we have no evidence to mark them unusable.
        const haveClassification = Object.keys(identityAvailability).length > 0
        const available: IdentityProfileMatch[] = []
        const unavailable: IdentityProfileMatch[] = []
        for (const m of importMatches) {
          const a = identityAvailability[m.identity.sha1]
          if (!haveClassification || a?.available)
            available.push(m)
          else
            unavailable.push(m)
        }

        // Helper: build the row data shape ink-table consumes. Includes a
        // "#" column so users can correlate the visual table row with the
        // labelled choice in the Select below. The order of `availableRows`
        // is identical to the order of `availableOptions` so [n] in the
        // table maps to the (n-1)th option in the picker.
        //
        // "Profile" column: a binary readiness signal — does this identity
        // already have at least one on-disk profile matching this app's
        // bundle id + distribution mode? Previously this column showed an
        // X/Y ratio with a checkmark, which forced users to mentally decode
        // "1/1 ✓" → "yes that means usable". Replaced with green AVAILABLE
        // / red UNAVAILABLE so the at-a-glance signal is unambiguous; the
        // user can still recover from UNAVAILABLE via the no-match recovery
        // menu (file picker, Apple create, etc.), so picking such an
        // identity isn't fatal — just an extra step.
        const availableRows = available.map((m, i) => {
          const matchCount = filterProfilesForApp(m.profiles, iosBundleId, importDistribution).length
          return {
            '#': `${i + 1}`,
            'Name': `🔑 ${m.identity.name}`,
            'Team': m.identity.teamId,
            'Profile': matchCount > 0 ? 'AVAILABLE' : 'UNAVAILABLE',
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
                <Text bold color="green">{`✅  AVAILABLE (${available.length})`}</Text>
                <Newline />
                <Table
                  data={availableRows}
                  // Color-code the binary AVAILABLE/UNAVAILABLE status:
                  // green when there's a ready-to-use profile, red when
                  // the user will hit the no-match recovery menu after
                  // picking this row. Other columns keep default color so
                  // cert names stay easy to read.
                  cellColor={(col, val) => {
                    if (col !== 'Profile')
                      return undefined
                    if (val === 'AVAILABLE')
                      return 'green'
                    if (val === 'UNAVAILABLE')
                      return 'red'
                    return undefined
                  }}
                />
                <Newline />
              </>
            )}

            {available.length === 0 && (
              <Box flexDirection="column">
                <Text bold color="red">{`✖  NO AVAILABLE CERTIFICATES`}</Text>
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

            <Text bold>Pick an option:</Text>
            <Select
              options={[
                ...available.map((m, i) => ({
                  label: `[${i + 1}]  ${m.identity.name} · ${m.identity.teamId}`,
                  value: m.identity.sha1,
                })),
                { label: '🆕  Switch to "Create new" (Apple generates a fresh cert + profile)', value: '__cancel__' },
                { label: '✖  Exit onboarding', value: '__exit__' },
              ]}
              onChange={async (value) => {
                if (value === '__exit__') {
                  addLog('Exiting. Re-run `build init` when you\'re ready.', 'yellow')
                  exitOnboarding()
                  return
                }
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
                // Reuse cached Apple-side certId from batch validation when
                // present; downstream per-identity pre-check skips the
                // redundant network round-trip in that case.
                const cached = identityAvailability[match.identity.sha1]
                setAppleCertIdForChosen(cached?.available ? (cached.appleCertId ?? null) : (cached ? null : undefined))
                upsertLog('✔ Identity · ', `✔ Identity · ${match.identity.name}`)
                const usableForThisApp = filterProfilesForApp(match.profiles, iosBundleId, importDistribution)
                if (usableForThisApp.length === 0) {
                  const apiKeyAvailable = !!(p8ContentRef.current || (await loadProgress(appId))?.completedSteps?.apiKeyVerified)
                  setStep(apiKeyAvailable ? 'import-checking-apple-cert' : 'import-no-match-recovery')
                  return
                }
                setStep('import-pick-profile')
              }}
            />

            {unavailable.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text bold color="yellow">{`⚠️   UNAVAILABLE (${unavailable.length})`}</Text>
                <Newline />
                <Table
                  data={unavailableRows}
                  cellColor={(col) => (col === 'Reason' ? 'yellow' : undefined)}
                  cellDim={(col) => col !== 'Reason'}
                />
                <Newline />
                <Text dimColor>
                  💡 Unavailable certificates can't be used to sign builds. Even downloading them from the Apple Developer Portal won't help — the private key was only on the Mac that generated the original CSR. Use "Create new" above to generate a fresh cert + profile that Apple recognizes.
                </Text>
              </Box>
            )}
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
                if (profile.bundleId !== iosBundleId
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
                // in the portal — if they ticked the wrong cert in step 5 of
                // the manual walkthrough, we'd otherwise save credentials
                // that the build server can't actually sign with (private
                // key from chosenIdentity but profile only trusts a different
                // cert). Catch that here with a clear error rather than
                // discovering it during a build hours later.
                if (!profile.certificateSha1s.includes(chosenIdentity.sha1)) {
                  const shownSha1s = profile.certificateSha1s.map(s => `${s.slice(0, 8)}…`).join(', ') || '(none listed)'
                  handleError(
                    new Error(
                      `Profile "${profile.name}" doesn't trust your chosen certificate "${chosenIdentity.name}". `
                      + `The profile's allowed-certs list contains ${profile.certificateSha1s.length} entr${profile.certificateSha1s.length === 1 ? 'y' : 'ies'} (SHA1: ${shownSha1s}); your cert's SHA1 starts with ${chosenIdentity.sha1.slice(0, 8)}…. `
                      + `Either pick a different profile, or re-create this profile in the Apple Developer Portal and tick the right cert at step 4.`,
                    ),
                    'import-pick-profile',
                  )
                  return
                }
                setChosenProfile(profile)
                upsertLog('✔ Profile · ', `✔ Profile · ${profile.name}`)
                setStep('import-export-warning')
              }}
            />
          </Box>
        )
      })()}

      {/* Import: checking Apple for the chosen cert (curates the recovery menu) */}
      {/* Import: eager batch validation against Apple before showing the picker */}
      {step === 'import-validating-all-certs' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text={`Validating ${importMatches.length} certificate${importMatches.length === 1 ? '' : 's'} with Apple...`} />
          <Text dimColor>Splitting into Available / Unavailable so we only offer options that can succeed.</Text>
        </Box>
      )}

      {step === 'import-checking-apple-cert' && chosenIdentity && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text={`Checking Apple for matching profiles for "${chosenIdentity.name}"...`} />
          <Text dimColor>Looking up the cert + listing its profiles so we either auto-import or only show recovery options that can succeed.</Text>
        </Box>
      )}

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
        // Distinguish "no profiles at all for this identity" (alert wording
        // about a missing on-disk file) from "profiles exist but none match
        // this app's bundle ID + distribution mode" (alert wording about a
        // mismatch). Both share the same recovery options.
        const identityProfiles = importMatches.find(m => m.identity.sha1 === chosenIdentity.sha1)?.profiles ?? []
        const hasAnyProfiles = identityProfiles.length > 0
        // Two states the menu cares about:
        //  - certKnownOnApple → Apple confirmed the cert (eager batch or
        //    live lookup). Show all API-driven options.
        //  - checkSkipped     → No API key yet (ad_hoc users who didn't
        //    go through verifying-key). Show options with the "Provide
        //    ASC API key, then …" prefix so picking them routes through
        //    api-key-instructions before retrying.
        //
        // The "Apple lookup returned null" case is **unreachable** from
        // the table picker because unavailable rows aren't selectable,
        // and the per-identity step now trusts the cached appleCertId
        // instead of running a redundant findCertIdBySha1. We removed
        // the Scenario B menu branch entirely; if a future code path
        // somehow lands here with appleCertIdForChosen === null, it
        // will render as if checkSkipped (with "Provide ASC API key"
        // wording even though the key is verified) — visually obvious
        // and recoverable, vs. a silent dead-end.
        const certKnownOnApple = typeof appleCertIdForChosen === 'string'
        const checkSkipped = !certKnownOnApple

        const createOption = canCreateProfile && certKnownOnApple
          ? [{ label: `✨  Create a new App Store profile for this cert via Apple`, value: 'create' }]
          : canCreateProfile
            ? [{ label: hasAscKey ? `✨  Create a new App Store profile for this cert via Apple` : `✨  Provide ASC API key, then create a new App Store profile for this cert`, value: 'create' }]
            : []

        return (
          <Box flexDirection="column" marginTop={1}>
            <Alert variant="warning">
              {hasAnyProfiles
                ? (
                    <>
                      No provisioning profile on this Mac matches this app (
                      <Text bold>{iosBundleId}</Text>
                      {importDistribution
                        ? (
                            <>
                              {' '}
                              for
                              {' '}
                              <Text bold>{importDistribution}</Text>
                              {' '}
                              distribution
                            </>
                          )
                        : null}
                      ) under "
                      {chosenIdentity.name}
                      ".
                    </>
                  )
                : (
                    <>
                      No provisioning profile on this Mac is linked to "
                      {chosenIdentity.name}
                      ".
                    </>
                  )}
            </Alert>
            <Newline />
            <Text dimColor>
              {hasAnyProfiles
                ? `The cert is in your Keychain but no on-disk profile matches this app's bundle ID${importDistribution ? ` and ${importDistribution} distribution` : ''}. Pick a recovery path:`
                : `The cert is in your Keychain but the matching profile isn't on disk. Pick a recovery path:`}
            </Text>
            <Newline />
            <Select
              options={[
                // Order optimized for the most-likely-to-succeed first:
                //   1. Create a fresh profile via Apple API — automatic,
                //      one click, links to the existing cert.
                //   2. Use a local .mobileprovision file — fastest path
                //      when the user already has a profile they trust.
                //   3. Open the Developer Portal — manual fallback that
                //      walks the user through creating a profile by hand
                //      and routes them back into the file-picker path.
                //   4. Back to identity selection — from the picker the
                //      user can choose "Switch to Create new" if they
                //      want to abandon import entirely. (Removed from
                //      this menu since the cert-not-on-Apple branch
                //      that justified it is now unreachable.)
                //
                // A previous version also offered "Rescan Apple API for
                // profiles" here. It was removed because the portal
                // walkthrough now always tells the user to come back via
                // "📁 Use a .mobileprovision file from disk" — having two
                // parallel recovery paths (API rescan vs. file picker)
                // for the same outcome made the UX inconsistent with the
                // instructions we just rendered.
                ...createOption,
                // "Provide .mobileprovision from disk" — for users who
                // already have a profile file in a non-standard location
                // (downloads, artifact from another machine, shared team
                // archive). Only shown on macOS where the native picker
                // is available.
                ...(canUseFilePicker() ? [{ label: `📁  Use a .mobileprovision file from disk`, value: 'provide-profile-path' }] : []),
                { label: `🌐  Open Apple Developer Portal (browse / create profiles manually)`, value: 'browser' },
                { label: '↩️   Back to identity selection', value: 'back' },
              ]}
              onChange={async (value) => {
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
          </Box>
        )
      })()}

      {/* Import: manual portal walkthrough + nudge toward Create new */}
      {step === 'import-portal-explanation' && chosenIdentity && (() => {
        // Whether we have an automatic alternative to recommend. The
        // pre-check at import-checking-apple-cert populates
        // appleCertIdForChosen when Apple confirmed the cert; the
        // app_store distribution gate hides ad_hoc users from the
        // automatic create option (which currently only knows app_store).
        const canAutoCreate = typeof appleCertIdForChosen === 'string' && importDistribution !== 'ad_hoc'

        // Apple-side cert metadata cached during eager batch validation
        // (import-validating-all-certs). When present, surface concrete
        // disambiguators in step 4 so the user knows WHICH row to click
        // in the portal when their team has multiple distribution certs.
        // Apple's API does not expose "created by" — the portal column
        // is portal-internal — so we only have expirationDate + serial.
        const certInfo = identityAvailability[chosenIdentity.sha1]
        const expirationDate = certInfo?.appleCertExpirationDate
        const expirationDay = expirationDate ? expirationDate.split('T')[0] : null
        const serialNumber = certInfo?.appleCertSerialNumber
        const serialTail = serialNumber && serialNumber.length > 8
          ? serialNumber.slice(-8)
          : serialNumber || null
        const appleCertNameForPortal = certInfo?.appleCertName

        return (
          <Box flexDirection="column" marginTop={1}>
            <Alert variant="info">
              {canAutoCreate
                ? 'You can do this manually in the Apple Developer Portal — but the automatic path is much easier.'
                : `You can do this manually in the Apple Developer Portal. Here's what it involves.`}
            </Alert>
            <Newline />
            <Text bold>{`What you'd need to do manually:`}</Text>
            <Box flexDirection="column" marginLeft={2} marginTop={1}>
              <Text>
                <Text bold color="white">1.</Text>
                {' '}
                Sign in at
                {' '}
                <Text color="cyan" underline>developer.apple.com/account/resources/profiles/list</Text>
                .
              </Text>
              <Text>
                <Text bold color="white">2.</Text>
                {' '}
                Select the correct team in the team selector (top right) — it must be
                {' '}
                <Text bold>{chosenIdentity.teamId}</Text>
                {chosenIdentity.teamName ? <> ({chosenIdentity.teamName})</> : null}
                . If you only see one team in the dropdown, you're already on it.
              </Text>
              <Text>
                <Text bold color="white">3.</Text>
                {' '}
                Click
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
                <Text bold color="white">4.</Text>
                {' '}
                Pick the App ID matching
                {' '}
                <Text bold>{iosBundleId}</Text>
                {`. Create it first if it doesn't exist (`}
                <Text color="cyan" underline>developer.apple.com/account/resources/identifiers/list</Text>
                ).
              </Text>
              <Text>
                <Text bold color="white">5.</Text>
                {' '}
                In the "Certificates" step, tick the cert that matches
                {' '}
                <Text bold>{chosenIdentity.name}</Text>
                {expirationDay || serialTail || appleCertNameForPortal
                  ? (
                      <>
                        . If multiple are listed, pick the one matching:
                      </>
                    )
                  : '. If multiple are listed, pick carefully — we double-check in the next step (see note below).'}
              </Text>
              {(expirationDay || serialTail || appleCertNameForPortal) && (
                <Box flexDirection="column" marginLeft={4}>
                  {appleCertNameForPortal && (
                    <Text>
                      • Apple-side name:
                      {' '}
                      <Text bold>{appleCertNameForPortal}</Text>
                    </Text>
                  )}
                  {expirationDay && (
                    <Text>
                      • Expires:
                      {' '}
                      <Text bold>{expirationDay}</Text>
                    </Text>
                  )}
                  {serialTail && (
                    <Text>
                      • Serial number ends in:
                      {' '}
                      <Text bold>{serialTail}</Text>
                      {' '}
                      <Text dimColor>(visible when you click into the cert in the portal)</Text>
                    </Text>
                  )}
                  <Text dimColor>
                    {`Apple's API doesn't expose the "Created by" column the portal shows — those three fields above are everything we have to disambiguate. Don't worry if you're not 100% sure: when you pick the resulting profile back in this CLI, we re-verify the cert SHA1 matches your chosen identity and refuse with a clear error if it doesn't. So a wrong tick here is recoverable.`}
                  </Text>
                </Box>
              )}
              <Text>
                <Text bold color="white">6.</Text>
                {' '}
                Name the profile (any name) and click
                {' '}
                <Text bold>Generate</Text>
                , then
                {' '}
                <Text bold>Download</Text>
                . The .mobileprovision file lands in your Downloads folder (or wherever your browser saves to).
              </Text>
              <Text>
                <Text bold color="white">7.</Text>
                {' '}
                Come back here and pick
                {' '}
                <Text bold>📁  Use a .mobileprovision file from disk</Text>
                , then point the file picker at the file you just downloaded. We'll validate the bundle ID, distribution type, and cert match before continuing — if anything's off, you'll get a clear error naming exactly what doesn't line up.
              </Text>
            </Box>
            <Newline />
            {canAutoCreate
              ? (
                  <Box flexDirection="column">
                    <Text bold color="green">💡 Recommended: let Capgo do this for you.</Text>
                    <Text dimColor>
                      "✨ Create a new App Store profile for this cert via Apple" does all of the above automatically via the Apple API — same cert, same bundle ID, same distribution, no portal navigation, no manual download. Fewer ways to get it wrong.
                    </Text>
                    <Newline />
                  </Box>
                )
              : (
                  <Box flexDirection="column">
                    <Text dimColor>
                      {`The "Create profile via Apple" automatic option is only available for app_store distribution today. For ad_hoc you'll need to walk through the portal manually (or provide the .mobileprovision from disk).`}
                    </Text>
                    <Newline />
                  </Box>
                )}
            <Select
              options={[
                ...(canAutoCreate
                  ? [{ label: '✨  Use "Create a new App Store profile" instead (recommended)', value: 'use-create' }]
                  : []),
                { label: '🌐  Open the portal anyway (advanced)', value: 'open-anyway' },
                ...(canUseFilePicker()
                  ? [{ label: '📁  I already have a .mobileprovision on disk — let me pick it', value: 'use-file' }]
                  : []),
                { label: '↩️   Back to recovery menu', value: 'back' },
              ]}
              onChange={(value) => {
                if (value === 'use-create') {
                  // Reuse the existing recovery menu's create handler by
                  // jumping straight to its target step. apiKeyVerified is
                  // guaranteed at this point (the create option only
                  // surfaced because the eager validation found the cert
                  // on Apple, which requires a verified key).
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

      {/* Import: native picker for a .mobileprovision file on disk */}
      {step === 'import-provide-profile-path' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text="Opening file picker for your .mobileprovision file..." />
          <Text dimColor>If the dialog doesn't appear, check behind other windows or in the menu bar.</Text>
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
                  // Escape hatch when the user landed here from "Switch to
                  // Create new" in the import flow but actually wanted to
                  // try Import again (e.g. they hit cert-limit on resume).
                  // Only offered when we're not currently in import mode AND
                  // macOS (since import requires Keychain access).
                  ...(isMacOS() && !importMode
                    ? [{ label: '🔄  Switch to Import existing (use a cert from your Keychain instead)', value: 'switch-import' }]
                    : []),
                ]}
                onChange={async (value) => {
                  if (value === 'picker') {
                    setStep('p8-method-select')
                  }
                  else if (value === 'manual') {
                    setStep('input-p8-path')
                  }
                  else if (value === 'switch-import') {
                    const existing = await loadProgress(appId)
                    if (existing) {
                      existing.setupMethod = 'import-existing'
                      await saveProgress(appId, existing)
                    }
                    setImportMode(true)
                    addLog('🔄 Switched to Import existing — scanning your Keychain', 'cyan')
                    setStep('import-scanning')
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
                      upsertLog('✔ Key file', `✔ Key file found · ${filePath}`)
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
                  upsertLog('✔ Key file', `✔ Key file found · ${filePath}`)
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
                      initialValue={keyId}
                      // Apple Key ID is always exactly 10 alphanumeric
                      // characters, uppercase by convention (e.g. KDTXMK292V).
                      // Lock down the input so typos like leading/trailing
                      // spaces, the issuer-UUID, or "Key ID: " prefixes are
                      // physically impossible.
                      allowedPattern={/[a-zA-Z0-9]/}
                      maxLength={10}
                      transform={s => s.toUpperCase()}
                      onSubmit={(value) => {
                        const finalKeyId = (value || keyId).trim()
                        setKeyId(finalKeyId)
                        upsertLog('✔ Key ID · ', `✔ Key ID · ${finalKeyId}`)
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
                      placeholder="KDTXMK292V"
                      initialValue={keyId}
                      // Same constraints as the auto-detected variant above —
                      // see the comment there for the format rationale.
                      allowedPattern={/[a-zA-Z0-9]/}
                      maxLength={10}
                      transform={s => s.toUpperCase()}
                      onSubmit={(value) => {
                        const cleaned = value.trim()
                        if (!cleaned)
                          return
                        setKeyId(cleaned)
                        upsertLog('✔ Key ID · ', `✔ Key ID · ${cleaned}`)
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
              initialValue={issuerId}
              // Apple Issuer ID is a standard UUID v4 — hex digits plus
              // hyphens, total 36 chars. Whitelist hex+hyphen so accidental
              // alphabetic chars (g-z) can't sneak in from a fat-fingered
              // paste; cap length to prevent overflow from copying extra
              // text around the UUID. Case is irrelevant on Apple's side so
              // we don't transform — users who paste lowercase UUIDs (the
              // most common form) keep them as-is.
              allowedPattern={/[a-fA-F0-9-]/}
              maxLength={36}
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

      {/* Certificate limit — ask which to revoke (or escape to Import) */}
      {step === 'cert-limit-prompt' && (
        <Box flexDirection="column" marginTop={1}>
          <ErrorLine text={`iOS distribution certificate limit reached (${existingCerts.length} existing).`} />
          <Newline />
          <Text bold>You can revoke one of the existing certs, OR switch back to Import existing</Text>
          <Text dimColor>(if a usable cert is already in your Keychain, importing is faster than creating a new one)</Text>
          <Newline />
          <Select
            options={[
              ...existingCerts.map((c) => {
                const ourCertId = certData?.certificateId || initialProgress?.completedSteps.certificateCreated?.certificateId
                const isOurs = ourCertId === c.id
                const creator = isOurs ? ' · 🔧 Created by Capgo' : ''
                return {
                  label: `🗑️   Revoke ${c.name} · expires ${c.expirationDate.split('T')[0]}${creator}`,
                  value: c.id,
                }
              }),
              { label: '🔄  Switch back to Import existing (use a cert from your Keychain)', value: '__switch-import__' },
              { label: '✖  Exit onboarding', value: '__exit__' },
            ]}
            onChange={async (value) => {
              if (value === '__exit__') {
                addLog(`Exiting. Revoke a certificate manually in App Store Connect, then resume with ${buildInitCommand}.`, 'yellow')
                exitOnboarding()
                return
              }
              if (value === '__switch-import__') {
                // Reverse the destructive setupMethod=create-new commit that
                // happens when the user clicks "Switch to Create new" from
                // the import flow. Lets users back out of the create-new
                // path without nuking their entire progress file.
                const existing = await loadProgress(appId)
                if (existing) {
                  existing.setupMethod = 'import-existing'
                  await saveProgress(appId, existing)
                }
                setImportMode(true)
                addLog('🔄 Switched back to Import existing — scanning your Keychain again', 'cyan')
                setStep('import-scanning')
                return
              }
              setCertToRevoke(value)
              setStep('revoking-certificate')
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
          <SuccessLine text="Bundle ID" detail={iosBundleId} />
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
              setStep(value === 'retry' ? 'detecting-ci-secrets' : 'ask-build')
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
                setStep('ask-build')
                return
              }
              const target = ciSecretTargets.find(candidate => candidate.provider === value) || null
              setCiSecretTarget(target)
              setStep(target ? 'ask-ci-secrets' : 'ask-build')
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
              setStep(value === 'yes' ? 'checking-ci-secrets' : 'ask-build')
            }}
          />
        </Box>
      )}

      {step === 'checking-ci-secrets' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text={`Checking existing env vars in ${getCiSecretTargetLabel(ciSecretTarget)}...`} />
        </Box>
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
              setStep(value === 'replace' ? 'uploading-ci-secrets' : 'ask-build')
            }}
          />
        </Box>
      )}

      {step === 'uploading-ci-secrets' && (
        <Box flexDirection="column" marginTop={1}>
          <SpinnerLine text={`Uploading env vars to ${getCiSecretTargetLabel(ciSecretTarget)}...`} />
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
              setStep(value === 'retry' ? (ciSecretTarget ? 'checking-ci-secrets' : 'detecting-ci-secrets') : 'ask-build')
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
                  // When the failed step was verifying-key (i.e. Apple
                  // rejected the JWT), the cause is almost always a typo
                  // in the Key ID or Issuer ID — the .p8 contents itself
                  // doesn't typically corrupt. Offer explicit edit paths
                  // that pre-fill the current value so users don't retype
                  // from scratch. (FilteredTextInput now accepts
                  // initialValue; input-key-id and input-issuer-id pass
                  // the current state through.)
                  ...(retryStep === 'verifying-key'
                    ? [
                        { label: `✏️   Edit Key ID (currently: ${keyIdRef.current || '—'})`, value: 'edit-key-id' },
                        { label: `✏️   Edit Issuer ID (currently: ${issuerIdRef.current || '—'})`, value: 'edit-issuer-id' },
                        // "Change key file" covers the case where the wrong
                        // .p8 was selected entirely (e.g. picked an old key
                        // that's been revoked, or grabbed a file from the
                        // wrong account). Routes back to api-key-instructions
                        // so the user can re-open the file picker or type a
                        // new path. The auto-detection in p8-method-select
                        // will populate Key ID from the new filename;
                        // Issuer ID stays the same since it's account-scoped.
                        { label: `📄  Change .p8 key file (currently: ${p8PathRef.current ? p8PathRef.current.split('/').pop() : '—'})`, value: 'change-key-file' },
                      ]
                    : []),
                  { label: '↩️   Restart onboarding', value: 'restart' },
                  { label: '❌  Exit', value: 'exit' },
                ]}
                onChange={async (value) => {
                  if (value === 'retry') {
                    setError(null)
                    pickerOpenedRef.current = false
                    setStep(retryStep)
                  }
                  else if (value === 'edit-key-id') {
                    setError(null)
                    setStep('input-key-id')
                  }
                  else if (value === 'edit-issuer-id') {
                    setError(null)
                    setStep('input-issuer-id')
                  }
                  else if (value === 'change-key-file') {
                    setError(null)
                    // Reset the picker-opened guard so p8-method-select can
                    // re-open the macOS file picker dialog from a fresh state.
                    pickerOpenedRef.current = false
                    setStep('api-key-instructions')
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
