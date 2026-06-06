// src/build/prescan/engine.ts
import type { Finding, OutcomeOptions, PrescanCheck, PrescanOutcome, PrescanReport, ScanContext, Severity } from './types'

interface EngineOptions { checkTimeoutMs?: number }

const DEFAULT_CHECK_TIMEOUT_MS = 10_000

export async function runPrescan(ctx: ScanContext, checks: PrescanCheck[], options: EngineOptions = {}): Promise<PrescanReport> {
  const start = Date.now()
  const timeoutMs = options.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS
  const applicable = checks.filter(c => c.platforms.includes(ctx.platform) && (c.appliesTo ? c.appliesTo(ctx) : true))
  const remoteSkipped = applicable.filter(c => c.remote && !ctx.supabase)
  const runnable = applicable.filter(c => !(c.remote && !ctx.supabase))

  const findings = (await Promise.all(runnable.map(c => runIsolated(c, ctx, timeoutMs)))).flat()

  if (remoteSkipped.length > 0) {
    findings.push({
      id: 'prescan/remote-skipped',
      severity: 'info',
      title: `${remoteSkipped.length} remote check(s) skipped (no apikey or offline)`,
      detail: remoteSkipped.map(c => c.id).join(', '),
    })
  }

  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const f of findings) counts[f.severity]++

  return { findings, counts, skippedRemote: remoteSkipped.length, durationMs: Date.now() - start, checksRun: runnable.length }
}

async function runIsolated(check: PrescanCheck, ctx: ScanContext, timeoutMs: number): Promise<Finding[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<Finding[]>((resolve) => {
    timer = setTimeout(() => resolve([{
      id: 'prescan/check-timeout',
      severity: 'info',
      title: `Check ${check.id} timed out and was skipped`,
    }]), timeoutMs)
  })
  try {
    return await Promise.race([check.run(ctx), timeout])
  }
  catch (error) {
    return [{
      id: 'prescan/check-crashed',
      severity: 'info',
      title: `Check ${check.id} crashed and was skipped`,
      detail: error instanceof Error ? error.message : String(error),
    }]
  }
  finally {
    if (timer) clearTimeout(timer)
  }
}

export function decideOutcome(report: Pick<PrescanReport, 'counts'>, options: OutcomeOptions): PrescanOutcome {
  if (options.ignoreFatal) return 'proceed'
  if (report.counts.error > 0) return 'block'
  if (report.counts.warning > 0) return options.failOnWarnings ? 'block' : 'ask'
  return 'proceed'
}
