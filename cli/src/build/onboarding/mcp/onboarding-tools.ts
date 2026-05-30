// src/build/onboarding/mcp/onboarding-tools.ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { z } from 'zod'
import type { CapgoSDK } from '../../../sdk.js'
import { findSavedKeySilent, getAppId, getConfig } from '../../../utils.js'
import { getPlatformDirFromCapacitorConfig } from '../../platform-paths.js'
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
    },
    async ({ platform }: { platform?: Platform }) => {
      const result = await runAdvance(deps, { platform })
      return { content: [{ type: 'text' as const, text: renderResult(result) }] }
    },
  )
}
