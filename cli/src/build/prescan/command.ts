// src/build/prescan/command.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/supabase.types'
import type { OutcomeOptions, Platform, PrescanReport, Severity } from './types'
import { cwd, exit } from 'node:process'
import { intro, log, outro } from '@clack/prompts'
import { createSupabaseClient, findSavedKey, sendEvent } from '../../utils'
import { buildScanContext } from './context'
import { decideOutcome, runPrescan } from './engine'
import { resolveWarningGate } from './prompt'
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

export interface PrescanExecution {
  report: PrescanReport
  /** apikey actually used for the scan (flag or saved key); undefined when remote checks were skipped */
  apikey?: string
}

/** Shared scan runner used by both the standalone command and build request's gate. */
export async function executePrescan(appId: string | undefined, options: PrescanCommandOptions): Promise<PrescanExecution> {
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
  const report = await runPrescan(ctx, ALL_CHECKS)
  return { report, apikey }
}

export async function prescanCommand(appId: string | undefined, options: PrescanCommandOptions): Promise<void> {
  validateFlags(options)
  if (!options.json)
    intro('Capgo build prescan')
  const { report, apikey: apikeyUsedForScan } = await executePrescan(appId, options)
  if (options.json) {
    console.log(renderJsonReport(report))
  }
  else {
    log.message(renderTerminalReport(report, { verbose: options.verbose }))
    const outcome = decideOutcome(report, options)
    outro(outcome === 'block' ? 'Prescan found blocking problems — fix them before building.' : 'Prescan finished.')
  }
  if (apikeyUsedForScan) {
    await sendEvent(apikeyUsedForScan, {
      channel: 'build',
      event: 'Prescan run',
      icon: '🛡️',
      tags: {
        'app-id': appId ?? 'unknown',
        'platform': options.platform ?? 'unknown',
        'errors': String(report.counts.error),
        'warnings': String(report.counts.warning),
        'finding-ids': report.findings.filter(f => f.severity !== 'info').map(f => f.id).join(',').slice(0, 200),
      },
      notify: false,
    }, options.verbose).catch(() => {})
  }
  exit(exitCodeFor(report.counts, options))
}

export interface PrescanGateOptions {
  enabled: boolean
  ignoreFatal?: boolean
  failOnWarnings?: boolean
  /** test seam; defaults to canPromptInteractively() (via resolveWarningGate) at call time */
  interactive?: boolean
  silent?: boolean
}

/**
 * Used by build request. Runs the scan via the provided thunk, prints the report,
 * and resolves to 'proceed' | 'block'. NEVER throws: a crashing scanner proceeds with a notice
 * (the scanner must never be worse than no scanner).
 */
export async function runPrescanGate(
  opts: PrescanGateOptions,
  scan: () => Promise<PrescanReport>,
): Promise<'proceed' | 'block'> {
  if (!opts.enabled)
    return 'proceed'
  let report: PrescanReport
  try {
    report = await scan()
  }
  catch (e) {
    log.warn(`prescan crashed and was skipped: ${e instanceof Error ? e.message : String(e)}`)
    return 'proceed'
  }
  if (report.findings.length > 0)
    log.message(renderTerminalReport(report, {}))
  const outcome = decideOutcome(report, { ignoreFatal: opts.ignoreFatal, failOnWarnings: opts.failOnWarnings })
  if (outcome === 'ask') {
    if (opts.interactive === false)
      return 'proceed'
    return resolveWarningGate('ask', { silent: opts.silent })
  }
  return outcome
}
