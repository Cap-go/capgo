// src/build/prescan/report.ts
import type { Finding, PrescanReport, Severity } from './types'

const ORDER: Severity[] = ['error', 'warning', 'info']
const BADGE: Record<Severity, string> = { error: '✖ ERROR', warning: '⚠ WARN ', info: 'ℹ INFO ' }

export function renderTerminalReport(report: PrescanReport, opts: { verbose?: boolean } = {}): string {
  const lines: string[] = []
  for (const sev of ORDER) {
    for (const f of report.findings.filter(x => x.severity === sev)) {
      lines.push(`${BADGE[sev]}  ${f.title}  [${f.id}]`)
      if (f.detail) lines.push(`         ${f.detail}`)
      if (f.fix) lines.push(`         fix: ${f.fix}`)
      if (f.docsUrl) lines.push(`         docs: ${f.docsUrl}`)
    }
  }
  const { error, warning, info } = report.counts
  lines.push('')
  lines.push(`prescan: ${report.checksRun} checks in ${report.durationMs}ms — ${error} error(s), ${warning} warning(s), ${info} info`)
  if (opts.verbose) lines.push(`remote checks skipped: ${report.skippedRemote}`)
  return lines.join('\n')
}

export function renderJsonReport(report: PrescanReport): string {
  const findings = report.findings.map((f: Finding) => {
    const out: Record<string, string> = { id: f.id, severity: f.severity, title: f.title }
    if (f.detail) out.detail = f.detail
    if (f.fix) out.fix = f.fix
    if (f.docsUrl) out.docsUrl = f.docsUrl
    return out
  })
  return JSON.stringify({ version: 1, counts: report.counts, checksRun: report.checksRun, durationMs: report.durationMs, skippedRemote: report.skippedRemote, findings }, null, 2)
}
