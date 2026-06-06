// src/build/prescan/command.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/supabase.types'
import type { OutcomeOptions, Platform, PrescanReport, Severity } from './types'
import { cwd, exit } from 'node:process'
import { intro, log, outro } from '@clack/prompts'
import { createSupabaseClient, findSavedKey } from '../../utils'
import { buildScanContext } from './context'
import { decideOutcome, runPrescan } from './engine'
import { ALL_CHECKS } from './registry'
import { renderJsonReport, renderTerminalReport } from './report'

export interface PrescanCommandOptions {
  platform?: string
  path?: string
  apikey?: string
  androidFlavor?: string
  iosDist?: 'app_store' | 'ad_hoc'
  json?: boolean
  failOnWarnings?: boolean
  ignoreFatal?: boolean
  verbose?: boolean
  supaHost?: string
  supaAnon?: string
}

export function validateFlags(opts: Pick<PrescanCommandOptions, 'failOnWarnings' | 'ignoreFatal'>): void {
  if (opts.failOnWarnings && opts.ignoreFatal)
    throw new Error('--ignore-fatal and --fail-on-warnings are contradictory — pick one')
}

export function exitCodeFor(counts: Record<Severity, number>, opts: OutcomeOptions): number {
  if (opts.ignoreFatal)
    return 0
  if (counts.error > 0)
    return 1
  if (counts.warning > 0 && opts.failOnWarnings)
    return 2
  return 0
}

/** Shared scan runner used by both the standalone command and build request's gate. */
export async function executePrescan(appId: string | undefined, options: PrescanCommandOptions): Promise<PrescanReport> {
  const platform = options.platform as Platform
  if (platform !== 'ios' && platform !== 'android')
    throw new Error('--platform must be ios or android')
  let apikey: string | undefined
  let supabase: SupabaseClient<Database> | undefined
  try {
    apikey = options.apikey ?? findSavedKey(true)
    supabase = await createSupabaseClient(apikey, options.supaHost, options.supaAnon, true)
  }
  catch { /* no key: remote checks will be skipped with a notice */ }
  const ctx = await buildScanContext({
    appId,
    platform,
    projectDir: options.path ?? cwd(),
    distributionMode: options.iosDist,
    androidFlavor: options.androidFlavor,
    apikey,
    supabase,
  })
  return runPrescan(ctx, ALL_CHECKS)
}

export async function prescanCommand(appId: string | undefined, options: PrescanCommandOptions): Promise<void> {
  validateFlags(options)
  if (!options.json)
    intro('Capgo build prescan')
  const report = await executePrescan(appId, options)
  if (options.json) {
    console.log(renderJsonReport(report))
  }
  else {
    log.message(renderTerminalReport(report, { verbose: options.verbose }))
    const outcome = decideOutcome(report, options)
    outro(outcome === 'block' ? 'Prescan found blocking problems — fix them before building.' : 'Prescan finished.')
  }
  exit(exitCodeFor(report.counts, options))
}
