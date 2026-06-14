import type { Buffer } from 'node:buffer'
import type { AscCredentials, AscEventLine, AscLogLine, AscProtocolLine, AscResultLine } from './protocol'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, release } from 'node:os'
import { dirname, join } from 'node:path'
import process, { env, platform } from 'node:process'
import { fileURLToPath } from 'node:url'
import { trackEvent } from '../../../analytics/track'
import { appendInternalLog } from '../../../support/internal-log'
import { ASC_KEY_HELPER_BUNDLE_IDENTIFIER, helperPackageName, verifyAppBundleSignature } from '../macos-signing'
import { ascEventToTrack, AscProtocolParser } from './protocol'

/** Name of the precompiled helper binary as bundled / cached on disk. */
const HELPER_BINARY_NAME = 'capgo-asc-key-helper'

/** Bundle name + inner executable of the signed, packaged ASC key helper .app. */
const HELPER_APP_NAME = 'CapgoAscKeyHelper.app'
const HELPER_APP_EXECUTABLE = 'CapgoAscKeyHelper'

/**
 * Darwin kernel major version for macOS 14 (Sonoma). The packaged ASC key helper
 * is a SwiftUI/WKWebView app that requires macOS 14, so the guided path must not
 * be offered on older systems (the app can't launch there).
 */
const MACOS_14_DARWIN_MAJOR = 23

/**
 * Build-time flag controlling whether CAPGO_ASC_KEY_HELPER_PATH is honored.
 * Mirrors the keychain helper's gate in macos-signing.ts: cli/build.mjs `define`s
 * it `false` for npm release builds so the minifier deletes the whole env-override
 * branch (including the string literal); CI asserts the string is absent from
 * dist/index.js. Dev builds (NODE_ENV=development) define it `true`. Running
 * unbundled source (tests, `bun src/index.ts`) leaves it undefined → the gate is
 * open there (matching the keychain helper's behavior, so the harness tests that
 * set CAPGO_ASC_KEY_HELPER_PATH still work).
 */
declare const __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__: boolean | undefined

/** macOS 14+ check via the Darwin kernel major (macOS 14 = Darwin 23). */
function isMacOS14OrLater(): boolean {
  const major = Number.parseInt(release().split('.')[0] ?? '', 10)
  return Number.isFinite(major) && major >= MACOS_14_DARWIN_MAJOR
}

/**
 * Where a resolved helper binary came from. `package` is the signed npm bundle —
 * the ONLY source we spawn-time signature-verify. `override`/`cache`/`local` are
 * dev/CI paths (unsigned or ad-hoc) that skip verification.
 */
export type AscHelperSource = 'override' | 'package' | 'cache' | 'local'

export interface ResolvedAscHelper {
  /** Inner executable to spawn. */
  binary: string
  /** Where it came from (drives whether we verify the signature at spawn). */
  source: AscHelperSource
  /**
   * The enclosing `.app` bundle path — present only for the signed `package`
   * source, where it is the target of the designated-requirement check.
   */
  bundlePath?: string
}

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
 * Locate the signed `CapgoAscKeyHelper.app` inside the arch-matching
 * `@capgo/cli-helper-darwin-<arch>` optional dependency. Returns the inner
 * executable + its enclosing bundle (the signature-check target), or `null`
 * when the package isn't installed / doesn't contain the bundle (dev checkouts).
 */
function packageHelper(): ResolvedAscHelper | null {
  const packageName = helperPackageName(process.arch)
  if (!packageName)
    return null
  let packageJsonPath: string
  try {
    packageJsonPath = createRequire(import.meta.url).resolve(`${packageName}/package.json`)
  }
  catch {
    return null
  }
  const bundlePath = join(dirname(packageJsonPath), HELPER_APP_NAME)
  const binary = join(bundlePath, 'Contents', 'MacOS', HELPER_APP_EXECUTABLE)
  if (!existsSync(binary))
    return null
  return { binary, source: 'package', bundlePath }
}

/**
 * Locate the precompiled Swift helper, in priority order:
 *   1. `CAPGO_ASC_KEY_HELPER_PATH` — explicit override (dev / CI / tests). Only
 *      honored in dev builds (DCE'd from release bundles, like the keychain
 *      helper's CAPGO_KEYCHAIN_HELPER_PATH); skips signature verification.
 *   2. The signed `CapgoAscKeyHelper.app` in the arch-matching
 *      `@capgo/cli-helper-darwin-*` package — verified at spawn time.
 *   3. `~/.capgo/asc-key-helper/<binary>` — the legacy cached download location.
 *   4. A local `swift build` of the vendored package (dev, running from src).
 * Returns `null` (caller shows install / manual guidance) when none exists OR on
 * macOS < 14 — the packaged SwiftUI/WKWebView app requires macOS 14, so the
 * guided path must never be offered where it can't launch.
 *
 * Synchronous on purpose: it gates the guided path in several call sites that
 * cannot await. Signature verification of the package source is deferred to
 * {@link runAscKeyHelper} (just before spawn), which can await.
 */
export function resolveAscHelper(): ResolvedAscHelper | null {
  // Env override first, BEFORE the macOS-14 gate: a developer pointing at their
  // own build is explicitly opting in regardless of OS. The outer condition folds
  // to a literal `false` in npm release bundles (build.mjs defines
  // __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__ = false), so the minifier deletes this
  // whole block — including the CAPGO_ASC_KEY_HELPER_PATH string literal. CI
  // asserts that string is absent from dist/index.js. The gate is open when the
  // flag is undefined (unbundled source: tests, `bun src/index.ts`) or true (dev).
  if (typeof __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__ === 'undefined' || __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__) {
    const override = env.CAPGO_ASC_KEY_HELPER_PATH
    if (override && existsSync(override))
      return { binary: override, source: 'override' }
  }

  // The packaged app + the local swift-build are macOS 14 apps; never offer them
  // on older systems where the WKWebView host can't launch.
  if (!isMacOS14OrLater())
    return null

  const pkg = packageHelper()
  if (pkg)
    return pkg

  const cached = join(homedir(), '.capgo', 'asc-key-helper', HELPER_BINARY_NAME)
  if (existsSync(cached))
    return { binary: cached, source: 'cache' }

  for (const candidate of localBuildCandidates()) {
    if (existsSync(candidate))
      return { binary: candidate, source: 'local' }
  }
  return null
}

/**
 * Path-only resolver kept for the many synchronous gating call sites. Returns
 * the inner executable to spawn, or `null`. See {@link resolveAscHelper} for the
 * source metadata that drives spawn-time signature verification.
 */
export function resolveHelperBinary(): string | null {
  return resolveAscHelper()?.binary ?? null
}

/**
 * Dismiss the helper window. The outcome resolves as soon as the helper delivers
 * its terminal `result` line — BEFORE the process exits — so the helper can keep
 * its window open (showing a success screen) while the CLI advances. The caller
 * invokes `close()` once the flow has moved on (e.g. the key verified) to close
 * the window; until then it stays open. Safe to call more than once / after the
 * window already closed.
 */
export type CloseHelper = () => void

export interface AscHelperSuccess {
  ok: true
  credentials: AscCredentials
  runId: string
  /** Number of stats events the helper emitted during the run. */
  eventCount: number
  /** Number of diagnostic `log` lines routed to the internal support log. */
  logCount: number
  /** Dismiss the still-open helper window. See {@link CloseHelper}. */
  close: CloseHelper
}

export interface AscHelperFailure {
  ok: false
  errorCode: string
  message: string
  runId: string
  /** Number of diagnostic `log` lines routed to the internal support log. */
  logCount: number
  /** Dismiss the helper window (no-op once it has exited). See {@link CloseHelper}. */
  close: CloseHelper
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
  /**
   * Abort signal. When it fires — e.g. the onboarding TUI unmounts because the
   * user quit — the helper child is terminated (SIGTERM, then SIGKILL) so its
   * stdio pipes stop keeping the CLI process alive. Without this the CLI hangs
   * after exit while the helper window is still open.
   */
  signal?: AbortSignal
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

  // Test injection bypasses resolution + verification (the harness feeds an
  // unsigned fake binary). Production resolves with source metadata so we can
  // verify ONLY the signed package bundle before spawning it.
  const resolved: ResolvedAscHelper | null = options.helperPathOverride !== undefined
    ? { binary: options.helperPathOverride, source: 'override' }
    : resolveAscHelper()
  if (!resolved) {
    return {
      ok: false,
      errorCode: 'HELPER_NOT_FOUND',
      message: 'Could not locate the App Store Connect key helper. '
        + 'Update @capgo/cli (and reinstall its optional dependencies) so the '
        + 'signed helper is installed, then try again.',
      runId: '',
      logCount: 0,
      // No child was spawned — nothing to close.
      close: () => {},
    }
  }
  const binary = resolved.binary

  // Verify the Developer-ID signature of the packaged bundle BEFORE spawning it,
  // pinned to the ASC key helper's bundle id (same team + Developer ID as the
  // keychain helper). The override/cache/local dev paths are ad-hoc builds that
  // can't pass a Developer-ID requirement, so they skip the check by design.
  if (resolved.source === 'package' && resolved.bundlePath) {
    try {
      await verifyAppBundleSignature(resolved.bundlePath, {
        bundleIdentifier: ASC_KEY_HELPER_BUNDLE_IDENTIFIER,
        label: 'App Store Connect key helper',
        reinstallHint: `Reinstall ${helperPackageName(process.arch) ?? '@capgo/cli-helper-darwin-*'} and try again.`,
      })
    }
    catch (err) {
      return {
        ok: false,
        errorCode: 'HELPER_UNTRUSTED',
        message: err instanceof Error ? err.message : String(err),
        runId: '',
        logCount: 0,
        // Nothing was spawned — nothing to close.
        close: () => {},
      }
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
    // The outcome resolves once (on the result line, or on a spawn-failure /
    // result-less exit). `settled` guards against resolving twice; the abort/exit
    // teardown stays armed AFTER we settle, because we resolve while the helper
    // window is still open (see below).
    let settled = false

    // Tear the helper down when the caller aborts (the onboarding TUI unmounts
    // on quit) or the CLI process exits. The child's stdio pipes otherwise keep
    // Node's event loop alive, so the CLI hangs after printing its exit message.
    let killTimer: ReturnType<typeof setTimeout> | undefined
    let wasAborted = false
    const killChild = (sig: NodeJS.Signals): void => {
      try {
        child.kill(sig)
      }
      catch {
        // Already exited — nothing to kill.
      }
    }
    // Dismiss the helper window: SIGTERM (clean SwiftUI termination), escalating
    // to SIGKILL if the GUI lingers. Used both by the caller's `close()` (once
    // the flow advanced) and by abort-on-quit.
    const closeHelper = (): void => {
      killChild('SIGTERM')
      if (!killTimer) {
        killTimer = setTimeout(() => killChild('SIGKILL'), 2000)
        killTimer.unref?.()
      }
    }
    const onAbort = (): void => {
      wasAborted = true
      closeHelper()
    }
    const onProcExit = (): void => killChild('SIGKILL')
    const detach = (): void => {
      if (killTimer)
        clearTimeout(killTimer)
      options.signal?.removeEventListener('abort', onAbort)
      process.removeListener('exit', onProcExit)
    }
    if (options.signal?.aborted)
      onAbort()
    else
      options.signal?.addEventListener('abort', onAbort, { once: true })
    process.once('exit', onProcExit)

    // Breadcrumb the run's outcome into the support log so a bundle always shows
    // the helper ran (and how it ended), even when it emitted no diagnostics.
    const breadcrumb = (text: string): void => {
      if (toInternalLog)
        appendInternalLog(text)
    }

    // Resolve as soon as the helper delivers its terminal `result` line — WITHOUT
    // waiting for the process to exit — so the CLI can advance while the helper
    // window stays open (showing its success screen). The abort/exit teardown
    // stays armed so the still-open child can never outlive or hang the CLI; the
    // caller calls `outcome.close()` to dismiss the window once the flow moves on.
    // We deliberately do NOT detach() here (that happens on the real `close`).
    const settleSuccess = (credentials: AscCredentials): void => {
      if (settled)
        return
      settled = true
      breadcrumb(`[asc-helper] run ${runId || '(no id)'} succeeded — ${eventCount} events, ${logCount} logs`)
      resolve({ ok: true, credentials, runId, eventCount, logCount, close: closeHelper })
    }
    const settleFailure = (errorCode: string, message: string): void => {
      if (settled)
        return
      settled = true
      breadcrumb(`[asc-helper] run ${runId || '(no id)'} ended without a key (${errorCode}): ${message} — ${eventCount} events, ${logCount} logs`)
      resolve({ ok: false, errorCode, message, runId, logCount, close: closeHelper })
    }

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
        // Verbose diagnostics → the internal support log, NOT analytics. We pass
        // the helper's own line through with minimal shaping (source tag + level
        // + message + structured context). appendInternalLog supplies the
        // timestamp and runs redactSecrets as the secret backstop — the CLI does
        // not render a bespoke format of its own.
        logCount += 1
        options.onLog?.(line)
        if (toInternalLog) {
          const ctx = Object.keys(line.props).length ? ` ${JSON.stringify(line.props)}` : ''
          appendInternalLog(`asc-helper ${line.level}: ${line.message}${ctx}`)
        }
      }
      else {
        // Terminal result line. Keep it as authoritative and settle now so the
        // CLI proceeds while the helper window remains open. A malformed/partial
        // result falls through to the close-handler fallback.
        result = line
        if (line.ok && line.keyId && line.issuerId && line.privateKey)
          settleSuccess({ keyId: line.keyId, issuerId: line.issuerId, privateKey: line.privateKey })
        else if (!line.ok && line.errorCode)
          settleFailure(line.errorCode, line.message ?? 'Helper reported a failure.')
      }
    }

    child.stdout?.setEncoding('utf-8')
    child.stdout?.on('data', (chunk: string) => {
      for (const line of parser.push(chunk))
        handleLine(line)
    })
    // Cap captured stderr — a crashing/verbose helper could grow this unbounded.
    // Keep the most recent ~64 KB (the tail carries the actual error).
    const STDERR_CAP = 64 * 1024
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
      if (stderr.length > STDERR_CAP)
        stderr = stderr.slice(-STDERR_CAP)
    })

    child.once('error', (err) => {
      detach()
      if (settled)
        return
      settled = true
      const message = err instanceof Error ? err.message : String(err)
      breadcrumb(`[asc-helper] run ${runId || '(no id)'} failed to spawn (SPAWN_FAILED): ${message}`)
      resolve({ ok: false, errorCode: 'SPAWN_FAILED', message, runId, logCount, close: closeHelper })
    })
    child.once('close', (code, signal) => {
      for (const line of parser.flush())
        handleLine(line)
      // Already settled on a result line — this is just the window finally
      // closing (via outcome.close(), abort, or the user). Clean up and stop.
      detach()
      if (settled)
        return
      settled = true

      // No result line arrived before exit — apply the crash/cancel fallback.
      // Distinguish OUR intentional teardown (abort on quit → SIGTERM/SIGKILL)
      // from the helper dying on its own. A `signal` we DIDN'T send means the
      // helper crashed (e.g. SIGSEGV/SIGABRT/SIGILL) — surface the signal name
      // so a support bundle shows it instead of a bare "code null".
      const errorCode = result?.errorCode
        ?? (wasAborted ? 'USER_CANCELLED' : code === 1 ? 'USER_CANCELLED' : signal ? 'HELPER_CRASHED' : 'NO_RESULT')
      const message = result?.message
        ?? (wasAborted
          ? 'Helper was stopped because the CLI exited or was cancelled.'
          : code === 1
            ? 'Helper was cancelled before delivering a key.'
            : signal
              ? `Helper crashed (killed by ${signal}) without a result line.${stderr.trim() ? ` Stderr: ${stderr.trim()}` : ''}`
              : `Helper exited (code ${code}) without a result line.${stderr.trim() ? ` Stderr: ${stderr.trim()}` : ''}`)
      breadcrumb(`[asc-helper] run ${runId || '(no id)'} ended without a key (${errorCode}, code=${code}, signal=${signal ?? 'none'}): ${message} — ${eventCount} events, ${logCount} logs`)
      resolve({ ok: false, errorCode, message, runId, logCount, close: closeHelper })
    })
  })
}
