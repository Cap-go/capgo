import type { FC } from 'react'
import type { BuildLogger } from '../../../request.js'
import type { GcpProject } from '../gcp-api.js'
import type {
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
import { findSavedKey } from '../../../../utils.js'
import { loadSavedCredentials, updateSavedCredentials } from '../../../credentials.js'
import { requestBuildInternal } from '../../../request.js'
import { canUseFilePicker, openKeystorePicker } from '../../file-picker.js'
import { findAndroidApplicationIds } from '../gradle-parser.js'
import { Divider, ErrorLine, FilteredTextInput, Header, SpinnerLine, SuccessLine } from '../../ui/components.js'
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

const AndroidOnboardingApp: FC<AppProps> = ({ appId, initialProgress, androidDir }) => {
  const { exit } = useApp()
  const startStep: AndroidOnboardingStep = getAndroidResumeStep(initialProgress)

  const [step, setStep] = useState<AndroidOnboardingStep>(
    startStep === 'welcome' ? 'welcome' : startStep,
  )
  const [logLines, setLogLines] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [retryStep, setRetryStep] = useState<AndroidOnboardingStep | null>(null)
  const exitRequestedRef = useRef(false)
  const pickerOpenedRef = useRef(false)
  const oauthStartedRef = useRef(false)
  const setupStartedRef = useRef(false)
  const [keystorePathMode, setKeystorePathMode] = useState<'choose' | 'manual'>('choose')

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

  // Phase 2 — Google sign-in
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

  const { stdout } = useStdout()
  const terminalRows = stdout?.rows ?? 24

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

  async function doSaveCredentials() {
    if (!keystoreReady || !keystoreBase64)
      throw new Error('keystore not ready')
    if (!serviceAccountKeyBase64)
      throw new Error('service-account key not provisioned')
    if (!keystoreStorePassword || !keystoreAlias)
      throw new Error('keystore inputs missing')

    await updateSavedCredentials(appId, 'android', {
      ANDROID_KEYSTORE_FILE: keystoreBase64,
      KEYSTORE_KEY_ALIAS: keystoreAlias,
      KEYSTORE_STORE_PASSWORD: keystoreStorePassword,
      KEYSTORE_KEY_PASSWORD: keystoreKeyPassword || keystoreStorePassword,
      PLAY_CONFIG_JSON: serviceAccountKeyBase64,
    })
    await deleteAndroidProgress(appId)
    addLog('✔ Credentials saved')
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
          // Smart-route: skip phases already complete (e.g. on resume).
          const fresh = await loadAndroidProgress(appId)
          if (cancelled)
            return
          setStep(fresh ? getAndroidResumeStep(fresh) : 'google-sign-in')
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
          if (randomPasswordGenerated)
            addLog(`  ℹ The generated password is stored in ~/.capgo-credentials/credentials.json — back up that file.`, 'yellow')
          setRetryCount(0)
          setStep('google-sign-in')
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
          await doSaveCredentials()
          if (cancelled)
            return
          setStep('ask-build')
        }
        catch (err) {
          if (!cancelled)
            handleError(err, 'saving-credentials')
        }
      })()
    }

    if (step === 'requesting-build') {
      ;(async () => {
        try {
          let capgoKey: string | undefined
          try {
            capgoKey = findSavedKey(true)
          }
          catch {}
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
          }, true, buildLogger)
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
          if (!cancelled) {
            setBuildOutput(prev => [...prev, `⚠ ${err instanceof Error ? err.message : String(err)}`])
            setBuildOutput(prev => [...prev, 'Your credentials are saved. Run `capgo build request --platform android` to try again.'])
            setStep('build-complete')
          }
        }
      })()
    }

    if (step === 'build-complete') {
      setBuildOutput([])
      const timer = setTimeout(() => {
        if (!cancelled)
          exit()
      }, 100)
      return () => { cancelled = true; clearTimeout(timer) }
    }

    return () => { cancelled = true }
  }, [step])

  const progressPct = ANDROID_STEP_PROGRESS[step] ?? 0
  const phaseLabel = getAndroidPhaseLabel(step)
  const showProgress = step !== 'welcome' && step !== 'error' && step !== 'build-complete' && step !== 'requesting-build'
  const showHeader = step !== 'requesting-build'
  const showLog = step !== 'requesting-build' && step !== 'build-complete'

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
                  // Smart-route: skip phases already complete (same pattern as
                  // the auto-probe branch in the useEffect above) so a resume
                  // that re-enters key-password doesn't drag the user back to
                  // google-sign-in if they've already completed it.
                  const fresh = await loadAndroidProgress(appId)
                  setStep(fresh ? getAndroidResumeStep(fresh) : 'google-sign-in')
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

      {/* ── Phase 2 — Google sign-in ── */}

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
                      if (value === '__manual__') {
                        setPackageSelectMode('manual')
                        return
                      }
                      const choice: AndroidPackageChoice = {
                        packageName: value,
                        source: 'gradle',
                      }
                      setAndroidPackageChoice(choice)
                      addLog(`✔ Android package — ${value}`)
                      persistAndStep(
                        (p) => ({
                          ...p,
                          completedSteps: { ...p.completedSteps, androidPackageChosen: choice },
                        }),
                        'gcp-setup-running',
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
                      persistAndStep(
                        (p) => ({
                          ...p,
                          completedSteps: { ...p.completedSteps, androidPackageChosen: choice },
                        }),
                        'gcp-setup-running',
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
          {buildUrl && (
            <>
              <Newline />
              <Text>Track your build: <Text color="cyan" underline>{buildUrl}</Text></Text>
            </>
          )}
        </Box>
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
