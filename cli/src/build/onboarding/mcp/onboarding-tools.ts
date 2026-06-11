// src/build/onboarding/mcp/onboarding-tools.ts
import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import process from 'node:process'
import type { CapgoSDK } from '../../../sdk.js'
import type { OnboardingNextStepInput } from '../../../schemas/onboarding.js'
import { isAppAlreadyExistsError } from '../../../init/app-conflict.js'
import { onboardingNextStepSchema } from '../../../schemas/onboarding.js'
import { findSavedKeySilent, formatError, getAppId, getConfig } from '../../../utils.js'
import { loadSavedCredentials, updateSavedCredentials } from '../../credentials.js'
import { getPlatformDirFromCapacitorConfig } from '../../platform-paths.js'
import type { AndroidEffectDeps } from '../android/flow.js'
import { findAndroidApplicationIds } from '../android/gradle-parser.js'
import { generateKeystore, listKeystoreAliases, sanitizeKeystoreAlias, tryUnlockPrivateKey } from '../android/keystore.js'
import { fetchCapgoOAuthConfig } from '../android/oauth-config.js'
import { fetchUserInfo, refreshAccessToken, revokeToken, runOAuthFlow, startOAuthFlow } from '../android/oauth-google.js'

import { OAUTH_SCOPES_FOR_ONBOARDING } from '../android/oauth-scopes.js'
import { createProject, createServiceAccountKey, enableService, ensureServiceAccount, listProjects } from '../android/gcp-api.js'
import { inviteServiceAccount } from '../android/play-api.js'
import { deleteAndroidProgress, loadAndroidProgress, saveAndroidProgress } from '../android/progress.js'
import { validateServiceAccountJson } from '../android/service-account-validation.js'
import { createCertificate, createProfile, ensureBundleId, generateJwt, verifyApiKey } from '../apple-api.js'
import { createP12, DEFAULT_P12_PASSWORD, generateCsr } from '../csr.js'
import { loadProgress, saveProgress } from '../progress.js'
import { defaultBuildRecordPath, readBuildOutputRecord } from '../../output-record.js'
import type { Platform } from './contract.js'
import { renderResult } from './contract.js'
import type { EngineDeps } from './engine.js'
import { explainOnboarding, runAdvance, runStart } from './engine.js'
import { canLaunchTerminal, launchBuildInTerminal } from './terminal-launch.js'

/** Minimal shape of the MCP server's tool registrar (matches McpServer.tool). */
interface McpLike {
  tool: (
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: (args: any) => Promise<{ content: Array<{ type: 'text', text: string }> }>,
  ) => unknown
}

/**
 * Build the AndroidEffectDeps wiring that the MCP bridge (Task 4) will use
 * to drive the headless core. The function pre-binds the OAuth client config
 * and the android project dir so the core never sees credentials or paths
 * directly — config policy lives here in the driver.
 */
function buildAndroidEffectDeps(
  cwd: string,
  getAppIdFn: () => Promise<string | undefined>,
): AndroidEffectDeps {
  // Local OAuth config cache — fetched once per buildAndroidEffectDeps lifetime.
  let configCache: Awaited<ReturnType<typeof fetchCapgoOAuthConfig>> | undefined

  async function getConfig_(): Promise<NonNullable<Awaited<ReturnType<typeof fetchCapgoOAuthConfig>>>> {
    if (configCache === undefined) {
      configCache = await fetchCapgoOAuthConfig()
    }
    if (!configCache) {
      throw new Error(
        'Android OAuth onboarding is not available — the Capgo backend has no Google OAuth client configured. '
        + 'Use the manual service-account flow instead.',
      )
    }
    return configCache
  }

  // Local access-token cache — cleared when the refresh token is revoked.
  // Stores the token alongside its expiry so we can detect and refresh stale tokens.
  let cachedAccessToken: { token: string, expiresAt: number } | null = null

  async function getAccessToken(): Promise<string> {
    // Return cached token only if it is still valid with a 60s safety margin.
    if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60_000) {
      return cachedAccessToken.token
    }
    const appId = await getAppIdFn()
    if (!appId) {
      throw new Error('Not signed in — re-run onboarding to re-authenticate with Google.')
    }
    const progress = await loadAndroidProgress(appId)
    const refreshToken = progress?._oauthRefreshToken
    if (!refreshToken) {
      throw new Error('Not signed in — re-run onboarding to re-authenticate with Google.')
    }
    const cfg = await getConfig_()
    const tokens = await refreshAccessToken(
      { clientId: cfg.clientId, clientSecret: cfg.clientSecret, scopes: OAUTH_SCOPES_FOR_ONBOARDING },
      refreshToken,
    )
    cachedAccessToken = { token: tokens.accessToken, expiresAt: tokens.expiresAt }
    return tokens.accessToken
  }

  return {
    // ── Keystore ──────────────────────────────────────────────────────────────
    generateKeystore,
    listKeystoreAliases,
    tryUnlockPrivateKey,

    // ── Service account validation ────────────────────────────────────────────
    validateServiceAccountJson,

    // ── Build credentials persistence ─────────────────────────────────────────
    updateSavedCredentials,
    loadSavedCredentials: (appId: string) => loadSavedCredentials(appId),

    // ── Onboarding progress persistence ───────────────────────────────────────
    saveAndroidProgress,
    loadAndroidProgress,
    deleteAndroidProgress,

    // ── File system ───────────────────────────────────────────────────────────
    readFile: (path: string) => readFile(path) as Promise<Buffer>,
    copyFile,

    // ── OAuth ─────────────────────────────────────────────────────────────────
    runOAuthFlow: async (callbacks) => {
      const cfg = await getConfig_()
      return runOAuthFlow(
        { clientId: cfg.clientId, clientSecret: cfg.clientSecret, scopes: OAUTH_SCOPES_FOR_ONBOARDING },
        callbacks,
      )
    },
    startOAuthFlow: async (callbacks) => {
      const cfg = await getConfig_()
      return startOAuthFlow(
        { clientId: cfg.clientId, clientSecret: cfg.clientSecret, scopes: OAUTH_SCOPES_FOR_ONBOARDING },
        callbacks,
      )
    },
    fetchUserInfo,
    getAccessToken,
    revokeToken: async (refreshToken: string) => {
      cachedAccessToken = null
      return revokeToken(refreshToken)
    },

    // ── GCP ───────────────────────────────────────────────────────────────────
    listProjects,
    createProject,
    enableService,
    ensureServiceAccount,
    createServiceAccountKey,

    // ── Play API ──────────────────────────────────────────────────────────────
    inviteServiceAccount: async (args) => {
      await inviteServiceAccount(args)
    },

    // ── Android Gradle detection ──────────────────────────────────────────────
    findAndroidApplicationIds: async () => {
      let androidDir = 'android'
      try {
        const ext = await getConfig(true)
        androidDir = getPlatformDirFromCapacitorConfig(ext?.config, 'android') || 'android'
      }
      catch {
        // Not a Capacitor project or config unreadable — fall back to 'android'
      }
      return findAndroidApplicationIds(androidDir, cwd)
    },
  }
}

/** Build the real IO deps from the SDK + CLI utils. */
function buildDeps(sdk: CapgoSDK): EngineDeps {
  const cwd = process.cwd()
  const getAppIdClosure = async (): Promise<string | undefined> => {
    try {
      const ext = await getConfig(true)
      return getAppId(undefined, ext?.config)
    }
    catch {
      return undefined
    }
  }
  return {
    cwd,
    hasSavedKey: () => Boolean(findSavedKeySilent()),
    getAppId: getAppIdClosure,
    detectPlatforms: async () => {
      const out: Platform[] = []
      try {
        const ext = await getConfig(true)
        const iosDir = getPlatformDirFromCapacitorConfig(ext?.config, 'ios')
        const androidDir = getPlatformDirFromCapacitorConfig(ext?.config, 'android')
        if (existsSync(join(cwd, iosDir)))
          out.push('ios')
        if (existsSync(join(cwd, androidDir)))
          out.push('android')
      }
      catch {
        // not a Capacitor project — leave empty
      }
      return out
    },
    isAppRegistered: async (appId: string) => {
      const res = await sdk.listApps()
      if (!res.success || !res.data)
        return false
      return res.data.some((a: { app_id?: string, appId?: string }) => a.app_id === appId || a.appId === appId)
    },
    loadProgress: (appId: string) => loadProgress(appId),
    registerApp: async (appId: string) => {
      const res = await sdk.addApp({ appId })
      if (res.success)
        return { ok: true as const }
      const error = res.error || 'Failed to register app'
      return { ok: false as const, alreadyExists: isAppAlreadyExistsError(error), error }
    },
    loadAndroidProgress: (appId: string) => loadAndroidProgress(appId),
    readBuildRecord: readBuildOutputRecord,
    buildRecordPath: defaultBuildRecordPath,
    canLaunchTerminal: () => canLaunchTerminal(),
    launchBuildInTerminal: (cmd: string) => launchBuildInTerminal(cmd),
    setIosApiKey: async (appId: string, keyId: string, issuerId: string, p8Path: string) => {
      const base = (await loadProgress(appId)) ?? { platform: 'ios' as const, appId, startedAt: new Date().toISOString(), completedSteps: {} }
      await saveProgress(appId, { ...base, platform: 'ios', appId, setupMethod: 'create-new', keyId, issuerId, p8Path })
    },
    finalizeIosCredentials: async (appId: string) => {
      const prog = await loadProgress(appId)
      if (!prog?.keyId || !prog?.issuerId || !prog?.p8Path)
        return { ok: false as const, error: 'Missing App Store Connect API key details.' }
      try {
        const p8Content = await readFile(prog.p8Path, 'utf-8')
        const token = generateJwt(prog.keyId, prog.issuerId, p8Content)
        await verifyApiKey(token)
        const { csrPem, privateKeyPem } = generateCsr()
        const cert = await createCertificate(token, csrPem)
        const { p12Base64 } = createP12(cert.certificateContent, privateKeyPem)
        const { bundleIdResourceId } = await ensureBundleId(token, appId)
        const profile = await createProfile(token, bundleIdResourceId, cert.certificateId, appId)
        await updateSavedCredentials(appId, 'ios', {
          BUILD_CERTIFICATE_BASE64: p12Base64,
          P12_PASSWORD: DEFAULT_P12_PASSWORD,
          APPLE_KEY_ID: prog.keyId,
          APPLE_ISSUER_ID: prog.issuerId,
          APPLE_KEY_CONTENT: Buffer.from(p8Content).toString('base64'),
          APP_STORE_CONNECT_TEAM_ID: cert.teamId,
          CAPGO_IOS_PROVISIONING_MAP: JSON.stringify({ [appId]: profile.profileContent }),
        })
        await saveProgress(appId, {
          ...prog,
          completedSteps: {
            ...prog.completedSteps,
            apiKeyVerified: { keyId: prog.keyId, issuerId: prog.issuerId },
            certificateCreated: { certificateId: cert.certificateId, expirationDate: cert.expirationDate, teamId: cert.teamId, p12Base64 },
            profileCreated: { profileId: profile.profileId, profileName: profile.profileName, profileBase64: profile.profileContent },
          },
        })
        return { ok: true as const }
      }
      catch (err) {
        return { ok: false as const, error: formatError(err) }
      }
    },
    androidEffectDeps: buildAndroidEffectDeps(cwd, getAppIdClosure),
    writeKeystoreFile: async (appId: string, base64: string, alias: string): Promise<string> => {
      // Write the generated/loaded keystore to android/app/<alias>.p12, mirroring
      // the Ink wizard which uses the same path (keystore-generating hardcodes it).
      // `alias` comes from user input — sanitize it for the ON-DISK filename only
      // (the crypto alias / KEYSTORE_KEY_ALIAS keep the user's exact value).
      const androidAppDir = join(cwd, 'android', 'app')
      await mkdir(androidAppDir, { recursive: true })
      const safe = sanitizeKeystoreAlias(alias)
      const filePath = join(androidAppDir, `${safe}.p12`)
      // Defense-in-depth: the resolved path must stay inside androidAppDir.
      const resolvedDir = resolve(androidAppDir)
      const resolvedFile = resolve(filePath)
      if (resolvedFile !== resolvedDir && !resolvedFile.startsWith(resolvedDir + sep))
        throw new Error('Refusing to write keystore outside the android/app directory.')
      const bytes = Buffer.from(base64, 'base64')
      await writeFile(filePath, bytes)
      return filePath
    },
  }
}

/**
 * Register the 2-tool onboarding spine onto an MCP server.
 * `depsOverride` is for tests; production passes only `server` + `sdk`.
 */
export function registerOnboardingTools(server: McpLike, sdk: CapgoSDK, depsOverride?: EngineDeps): void {
  const deps = depsOverride ?? buildDeps(sdk)

  server.tool(
    'start_capgo_builder_onboarding',
    'Start or resume guided Capgo Builder onboarding — set up native iOS/Android cloud builds, signing, and a first cloud build. Call this whenever the user wants to set up, configure, or troubleshoot native builds. Takes no arguments; it inspects the project and returns the first step.',
    {},
    async () => {
      const result = await runStart(deps)
      return { content: [{ type: 'text' as const, text: renderResult(result) }] }
    },
  )

  server.tool(
    'capgo_builder_onboarding_next_step',
    'Advance the guided Capgo Builder onboarding by one step. Call ONLY as directed by the previous result\'s `next`. Pass the user\'s choice (e.g. platform) when the previous step asked for one.',
    onboardingNextStepSchema.shape,
    async (args: OnboardingNextStepInput) => {
      const result = await runAdvance(deps, args)
      return { content: [{ type: 'text' as const, text: renderResult(result) }] }
    },
  )

  server.tool(
    'capgo_builder_onboarding_explain',
    'Explain the CURRENT Capgo Builder onboarding step in plain language — call this whenever the user is confused, asks what a step means, or does not understand the options. Read-only; it never advances the flow.',
    {},
    async () => {
      const text = await explainOnboarding(deps)
      return { content: [{ type: 'text' as const, text }] }
    },
  )
}
