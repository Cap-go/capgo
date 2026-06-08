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

// Allowlist of RESPONSE headers that are safe + useful to log: timing (date →
// clock-skew diagnosis), request ids (for escalation to the provider), rate-limit
// state, and the auth challenge. We never log REQUEST headers (they carry the
// Authorization bearer token), and redactSecrets still runs over the line as a
// backstop. Anything not on this list (Set-Cookie, etc.) is skipped.
const SAFE_RESPONSE_HEADERS = [
  'date',
  'content-type',
  'content-length',
  'age',
  'retry-after',
  'www-authenticate',
  'x-request-id',
  'request-id',
  'x-goog-request-id',
  'x-amzn-requestid',
  'apigw-requestid',
  'cf-ray',
  'x-rate-limit',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'server',
]

// Format the allowlisted response headers as `name=value, …` (empty string if none).
// Tolerates a missing / non-Headers value (a real fetch always provides Headers,
// but test mocks and odd runtimes may not) — never throws.
export function safeHeaders(headers: Headers | null | undefined): string {
  if (!headers || typeof headers.get !== 'function')
    return ''
  const parts: string[] = []
  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = headers.get(name)
    if (value)
      parts.push(`${name}=${value}`)
  }
  return parts.join(', ')
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
