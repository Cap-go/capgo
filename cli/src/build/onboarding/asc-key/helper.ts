import type { Buffer } from 'node:buffer'
import type { AscCredentials, AscEventLine, AscLogLine, AscProtocolLine, AscResultLine } from './protocol'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { env, platform } from 'node:process'
import { fileURLToPath } from 'node:url'
import { trackEvent } from '../../../analytics/track'
import { appendInternalLog } from '../../../support/internal-log'
import { ascEventToTrack, AscProtocolParser, formatInternalLogLine } from './protocol'

/** Name of the precompiled helper binary as bundled / cached on disk. */
const HELPER_BINARY_NAME = 'capgo-asc-key-helper'

/** Thrown when the helper is requested on a non-macOS host. */
export class NotMacOSError extends Error {
  constructor() {
    super('The App Store Connect key helper only runs on macOS.')
    this.name = 'NotMacOSError'
  }
}

export function isMacOS(): boolean {
  return platform === 'darwin'
}

/** SwiftPM product name of the vendored helper package (cli/native/asc-key-helper). */
const HELPER_PRODUCT_NAME = 'P8Extract'

/**
 * Dev/CI fallback: a `swift build` output of the vendored package, resolved
 * relative to this module. Empty in a bundled install (the package isn't
 * shipped to npm), so this only ever resolves when running from the repo.
 */
function localBuildCandidates(): string[] {
  let here: string
  try {
    here = dirname(fileURLToPath(import.meta.url))
  }
  catch {
    return []
  }
  // From src/build/onboarding/asc-key → repo `cli/native/asc-key-helper`.
  const pkg = join(here, '..', '..', '..', '..', 'native', 'asc-key-helper', '.build')
  return [
    join(pkg, 'apple', 'Products', 'Release', HELPER_PRODUCT_NAME), // universal
    join(pkg, 'release', HELPER_PRODUCT_NAME),
    join(pkg, 'arm64-apple-macosx', 'release', HELPER_PRODUCT_NAME),
    join(pkg, 'debug', HELPER_PRODUCT_NAME),
    join(pkg, 'arm64-apple-macosx', 'debug', HELPER_PRODUCT_NAME),
  ]
}

/**
 * Locate the precompiled Swift helper binary, in priority order:
 *   1. `CAPGO_ASC_KEY_HELPER_PATH` — explicit override (dev / CI / tests).
 *   2. `~/.capgo/asc-key-helper/<binary>` — the cached download location.
 *   3. A local `swift build` of the vendored package (dev, running from src).
 * Returns `null` when none exists, so the caller can show install guidance.
 */
export function resolveHelperBinary(): string | null {
  const override = env.CAPGO_ASC_KEY_HELPER_PATH
  if (override && existsSync(override))
    return override
  const cached = join(homedir(), '.capgo', 'asc-key-helper', HELPER_BINARY_NAME)
  if (existsSync(cached))
    return cached
  for (const candidate of localBuildCandidates()) {
    if (existsSync(candidate))
      return candidate
  }
  return null
}

export interface AscHelperSuccess {
  ok: true
  credentials: AscCredentials
  runId: string
  /** Number of stats events the helper emitted during the run. */
  eventCount: number
  /** Number of diagnostic `log` lines routed to the internal support log. */
  logCount: number
}

export interface AscHelperFailure {
  ok: false
  errorCode: string
  message: string
  runId: string
  /** Number of diagnostic `log` lines routed to the internal support log. */
  logCount: number
}

export type AscHelperOutcome = AscHelperSuccess | AscHelperFailure

export interface RunAscKeyHelperOptions {
  /** Pre-resolved helper binary path (tests inject a fake; prod auto-resolves). */
  helperPathOverride?: string
  /** API key for analytics attribution; falls back to the saved key. */
  apikey?: string
  /** Optional observer for every event line (UI progress / tests). */
  onEvent?: (event: AscEventLine) => void
  /** Optional observer for every diagnostic log line (UI / tests). */
  onLog?: (line: AscLogLine) => void
  /** Forward events to PostHog via trackEvent. Defaults to true. */
  forwardToAnalytics?: boolean
  /**
   * Append diagnostic `log` lines (and a per-run summary) to the CLI's internal
   * support log via {@link appendInternalLog}. Defaults to true. The append is
   * best-effort and no-ops when no internal log has been started for this run.
   */
  forwardToInternalLog?: boolean
}

/**
 * Launch the precompiled helper, stream its NDJSON stats protocol, forward each
 * `event` line to PostHog, and resolve with the credentials from the terminal
 * `result` line. The private key is returned to the caller but NEVER forwarded
 * to analytics. Never rejects on a helper-side failure — returns a structured
 * failure outcome instead (it throws only for {@link NotMacOSError}).
 */
export async function runAscKeyHelper(options: RunAscKeyHelperOptions = {}): Promise<AscHelperOutcome> {
  if (!isMacOS())
    throw new NotMacOSError()

  const binary = options.helperPathOverride ?? resolveHelperBinary()
  if (!binary) {
    return {
      ok: false,
      errorCode: 'HELPER_NOT_FOUND',
      message: 'Could not locate the App Store Connect key helper binary. '
        + 'Set CAPGO_ASC_KEY_HELPER_PATH to a compiled helper, or use a CLI '
        + 'release that bundles it.',
      runId: '',
      logCount: 0,
    }
  }

  const forward = options.forwardToAnalytics !== false
  const toInternalLog = options.forwardToInternalLog !== false

  return new Promise<AscHelperOutcome>((resolve) => {
    const child = spawn(binary, [], { stdio: ['ignore', 'pipe', 'pipe'] })
    const parser = new AscProtocolParser()
    let result: AscResultLine | undefined
    let stderr = ''
    let eventCount = 0
    let logCount = 0
    let runId = ''

    const handleLine = (line: AscProtocolLine): void => {
      if (line.runId)
        runId = line.runId
      if (line.kind === 'event') {
        eventCount += 1
        options.onEvent?.(line)
        if (forward) {
          const mapped = ascEventToTrack(line)
          // Fire-and-forget; telemetry must never block or break the flow.
          void trackEvent({ ...mapped, apikey: options.apikey })
        }
      }
      else if (line.kind === 'log') {
        // Verbose diagnostics → the internal support log, NOT analytics. This is
        // what a user emails to support when a run goes wrong; it never carries
        // the private key (appendInternalLog also redacts as a backstop).
        logCount += 1
        options.onLog?.(line)
        if (toInternalLog)
          appendInternalLog(formatInternalLogLine(line))
      }
      else {
        // Keep the last result line as authoritative.
        result = line
      }
    }

    child.stdout?.setEncoding('utf-8')
    child.stdout?.on('data', (chunk: string) => {
      for (const line of parser.push(chunk))
        handleLine(line)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })
    // Breadcrumb the run's outcome into the support log so a bundle always shows
    // the helper ran (and how it ended), even when it emitted no diagnostics.
    const breadcrumb = (text: string): void => {
      if (toInternalLog)
        appendInternalLog(text)
    }

    child.once('error', (err) => {
      const message = err instanceof Error ? err.message : String(err)
      breadcrumb(`[asc-helper] run ${runId || '(no id)'} failed to spawn (SPAWN_FAILED): ${message}`)
      resolve({ ok: false, errorCode: 'SPAWN_FAILED', message, runId, logCount })
    })
    child.once('close', (code) => {
      for (const line of parser.flush())
        handleLine(line)

      if (result?.ok && result.keyId && result.issuerId && result.privateKey) {
        breadcrumb(`[asc-helper] run ${runId || '(no id)'} succeeded — ${eventCount} events, ${logCount} logs`)
        resolve({
          ok: true,
          credentials: { keyId: result.keyId, issuerId: result.issuerId, privateKey: result.privateKey },
          runId,
          eventCount,
          logCount,
        })
        return
      }

      const errorCode = result?.errorCode ?? (code === 1 ? 'USER_CANCELLED' : 'NO_RESULT')
      const message = result?.message
        ?? (code === 1
          ? 'Helper was cancelled before delivering a key.'
          : `Helper exited (code ${code}) without a result line.${stderr.trim() ? ` Stderr: ${stderr.trim()}` : ''}`)
      breadcrumb(`[asc-helper] run ${runId || '(no id)'} ended without a key (${errorCode}): ${message} — ${eventCount} events, ${logCount} logs`)
      resolve({ ok: false, errorCode, message, runId, logCount })
    })
  })
}
