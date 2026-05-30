// src/build/onboarding/mcp/onboarding-tools.ts
import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { z } from 'zod'
import type { CapgoSDK } from '../../../sdk.js'
import { isAppAlreadyExistsError } from '../../../init/app-conflict.js'
import { findSavedKeySilent, getAppId, getConfig } from '../../../utils.js'
import { updateSavedCredentials } from '../../credentials.js'
import { getPlatformDirFromCapacitorConfig } from '../../platform-paths.js'
import { generateKeystore, generateRandomPassword } from '../android/keystore.js'
import { loadAndroidProgress, saveAndroidProgress } from '../android/progress.js'
import { validateServiceAccountJson } from '../android/service-account-validation.js'
import { loadProgress } from '../progress.js'
import type { Platform } from './contract.js'
import { renderResult } from './contract.js'
import type { EngineDeps } from './engine.js'
import { runAdvance, runStart } from './engine.js'

/** Minimal shape of the MCP server's tool registrar (matches McpServer.tool). */
interface McpLike {
  tool: (
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: (args: any) => Promise<{ content: Array<{ type: 'text', text: string }> }>,
  ) => unknown
}

/** Build the real IO deps from the SDK + CLI utils. */
function buildDeps(sdk: CapgoSDK): EngineDeps {
  const cwd = process.cwd()
  return {
    cwd,
    hasSavedKey: () => Boolean(findSavedKeySilent()),
    getAppId: async () => {
      try {
        const ext = await getConfig(true)
        return getAppId(undefined, ext?.config)
      }
      catch {
        return undefined
      }
    },
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
    generateAndroidKeystore: async (appId: string) => {
      const storePassword = generateRandomPassword()
      const keyPassword = generateRandomPassword()
      const alias = 'release'
      const ks = generateKeystore({ alias, storePassword, keyPassword, dname: { commonName: appId } })
      const base = (await loadAndroidProgress(appId)) ?? { platform: 'android' as const, appId, startedAt: new Date().toISOString(), completedSteps: {} }
      await saveAndroidProgress(appId, {
        ...base,
        platform: 'android',
        appId,
        keystoreMethod: 'generate',
        keystoreAlias: alias,
        keystoreStorePassword: storePassword,
        keystoreKeyPassword: keyPassword,
        keystoreCommonName: appId,
        _keystoreBase64: ks.p12Base64,
        completedSteps: { ...base.completedSteps, keystoreReady: { keystorePath: '', alias, isGenerated: true } },
      })
    },
    setAndroidServiceAccountPath: async (appId: string, path: string) => {
      const base = (await loadAndroidProgress(appId)) ?? { platform: 'android' as const, appId, startedAt: new Date().toISOString(), completedSteps: {} }
      await saveAndroidProgress(appId, {
        ...base,
        platform: 'android',
        appId,
        serviceAccountMethod: 'existing',
        serviceAccountJsonPath: path,
      })
    },
    finalizeAndroidCredentials: async (appId: string) => {
      const prog = await loadAndroidProgress(appId)
      if (!prog?.serviceAccountJsonPath)
        return { ok: false as const, error: 'No service-account JSON path on file.' }
      let jsonBytes: Buffer
      try {
        jsonBytes = await readFile(prog.serviceAccountJsonPath)
      }
      catch {
        return { ok: false as const, error: `Could not read the service-account file at ${prog.serviceAccountJsonPath}.` }
      }
      const validation = await validateServiceAccountJson({ jsonBytes, packageName: appId })
      if (!validation.ok)
        return { ok: false as const, error: validation.message }
      if (!prog._keystoreBase64 || !prog.keystoreAlias || !prog.keystoreStorePassword || !prog.keystoreKeyPassword)
        return { ok: false as const, error: 'Keystore is missing — re-run keystore generation.' }
      await updateSavedCredentials(appId, 'android', {
        ANDROID_KEYSTORE_FILE: prog._keystoreBase64,
        KEYSTORE_KEY_ALIAS: prog.keystoreAlias,
        KEYSTORE_KEY_PASSWORD: prog.keystoreKeyPassword,
        KEYSTORE_STORE_PASSWORD: prog.keystoreStorePassword,
        PLAY_CONFIG_JSON: jsonBytes.toString('base64'),
      })
      await saveAndroidProgress(appId, {
        ...prog,
        completedSteps: { ...prog.completedSteps, serviceAccountProvisioned: { email: validation.serviceAccountEmail, projectId: validation.projectId } },
      })
      return { ok: true as const }
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
    {
      platform: z.enum(['ios', 'android']).optional().describe('Platform choice, when the previous step asked for it'),
      serviceAccountJsonPath: z.string().optional().describe('Path to your Google Play service-account JSON file, when the previous step asked for it'),
    },
    async ({ platform, serviceAccountJsonPath }: { platform?: Platform, serviceAccountJsonPath?: string }) => {
      const result = await runAdvance(deps, { platform, serviceAccountJsonPath })
      return { content: [{ type: 'text' as const, text: renderResult(result) }] }
    },
  )
}
