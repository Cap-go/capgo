import type { Buffer } from 'node:buffer'
import type { AscCredentials, AscEventLine, AscProtocolLine, AscResultLine } from './protocol'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { env, platform } from 'node:process'
import { trackEvent } from '../../../analytics/track'
import { ascEventToTrack, AscProtocolParser } from './protocol'

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

/**
 * Locate the precompiled Swift helper binary, in priority order:
 *   1. `CAPGO_ASC_KEY_HELPER_PATH` — explicit override (dev / CI / tests).
 *   2. `~/.capgo/asc-key-helper/<binary>` — the cached download location.
 * Returns `null` when none exists, so the caller can show install guidance.
 */
export function resolveHelperBinary(): string | null {
  const override = env.CAPGO_ASC_KEY_HELPER_PATH
  if (override && existsSync(override))
    return override
  const cached = join(homedir(), '.capgo', 'asc-key-helper', HELPER_BINARY_NAME)
  if (existsSync(cached))
    return cached
  return null
}

export interface AscHelperSuccess {
  ok: true
  credentials: AscCredentials
  runId: string
  /** Number of stats events the helper emitted during the run. */
  eventCount: number
}

export interface AscHelperFailure {
  ok: false
  errorCode: string
  message: string
  runId: string
}

export type AscHelperOutcome = AscHelperSuccess | AscHelperFailure

export interface RunAscKeyHelperOptions {
  /** Pre-resolved helper binary path (tests inject a fake; prod auto-resolves). */
  helperPathOverride?: string
  /** API key for analytics attribution; falls back to the saved key. */
  apikey?: string
  /** Optional observer for every event line (UI progress / tests). */
  onEvent?: (event: AscEventLine) => void
  /** Forward events to PostHog via trackEvent. Defaults to true. */
  forwardToAnalytics?: boolean
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
    }
  }

  const forward = options.forwardToAnalytics !== false

  return new Promise<AscHelperOutcome>((resolve) => {
    const child = spawn(binary, [], { stdio: ['ignore', 'pipe', 'pipe'] })
    const parser = new AscProtocolParser()
    let result: AscResultLine | undefined
    let stderr = ''
    let eventCount = 0
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
    child.once('error', (err) => {
      resolve({
        ok: false,
        errorCode: 'SPAWN_FAILED',
        message: err instanceof Error ? err.message : String(err),
        runId,
      })
    })
    child.once('close', (code) => {
      for (const line of parser.flush())
        handleLine(line)

      if (result?.ok && result.keyId && result.issuerId && result.privateKey) {
        resolve({
          ok: true,
          credentials: { keyId: result.keyId, issuerId: result.issuerId, privateKey: result.privateKey },
          runId,
          eventCount,
        })
        return
      }

      const errorCode = result?.errorCode ?? (code === 1 ? 'USER_CANCELLED' : 'NO_RESULT')
      const message = result?.message
        ?? (code === 1
          ? 'Helper was cancelled before delivering a key.'
          : `Helper exited (code ${code}) without a result line.${stderr.trim() ? ` Stderr: ${stderr.trim()}` : ''}`)
      resolve({ ok: false, errorCode, message, runId })
    })
  })
}
