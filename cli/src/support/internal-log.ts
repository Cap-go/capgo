// cli/src/support/internal-log.ts
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { redactSecrets } from './redact.js'

let currentPath: string | null = null

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function sanitize(seg: string | undefined, fallback: string): string {
  return (seg ?? fallback).replace(/[^\w.-]/g, '_').slice(0, 60) || fallback
}

// Best-effort: never throws — a logging-setup failure must not break the builder flow.
export function startInternalLog(appId?: string, dir = join(homedir(), '.capgo-credentials', 'support')): string | null {
  try {
    mkdirSync(dir, { recursive: true })
    currentPath = join(dir, `internal-${sanitize(appId, 'unknown-app')}-${stamp()}.log`)
    return currentPath
  }
  catch {
    currentPath = null
    return null
  }
}

export function getInternalLogPath(): string | null {
  return currentPath
}

export function appendInternalLog(line: string): void {
  if (!currentPath)
    return
  try {
    // Prefix an ISO timestamp so the support bundle shows ordering + timing of the
    // whole run. The timestamp isn't secret-bearing; only the line is redacted.
    appendFileSync(currentPath, `[${new Date().toISOString()}] ${redactSecrets(line)}\n`, 'utf8')
  }
  catch {
    // Never let logging break the build flow.
  }
}
