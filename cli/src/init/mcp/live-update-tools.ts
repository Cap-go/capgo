import { z } from 'zod'
import process from 'node:process'
// src/init/mcp/live-update-tools.ts
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CapgoSDK } from '../../sdk.js'
import type { LiveUpdateNextStepInput } from '../../schemas/live-update-onboarding.js'
import { liveUpdateNextStepSchema } from '../../schemas/live-update-onboarding.js'
import { getPlatformDirFromCapacitorConfig } from '../../build/platform-paths.js'
import { isAppAlreadyExistsError } from '../app-conflict.js'
import {
  applyInitAutoTestChange,
  getGitRepoStatus,
  getInitSuggestedOtaVersion,
  getInitUpdaterPluginConfig,
} from '../command.js'
import { getUpdaterInstallState } from '../updater.js'
import { findSavedKeySilent, findMainFile, findRoot, getAppId, getBundleVersion, getConfig, getPMAndCommand, PACKNAME, updateConfigUpdater } from '../../utils.js'
import { formatRunnerCommand } from '../../runner-command.js'
import { addChannelInternal } from '../../channel/add.js'
import { uploadBundleInternal } from '../../bundle/upload.js'
import { execSync } from 'node:child_process'
import type { Platform } from './contract.js'
import { renderResult } from './contract.js'
import type { EngineDeps } from './engine.js'
import { explainLiveUpdateOnboarding, runAdvance, runStart } from './engine.js'
import { clearLiveUpdateProgress, loadLiveUpdateProgress, saveLiveUpdateProgress } from './progress.js'

interface McpLike {
  tool: (
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: (args: any) => Promise<{ content: Array<{ type: 'text', text: string }> }>,
  ) => unknown
  prompt?: (
    name: string,
    description: string,
    handler: () => { messages: Array<{ role: 'user' | 'assistant', content: { type: 'text', text: string } }> },
  ) => unknown
}

const DEFAULT_CHANNEL = 'production'
const importInject = 'import { CapacitorUpdater } from \'@capgo/capacitor-updater\''
const codeInject = 'CapacitorUpdater.notifyAppReady()'

function getRunDeviceCommandForPlatform(platform: Platform): { command: string } {
  const pm = getPMAndCommand()
  const args = ['cap', 'run', platform]
  return { command: formatRunnerCommand(pm.runner, args) }
}

export function buildDeps(sdk: CapgoSDK, cwd = process.cwd()): EngineDeps {
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
        // not a capacitor project
      }
      return out
    },
    isAppRegistered: async (appId: string) => {
      const res = await sdk.appHasAccess(appId)
      return res.success && res.data === true
    },
    loadProgress: () => loadLiveUpdateProgress(),
    saveProgress: data => saveLiveUpdateProgress(data),
    clearProgress: () => clearLiveUpdateProgress(),
    registerApp: async (appId: string) => {
      const res = await sdk.addApp({ appId })
      if (res.success)
        return { ok: true as const }
      const error = res.error || 'Failed to register app'
      return { ok: false as const, alreadyExists: isAppAlreadyExistsError(error), error }
    },
    ensureChannel: async (appId: string, channelName: string) => {
      try {
        const apikey = findSavedKeySilent() ?? ''
        await addChannelInternal(channelName, appId, { default: true, apikey }, true)
        return { ok: true as const }
      }
      catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
      }
    },
    installUpdater: async (appId: string) => {
      try {
        const packageJsonPath = join(findRoot(cwd), PACKNAME)
        const projectDir = dirname(packageJsonPath)
        const installState = getUpdaterInstallState(packageJsonPath)
        if (!installState.ready) {
          const pm = getPMAndCommand()
          execSync(`${pm.pm} add @capgo/capacitor-updater@latest`, { cwd: projectDir, stdio: 'pipe' })
        }
        const delta = false
        await updateConfigUpdater(getInitUpdaterPluginConfig(appId, delta))
        const currentVersion = getBundleVersion(undefined, packageJsonPath) || '1.0.0'
        return { ok: true as const, delta, currentVersion }
      }
      catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
      }
    },
    addIntegrationCode: async (_appId: string) => {
      try {
        const packageJsonPath = join(findRoot(cwd), PACKNAME)
        const projectDir = dirname(packageJsonPath)
        const mainFile = await findMainFile(true, projectDir)
        if (!mainFile)
          return { ok: false as const, error: 'Could not find main entry file' }
        let content = await readFile(mainFile, 'utf8')
        if (!content.includes(codeInject)) {
          if (!content.includes('CapacitorUpdater'))
            content = `${importInject}\n${content}`
          if (content.includes('function App('))
            content = content.replace(/function App\(/, `${codeInject}\n\nfunction App(`)
          else
            content = `${content.trimEnd()}\n${codeInject}\n`
          await writeFile(mainFile, content, 'utf8')
        }
        return { ok: true as const }
      }
      catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
      }
    },
    setupEncryption: async (_appId: string, enable: boolean) => {
      if (!enable)
        return { ok: true as const, enabled: false }
      try {
        const res = await sdk.generateEncryptionKeys({ force: false })
        if (!res.success)
          return { ok: false as const, enabled: false, error: res.error ?? 'Encryption key generation failed' }
        return { ok: true as const, enabled: true }
      }
      catch (error) {
        return { ok: false as const, enabled: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
    buildProject: async (_appId: string, platform: Platform) => {
      try {
        const pm = getPMAndCommand()
        const projectDir = findRoot(cwd)
        execSync(`${pm.pm} run build`, { cwd: projectDir, stdio: 'pipe' })
        execSync(formatRunnerCommand(pm.runner, ['cap', 'sync', platform]), { cwd: projectDir, stdio: 'pipe' })
        return { ok: true as const }
      }
      catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
      }
    },
    applyTestChange: async (_appId: string, baseVersion?: string) => {
      try {
        const packageJsonPath = join(findRoot(cwd), PACKNAME)
        const projectDir = dirname(packageJsonPath)
        const mainFile = await findMainFile(true, projectDir)
        if (!mainFile)
          return { ok: false as const, error: 'Could not find main entry file for test change' }
        const content = await readFile(mainFile, 'utf8')
        const changed = applyInitAutoTestChange(mainFile, content)
        if (changed)
          await writeFile(mainFile, changed.content, 'utf8')
        const version = getInitSuggestedOtaVersion(baseVersion || getBundleVersion(undefined, packageJsonPath) || '1.0.0')
        return { ok: true as const, version }
      }
      catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
      }
    },
    uploadBundle: async (appId: string, opts) => {
      try {
        const projectDir = findRoot(cwd)
        const apikey = findSavedKeySilent() ?? ''
        await uploadBundleInternal(appId, {
          apikey,
          bundle: opts.version,
          channel: opts.channelName || DEFAULT_CHANNEL,
          deltaOnly: opts.delta,
          ignoreChecksumCheck: true,
          showReplicationProgress: false,
        }, true)
        return { ok: true as const }
      }
      catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
      }
    },
    getRunDeviceCommand: platform => getRunDeviceCommandForPlatform(platform),
    getGitStatus: startDir => getGitRepoStatus(startDir ?? cwd),
  }
}

export function registerLiveUpdateTools(server: McpLike, sdk: CapgoSDK, depsOverride?: EngineDeps): void {
  const deps = depsOverride ?? buildDeps(sdk)

  server.tool(
    'start_capgo_live_update_onboarding',
    'Start (or resume) the guided Capgo live-update (OTA) setup for this Capacitor project — register the app, install the updater plugin, build, upload a test bundle, and confirm OTA delivery. ALWAYS call this FIRST when the user wants to set up or troubleshoot Capgo OTA / live updates. Do NOT configure Capgo yourself — this tool conducts the flow.',
    {},
    async () => {
      const result = await runStart(deps)
      return { content: [{ type: 'text' as const, text: renderResult(result) }] }
    },
  )

  server.tool(
    'capgo_live_update_onboarding_next_step',
    'Advance the guided Capgo live-update onboarding by one step. Call ONLY as directed by the previous result\'s `next`. Pass the user\'s choice when the previous step asked for one.',
    liveUpdateNextStepSchema.shape,
    async (args: LiveUpdateNextStepInput) => {
      const result = await runAdvance(deps, args)
      return { content: [{ type: 'text' as const, text: renderResult(result) }] }
    },
  )

  server.tool(
    'capgo_live_update_onboarding_explain',
    'Explain a Capgo live-update onboarding step in plain language — call when the user is confused. Defaults to the CURRENT step; pass { state } for a specific one. Read-only; never advances the flow.',
    {
      state: z.string().optional().describe('Optional state name to explain (from a prior result state field).'),
    },
    async (args: { state?: string }) => {
      const text = await explainLiveUpdateOnboarding(deps, args)
      return { content: [{ type: 'text' as const, text }] }
    },
  )

  server.prompt?.(
    'capgo-live-update-setup',
    'Set up Capgo live updates (OTA) for this Capacitor app — starts the guided onboarding.',
    () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: 'Set up Capgo live updates (OTA) in this project. Call start_capgo_live_update_onboarding now, then follow each result\'s `next` field — using capgo_live_update_onboarding_next_step and capgo_live_update_onboarding_explain exactly as directed — until setup is complete. Do NOT configure Capgo manually.',
        },
      }],
    }),
  )
}
