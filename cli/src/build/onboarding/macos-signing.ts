// src/build/onboarding/macos-signing.ts
//
// Helpers for inspecting and exporting Apple signing identities + provisioning
// profiles from a developer's Mac, so the iOS onboarding flow can offer
// "Import existing" as an alternative to creating fresh credentials via the
// App Store Connect API.
//
// Everything in this module shells out to `/usr/bin/security` and reads files
// under the user's home directory. macOS-only.

import type { Buffer } from 'node:buffer'
import type { MobileprovisionDetail } from '../mobileprovision-parser.js'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdtemp, readdir, readFile, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseMobileprovisionDetailed } from '../mobileprovision-parser.js'

/** Absolute path to the system `security` binary. */
const SECURITY_BIN = '/usr/bin/security'

/** Default user keychain. macOS uses `.keychain-db` since 10.12. */
export const DEFAULT_LOGIN_KEYCHAIN = 'login.keychain-db'

/** Standard locations Xcode writes provisioning profiles into. */
export const PROVISIONING_PROFILE_DIRS = [
  // Xcode 16+ default
  'Library/Developer/Xcode/UserData/Provisioning Profiles',
  // Legacy / fallback (still populated by older Xcode and CI tooling)
  'Library/MobileDevice/Provisioning Profiles',
] as const

export type IdentityType = 'distribution' | 'development' | 'unknown'

export interface SigningIdentity {
  /** SHA1 hash of the certificate, lowercase 40-char hex */
  sha1: string
  /** Full identity string from `security find-identity` (e.g. "Apple Distribution: Acme Corp (XYZ123ABCD)") */
  name: string
  /** Best-effort classification from the name prefix */
  type: IdentityType
  /** Human-readable team name extracted from the identity string */
  teamName: string
  /** Apple Team ID (10-char alphanumeric) extracted from the identity string */
  teamId: string
}

export interface DiscoveredProfile extends MobileprovisionDetail {
  /** Absolute path to the .mobileprovision file */
  path: string
}

export interface IdentityProfileMatch {
  identity: SigningIdentity
  /** Profiles whose embedded developer certs include this identity's SHA1 */
  profiles: DiscoveredProfile[]
}

export interface ExportedP12 {
  /** Base64-encoded PKCS#12 blob containing the chosen identity's cert + private key */
  base64: string
  /** Auto-generated passphrase used to wrap the export */
  passphrase: string
}

export class MacOSSigningError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'MacOSSigningError'
  }
}

export class NotMacOSError extends MacOSSigningError {
  constructor() {
    super('Importing existing iOS credentials is only supported on macOS.')
    this.name = 'NotMacOSError'
  }
}

export class NoIdentitiesError extends MacOSSigningError {
  constructor() {
    super('No iOS distribution identities were found in your default Keychain.')
    this.name = 'NoIdentitiesError'
  }
}

/** Returns `true` when running on macOS (Darwin). */
export function isMacOS(): boolean {
  return process.platform === 'darwin'
}

/**
 * Run a subprocess and capture stdout/stderr/exit-code.
 *
 * Public so tests can inject a fake runner via the optional argument on
 * higher-level functions. Not intended for downstream callers.
 */
export interface SecurityRunResult {
  stdout: string
  stderr: string
  code: number | null
}

export type SecurityRunner = (args: readonly string[]) => Promise<SecurityRunResult>

const defaultRunner: SecurityRunner = (args) => {
  return new Promise((resolveRun) => {
    const child = spawn(SECURITY_BIN, [...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })
    child.once('error', (err) => {
      resolveRun({ stdout, stderr: stderr + (err instanceof Error ? err.message : String(err)), code: null })
    })
    child.once('close', (code) => {
      resolveRun({ stdout, stderr, code })
    })
  })
}

// ─── Identity discovery ──────────────────────────────────────────────

const FIND_IDENTITY_LINE_RE = /^\s*\d+\)\s+([A-F0-9]{40})\s+"([^"]+)"\s*$/
const TEAM_SUFFIX_RE = /\(([A-Z0-9]{10})\)\s*$/

/**
 * Parse the human-readable output of `security find-identity -v -p codesigning`.
 * Each line looks like:
 *   `  1) <SHA1> "Apple Distribution: Acme Corp (XYZ123ABCD)"`
 *
 * Exported so unit tests can verify parsing without spawning a subprocess.
 */
export function parseFindIdentityOutput(stdout: string): SigningIdentity[] {
  const identities: SigningIdentity[] = []
  for (const rawLine of stdout.split('\n')) {
    const match = rawLine.match(FIND_IDENTITY_LINE_RE)
    if (!match)
      continue
    const sha1 = match[1].toLowerCase()
    const name = match[2]
    const teamMatch = name.match(TEAM_SUFFIX_RE)
    const teamId = teamMatch ? teamMatch[1] : ''
    // Strip the trailing "(TEAMID)" to get the team name
    const beforeTeam = teamMatch ? name.slice(0, name.length - teamMatch[0].length).trimEnd() : name
    // The prefix is "<Type>: <TeamName>"
    const colonIdx = beforeTeam.indexOf(':')
    const type = classifyIdentityType(beforeTeam)
    const teamName = colonIdx !== -1 ? beforeTeam.slice(colonIdx + 1).trim() : ''
    identities.push({ sha1, name, type, teamName, teamId })
  }
  return identities
}

function classifyIdentityType(prefix: string): IdentityType {
  const lower = prefix.toLowerCase()
  if (lower.startsWith('apple distribution') || lower.startsWith('iphone distribution'))
    return 'distribution'
  if (lower.startsWith('apple development') || lower.startsWith('iphone developer') || lower.startsWith('mac developer'))
    return 'development'
  return 'unknown'
}

/**
 * List all code-signing identities visible in the user's default Keychain.
 * Read-only — does NOT trigger any Keychain access prompt.
 *
 * @param runner Optional injection point for testing. Pass a fake to avoid
 *               spawning the real `/usr/bin/security` binary.
 */
export async function listSigningIdentities(runner: SecurityRunner = defaultRunner): Promise<SigningIdentity[]> {
  if (!isMacOS())
    throw new NotMacOSError()

  const result = await runner(['find-identity', '-v', '-p', 'codesigning'])
  if (result.code !== 0) {
    throw new MacOSSigningError(`security find-identity failed (exit ${result.code}): ${result.stderr.trim() || result.stdout.trim()}`)
  }
  return parseFindIdentityOutput(result.stdout)
}

// ─── Provisioning profile discovery ──────────────────────────────────

/**
 * Scan all standard Xcode provisioning-profile directories under the user's
 * home and return parsed metadata for every readable `.mobileprovision`.
 *
 * Read-only — pure filesystem reads, no Keychain interaction.
 *
 * Files that fail to parse are silently skipped (a teammate's malformed
 * profile shouldn't break the whole listing).
 *
 * @param homeDirOverride Optional override for HOME, used in tests.
 */
export async function scanProvisioningProfiles(homeDirOverride?: string): Promise<DiscoveredProfile[]> {
  if (!isMacOS() && !homeDirOverride)
    throw new NotMacOSError()

  const home = homeDirOverride ?? process.env.HOME ?? ''
  if (!home)
    return []

  const seenPaths = new Set<string>()
  const discovered: DiscoveredProfile[] = []

  for (const relDir of PROVISIONING_PROFILE_DIRS) {
    const dir = join(home, relDir)
    let entries: string[]
    try {
      entries = await readdir(dir)
    }
    catch {
      // Directory doesn't exist — fine, that's expected on fresh installs
      continue
    }

    for (const name of entries) {
      if (!name.endsWith('.mobileprovision'))
        continue
      const fullPath = join(dir, name)
      if (seenPaths.has(fullPath))
        continue
      seenPaths.add(fullPath)
      try {
        const detail = parseMobileprovisionDetailed(fullPath)
        discovered.push({ ...detail, path: fullPath })
      }
      catch {
        // Skip unreadable / malformed profiles
      }
    }
  }

  return discovered
}

// ─── Cert ↔ profile matching ─────────────────────────────────────────

/**
 * Given a list of identities and profiles, return one match entry per
 * identity, populated with profiles whose embedded developer certs include
 * that identity's SHA1.
 *
 * Pure function — no I/O.
 */
export function matchIdentitiesToProfiles(
  identities: readonly SigningIdentity[],
  profiles: readonly DiscoveredProfile[],
): IdentityProfileMatch[] {
  return identities.map(identity => ({
    identity,
    profiles: profiles.filter(p => p.certificateSha1s.includes(identity.sha1)),
  }))
}

// ─── P12 export ──────────────────────────────────────────────────────

/**
 * Generate a cryptographically random passphrase suitable for wrapping the
 * exported PKCS#12. 32 bytes of entropy → 64-char hex string.
 */
export function generateP12Passphrase(): string {
  return randomBytes(32).toString('hex')
}

// ─── Native helper (Swift) for single-prompt P12 export ──────────────

/**
 * Output shape from the Swift helper's stdout — always emitted as one line of
 * JSON regardless of success or failure. See keychain-export.swift for the
 * source of truth.
 */
interface SwiftHelperResult {
  ok: boolean
  // Success fields:
  p12Path?: string
  p12SizeBytes?: number
  identityName?: string
  // Failure fields:
  errorCode?: 'INVALID_ARGS' | 'NO_IDENTITY' | 'USER_DENIED' | 'EXPORT_FAILED' | 'WRITE_FAILED' | 'INTERNAL'
  message?: string
  osStatus?: number
}

/**
 * Resolve the bundled keychain-export.swift source file.
 *
 * In production (installed npm package) the .swift sits next to dist/index.js
 * — copied there by build.mjs. In dev the bundle and source share a parent.
 * In tests the file resolves relative to this module's source path. We try
 * each in order so the helper Just Works in every environment.
 */
function resolveSwiftSourcePath(): string | null {
  const candidates: string[] = []

  // 1. Production: dist/keychain-export.swift next to the bundled CLI
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    candidates.push(join(here, 'keychain-export.swift'))
    // 2. Dev: src/build/onboarding/keychain-export.swift relative to this module
    candidates.push(join(here, '..', '..', '..', 'src', 'build', 'onboarding', 'keychain-export.swift'))
  }
  catch {
    // import.meta.url can throw under certain bundlers — fall through
  }

  for (const candidate of candidates) {
    if (existsSync(candidate))
      return candidate
  }
  return null
}

/**
 * Return the path to the cached compiled Swift helper. The cache lives in
 * the OS temp dir keyed by CLI version, so:
 *   - Same CLI version → reuses the cached binary
 *   - CLI upgrade → triggers a fresh compile
 *   - macOS `periodic` cleans tmp eventually → triggers a fresh compile
 *
 * The version is read at runtime from CLI_VERSION env (set by callers/tests)
 * or falls back to the package.json version embedded at build time.
 */
function compiledHelperPath(): string {
  // CLI_VERSION env lets us pin in tests; otherwise use the npm version.
  const version = process.env.CAPGO_CLI_VERSION || process.env.npm_package_version || 'dev'
  return join(tmpdir(), `capgo-keychain-export-v${version}`)
}

/**
 * Compile keychain-export.swift to the cached path. Returns the path on
 * success. Atomic: writes to `<path>.tmp` then renames so a partial compile
 * never lands at the cache key.
 */
async function compileSwiftHelper(swiftSrc: string, outPath: string): Promise<string> {
  const tmpOut = `${outPath}.${randomBytes(6).toString('hex')}.tmp`
  const result = await spawnCapture('swiftc', [
    swiftSrc,
    '-framework',
    'Security',
    '-O',
    '-o',
    tmpOut,
  ])
  if (result.code !== 0) {
    await rm(tmpOut, { force: true }).catch(() => { /* best-effort */ })
    throw new MacOSSigningError(
      `Failed to compile keychain-export.swift with swiftc (exit ${result.code}). `
      + `Make sure Xcode Command Line Tools are installed (xcode-select --install). `
      + `Stderr: ${result.stderr.trim() || '(empty)'}`,
    )
  }
  await chmod(tmpOut, 0o755)
  await rename(tmpOut, outPath)
  return outPath
}

/**
 * Returns true if the Swift helper is already cached at the version-keyed
 * tmp path. Lets the UI decide whether to show a "compiling…" step or skip
 * straight to the export step (the cached case is effectively instant).
 *
 * Sync + cheap (single existsSync). Safe to call from a React onChange
 * handler.
 */
export function isHelperCached(): boolean {
  return existsSync(compiledHelperPath())
}

/**
 * Get or build the Swift helper binary. Caches at `compiledHelperPath()`.
 */
async function ensureSwiftHelper(): Promise<string> {
  const cached = compiledHelperPath()
  if (existsSync(cached))
    return cached
  const src = resolveSwiftSourcePath()
  if (!src) {
    throw new MacOSSigningError(
      'Could not locate bundled keychain-export.swift source file. '
      + 'This is a packaging bug — please report it.',
    )
  }
  return compileSwiftHelper(src, cached)
}

/**
 * Pre-compile the Swift helper without doing anything else. Used by the UI
 * to show an explicit "compiling helper" step before the export, so the user
 * isn't left staring at a spinner that says "look for the macOS dialog"
 * while we silently build a binary.
 *
 * Returns the path to the compiled binary (same as `ensureSwiftHelper`).
 */
export async function precompileSwiftHelper(): Promise<string> {
  return ensureSwiftHelper()
}

/**
 * Spawn an arbitrary command, capturing stdout/stderr/exit-code. Used for
 * `swiftc` and the Swift helper itself.
 */
interface SpawnResult {
  stdout: string
  stderr: string
  code: number | null
}

function spawnCapture(command: string, args: readonly string[]): Promise<SpawnResult> {
  return new Promise((resolveRun) => {
    const child = spawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })
    child.once('error', (err) => {
      resolveRun({ stdout, stderr: stderr + (err instanceof Error ? err.message : String(err)), code: null })
    })
    child.once('close', (code) => {
      resolveRun({ stdout, stderr, code })
    })
  })
}

export interface ExportP12Options {
  /**
   * Pre-resolved Swift helper binary path. Used in tests to inject a fake
   * binary; in production this is computed automatically.
   */
  helperPathOverride?: string
}

/**
 * Export the chosen identity from the user's Keychain as a base64'd PKCS#12.
 *
 * Triggers exactly TWO macOS Keychain prompts on the user's first run for
 * a given identity (one for "access" ACL, one for "export" ACL). Both
 * decisions are cached when the user clicks "Always Allow", so subsequent
 * runs against the same identity from the same binary are silent.
 *
 * Internally calls the bundled Swift helper (compiled on first use to the
 * OS temp folder via `swiftc`). The helper uses Security framework's
 * `SecItemExport(.formatPKCS12)` — the only Apple-supported path that works
 * on Xcode-imported (non-extractable) signing keys.
 *
 * @param targetSha1 SHA1 of the identity to export (from {@link listSigningIdentities})
 * @param options    See {@link ExportP12Options}
 */
export async function exportP12FromKeychain(
  targetSha1: string,
  options: ExportP12Options = {},
): Promise<ExportedP12> {
  if (!isMacOS())
    throw new NotMacOSError()

  const sha1 = targetSha1.toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(sha1)) {
    throw new MacOSSigningError(`Invalid SHA1 for identity export: "${targetSha1}"`)
  }

  const helperPath = options.helperPathOverride ?? await ensureSwiftHelper()
  const passphrase = generateP12Passphrase()

  // Temp dir for the .p12 file — removed in finally{} regardless of outcome.
  const workDir = await mkdtemp(join(tmpdir(), 'capgo-p12-'))
  const p12Path = join(workDir, 'identity.p12')

  try {
    const result = await spawnCapture(helperPath, [
      '--sha1',
      sha1,
      '--output',
      p12Path,
      '--passphrase',
      passphrase,
    ])

    // The helper ALWAYS emits one line of JSON on stdout — success or fail.
    // Parse it before checking exit code so we get the structured errorCode.
    const parsed = parseHelperJson(result.stdout, result.stderr, result.code)

    if (!parsed.ok) {
      const code = parsed.errorCode ?? 'INTERNAL'
      const msg = parsed.message ?? 'Unknown error from keychain-export helper'
      const osStatus = parsed.osStatus !== undefined ? ` [OSStatus ${parsed.osStatus}]` : ''
      throw new MacOSSigningError(
        `keychain-export ${code}: ${msg}${osStatus}`,
      )
    }

    const p12Buffer = await readFile(p12Path)
    return { base64: p12Buffer.toString('base64'), passphrase }
  }
  finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => { /* best-effort */ })
  }
}

/**
 * Parse the helper's JSON output. Tolerates: extra whitespace, trailing
 * newline, BOM. Throws a clear error if the output is unparseable — that
 * indicates the helper crashed without emitting JSON, which our Swift code
 * tries hard to never do (see keychain-export.swift's top-level catch).
 *
 * Exported for tests.
 */
export function parseHelperJson(
  stdout: string,
  stderr: string,
  exitCode: number | null,
): SwiftHelperResult {
  const trimmed = stdout.trim().replace(/^\uFEFF/, '')
  if (!trimmed) {
    // No JSON at all — helper crashed before reaching emitFailureAndExit.
    throw new MacOSSigningError(
      `keychain-export helper produced no JSON output (exit ${exitCode}). `
      + `Stderr: ${stderr.trim() || '(empty)'}`,
    )
  }
  // Only parse the LAST line in case there's incidental stdout chatter.
  const lastLine = trimmed.split('\n').filter(Boolean).pop() ?? ''
  let parsed: unknown
  try {
    parsed = JSON.parse(lastLine)
  }
  catch (err) {
    throw new MacOSSigningError(
      `keychain-export helper emitted unparseable JSON (exit ${exitCode}): "${lastLine}". `
      + `Parse error: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new MacOSSigningError(
      `keychain-export helper JSON was not an object (exit ${exitCode}): "${lastLine}"`,
    )
  }
  return parsed as SwiftHelperResult
}
