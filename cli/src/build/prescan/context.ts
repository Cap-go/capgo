// src/build/prescan/context.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/supabase.types'
import type { Platform, ScanContext } from './types'
import { chdir, cwd } from 'node:process'
import { getConfig } from '../../utils'
import { mergeCredentials } from '../credentials'

export interface BuildScanContextArgs {
  appId?: string
  platform: Platform
  projectDir: string
  distributionMode?: 'app_store' | 'ad_hoc'
  androidFlavor?: string
  apikey?: string
  supabase?: SupabaseClient<Database>
  /** pre-merged credentials when called from build request (avoids double work) */
  credentials?: Record<string, string>
}

let cwdQueue: Promise<unknown> = Promise.resolve()

/**
 * Run an async function with the process working directory temporarily set to `dir`.
 *
 * NOTE: `process.chdir()` is global, so this uses a simple in-process queue to avoid
 * concurrent calls interfering with each other (mirrors `withCwd` in `../request.ts`).
 */
async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const previous = cwd()
    try {
      chdir(dir)
    }
    catch (error) {
      throw new Error(`Failed to change working directory to "${dir}": ${(error as Error).message}`)
    }

    try {
      return await fn()
    }
    finally {
      try {
        chdir(previous)
      }
      catch {
        // Best-effort restore; ignore to avoid masking original errors.
      }
    }
  }

  const p = cwdQueue.then(run, run)
  cwdQueue = p.then(() => undefined, () => undefined)
  return p
}

export async function buildScanContext(args: BuildScanContextArgs): Promise<ScanContext> {
  let config
  // @capacitor/cli loadConfig() is cwd-based; honor projectDir for monorepos/workspaces.
  try { config = (await withCwd(args.projectDir, () => getConfig(true))).config }
  catch { config = undefined } // no capacitor project — checks degrade individually
  const appId = args.appId ?? config?.appId
  if (!appId) throw new Error('Missing appId: pass it explicitly or run inside a Capacitor project')
  const credentials = args.credentials
    ?? (await mergeCredentials(appId, args.platform) as Record<string, string> | undefined)
  return {
    appId,
    platform: args.platform,
    projectDir: args.projectDir,
    config,
    credentials,
    distributionMode: args.distributionMode,
    androidFlavor: args.androidFlavor,
    apikey: args.apikey,
    supabase: args.supabase,
  }
}
