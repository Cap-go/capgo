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
import { accessSync, constants, existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { parseMobileprovisionDetailed } from '../mobileprovision-parser.js'

/** Absolute path to the system `security` binary. */
const SECURITY_BIN = '/usr/bin/security'

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

/**
 * Compare a provisioning profile's bundle id against the app's concrete bundle
 * id, honoring Apple's wildcard syntax. The mobileprovision parser leaves the
 * asterisk in place after stripping the team-id prefix, so a wildcard profile
 * arrives here as either the bare `*` (matches everything the team owns) or a
 * suffix wildcard like `com.example.*` (matches `com.example.<anything>`).
 *
 * Exported so the file-picker validation in the Ink UI can reuse the same
 * matching rule as `filterProfilesForApp` — otherwise a wildcard
 * `.mobileprovision` picked manually would be hard-rejected even though the
 * underlying profile is valid for the current app.
 */
export function bundleIdMatches(profileBundleId: string, appId: string): boolean {
  if (profileBundleId === appId)
    return true
  if (profileBundleId === '*')
    return true
  if (profileBundleId.endsWith('.*')) {
    const prefix = profileBundleId.slice(0, profileBundleId.length - 1)
    return appId.startsWith(prefix)
  }
  return false
}

/**
 * Filter profiles that are actually usable for a given Capacitor app + iOS
 * distribution mode. Used by the import-existing flow to detect dead-end
 * situations where an identity has profiles for a different app or the wrong
 * distribution mode — in which case the no-match-recovery menu can offer
 * "fetch / create via Apple" instead of dropping the user at an empty picker.
 *
 * `importDistribution` is null/undefined when the user hasn't picked yet —
 * in that case any profileType is accepted.
 *
 * Bundle-id comparison goes through {@link bundleIdMatches} so wildcard
 * profiles (the norm for ad_hoc/enterprise teams that share one profile
 * across many apps) are accepted alongside literal-equality matches. Apple
 * never issues wildcard `app_store` profiles in practice, so when the caller
 * pins `importDistribution = 'app_store'` the conjunction naturally drops
 * any ad_hoc/enterprise wildcards that happen to be installed.
 */
export function filterProfilesForApp(
  profiles: readonly DiscoveredProfile[],
  appId: string,
  importDistribution: 'app_store' | 'ad_hoc' | null | undefined,
): DiscoveredProfile[] {
  return profiles.filter(p =>
    bundleIdMatches(p.bundleId, appId)
    && (!importDistribution || p.profileType === importDistribution),
  )
}

// ─── P12 export ──────────────────────────────────────────────────────

/**
 * Generate a cryptographically random passphrase suitable for wrapping the
 * exported PKCS#12. 32 bytes of entropy → 64-char hex string.
 */
export function generateP12Passphrase(): string {
  return randomBytes(32).toString('hex')
}

// ─── Precompiled helper resolution ────────────────────────────────────

/**
 * Apple Team ID the precompiled helper binaries are signed with. Used in the
 * codesign designated-requirement check before executing a package-resolved
 * binary. Must match the Developer ID Application cert used by
 * .github/workflows/publish_cli_helper.yml.
 */
const CAPGO_APPLE_TEAM_ID = 'UVTJ336J2D'

/**
 * Bundle identifier (CFBundleIdentifier) the helper's Capgo.app is built with.
 * Pinned in the designated requirement so the check accepts ONLY this binary,
 * not merely any binary signed with Capgo's Developer ID cert. Must match
 * cli-helper/assets/Info.plist.template and sign-and-notarize.sh.
 */
const HELPER_BUNDLE_IDENTIFIER = 'app.capgo.cli.helper'

const HELPER_PACKAGE_PREFIX = '@capgo/cli-keychain-darwin-'

/**
 * Map a Node `process.arch` value to the matching helper package name, or
 * null when no precompiled helper exists for that architecture.
 */
export function helperPackageName(arch: string): string | null {
  if (arch === 'arm64' || arch === 'x64')
    return `${HELPER_PACKAGE_PREFIX}${arch}`
  return null
}

/**
 * codesign designated requirement asserting: the exact helper bundle identifier
 * (app.capgo.cli.helper), an Apple-rooted chain, a Developer ID Application leaf
 * cert (OID 1.2.840.113635.100.6.1.13), and the given Apple Team ID as the
 * signing team. The identifier clause is what scopes the requirement to THIS
 * binary — without it, any other binary signed with Capgo's Developer ID cert
 * (a future tool, a leaked artifact) would also satisfy the check.
 */
export function helperSignatureRequirement(teamId: string = CAPGO_APPLE_TEAM_ID): string {
  return `=identifier "${HELPER_BUNDLE_IDENTIFIER}" and anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] and certificate leaf[subject.OU] = "${teamId}"`
}

/**
 * Build-time flag controlling whether CAPGO_KEYCHAIN_HELPER_PATH is honored.
 * cli/build.mjs `define`s this to `false` for npm release builds — the whole
 * env-override branch (including the string literal) is dead-code-eliminated
 * from dist/index.js, and CI asserts the string is absent. Dev builds
 * (NODE_ENV=development) define it `true`. Running unbundled source (tests,
 * `bun src/index.ts`) leaves it undefined → override disabled (fail closed).
 */
declare const __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__: boolean | undefined

interface CodesignRunner {
  (args: readonly string[]): Promise<SpawnResult>
}

const defaultCodesignRunner: CodesignRunner = args => spawnCapture('/usr/bin/codesign', args)

export interface ResolveHelperBinaryOptions {
  /** Override `process.arch` (tests). */
  arch?: string
  /**
   * Override module resolution (tests). Each resolver receives the package's
   * `package.json` specifier and must return its absolute path or throw. Pass an
   * ARRAY to test the fallback chain (each base is tried in order until one
   * resolves); a single function is treated as a one-element chain.
   */
  resolve?: ((specifier: string) => string) | Array<(specifier: string) => string>
  /** Override the codesign spawn (tests). */
  codesignRunner?: CodesignRunner
  /** Force the dev env-override gate (tests). Defaults to the build-time flag. */
  allowEnvOverride?: boolean
  /**
   * Project directory to ALSO resolve the helper package from, in addition to the
   * CLI's own node_modules. Lets a project-local `npm i @capgo/cli-keychain-darwin-*`
   * be picked up even when the CLI runs from a global install or the MCP server
   * (which doesn't resolve from the user's project). Defaults to `process.cwd()`.
   * Ignored when `resolve` is provided (tests).
   */
  cwd?: string
}

/**
 * Locate the precompiled `helper` binary for this machine and verify its code
 * signature chains to Capgo's Developer ID before returning it.
 *
 * Resolution order:
 *   1. CAPGO_KEYCHAIN_HELPER_PATH (dev builds only — see the build-time flag)
 *   2. The arch-matching @capgo/cli-keychain-darwin-* optional dependency
 *   3. Hard error with install guidance. There is no compile fallback.
 */
export async function resolveHelperBinary(options: ResolveHelperBinaryOptions = {}): Promise<string> {
  // Env-override gate. The OUTER condition folds to a literal `false` in npm
  // release bundles (build.mjs defines __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__ =
  // false), so the minifier deletes this whole block — including the
  // CAPGO_KEYCHAIN_HELPER_PATH string literal. CI asserts that string is absent
  // from dist/index.js. The gate is open when the flag is undefined (unbundled
  // source: tests, `bun src/index.ts`) or defined true (dev builds).
  if (typeof __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__ === 'undefined' || __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__) {
    const allowEnvOverride = options.allowEnvOverride
      ?? (typeof __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__ !== 'undefined' && __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__)
    if (allowEnvOverride) {
      const overridePath = process.env.CAPGO_KEYCHAIN_HELPER_PATH
      if (overridePath) {
        if (!existsSync(overridePath))
          throw new MacOSSigningError(`CAPGO_KEYCHAIN_HELPER_PATH points to a missing file: ${overridePath}`)
        try {
          accessSync(overridePath, constants.X_OK)
        }
        catch {
          throw new MacOSSigningError(`CAPGO_KEYCHAIN_HELPER_PATH points to a non-executable file: ${overridePath}`)
        }
        return overridePath
      }
    }
  }

  const arch = options.arch ?? process.arch
  const packageName = helperPackageName(arch)
  if (!packageName) {
    throw new MacOSSigningError(
      `No precompiled Capgo keychain helper exists for ${process.platform}/${arch}. `
      + `Supported macOS architectures: arm64, x64.`,
    )
  }

  // Resolve the helper's package.json from (1) the CLI's own node_modules, then
  // (2) the project the user is working in. The project fallback means a local
  // `npm i @capgo/cli-keychain-darwin-*` is honored even when the CLI runs from a
  // global install or the MCP server — which resolves modules relative to the CLI,
  // NOT the user's project. `options.resolve` (tests) takes sole precedence.
  const resolveBases = options.resolve
    ? (Array.isArray(options.resolve) ? options.resolve : [options.resolve])
    : [
        createRequire(import.meta.url).resolve,
        createRequire(join(options.cwd ?? process.cwd(), 'package.json')).resolve,
      ]
  let packageJsonPath: string | undefined
  for (const resolveSpecifier of resolveBases) {
    try {
      packageJsonPath = resolveSpecifier(`${packageName}/package.json`)
      break
    }
    catch {
      // Try the next resolution base.
    }
  }
  if (!packageJsonPath) {
    throw new MacOSSigningError(
      `The Capgo keychain helper package (${packageName}) is not installed. `
      + `It ships as an optional dependency of @capgo/cli — reinstall without `
      + `--no-optional / --omit=optional, or install it in this project: npm i ${packageName}`,
    )
  }

  // The package ships a signed `Capgo.app` bundle (a directory). We verify the
  // bundle's code signature, then run the executable inside it. The bundle —
  // not a bare binary — is what gives the macOS Keychain prompts the "Capgo"
  // name + icon and keys the "Always Allow" grant to CFBundleIdentifier.
  const bundlePath = join(dirname(packageJsonPath), 'Capgo.app')
  const execPath = join(bundlePath, 'Contents', 'MacOS', 'capgo')
  try {
    accessSync(execPath, constants.X_OK)
  }
  catch {
    throw new MacOSSigningError(
      `The keychain helper package (${packageName}) is installed but its Capgo.app `
      + `bundle is missing or not executable at ${execPath}. Reinstall ${packageName}.`,
    )
  }

  await verifyHelperSignature(bundlePath, packageName, options.codesignRunner ?? defaultCodesignRunner)
  return execPath
}

/**
 * Verify the binary's code signature against Capgo's designated requirement
 * (Apple-rooted chain + Developer ID Application leaf + Capgo Team ID).
 * macOS validates the certificate chain and the binary's seal, so this also
 * detects post-install tampering. Throws — never executes the binary — on
 * any failure.
 */
async function verifyHelperSignature(
  binaryPath: string,
  packageName: string,
  runner: CodesignRunner,
): Promise<void> {
  const result = await runner(['--verify', '--strict', '-R', helperSignatureRequirement(), binaryPath])
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim()
    throw new MacOSSigningError(
      `Refusing to run the keychain helper at ${binaryPath}: its code signature `
      + `did not verify as Capgo's (codesign exit ${result.code}${detail ? `: ${detail}` : ''}). `
      + `Reinstall ${packageName} and try again.`,
    )
  }
}

// ─── Native helper (Swift) for single-prompt P12 export ──────────────

/**
 * Output shape from the Swift helper's stdout — always emitted as one line of
 * JSON regardless of success or failure. See cli-helper/src/helper.swift for
 * the source of truth.
 */
interface SwiftHelperResult {
  ok: boolean
  // Success fields:
  p12Path?: string
  p12SizeBytes?: number
  identityName?: string
  // Failure fields:
  errorCode?: 'INVALID_ARGS' | 'NO_IDENTITY' | 'USER_DENIED' | 'EXPORT_FAILED' | 'WRITE_FAILED' | 'FORBIDDEN_CALLER' | 'INTERNAL'
  message?: string
  osStatus?: number
}

/**
 * Spawn an arbitrary command, capturing stdout/stderr/exit-code. Used for
 * `/usr/bin/codesign` and the precompiled Swift helper itself.
 */
interface SpawnResult {
  stdout: string
  stderr: string
  code: number | null
}

function spawnCapture(command: string, args: readonly string[], stdinInput?: string): Promise<SpawnResult> {
  return new Promise((resolveRun) => {
    // Pipe stdin only when we have something to feed it (the keychain helper's
    // wrap passphrase) — that keeps it off the process argv where any same-user
    // process could read it via `ps`. codesign and other callers pass no input.
    const stdin: 'pipe' | 'ignore' = stdinInput !== undefined ? 'pipe' : 'ignore'
    const child = spawn(command, [...args], { stdio: [stdin, 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    // stdout/stderr are always 'pipe' above, so they are non-null at runtime;
    // optional chaining only satisfies the widened type from the stdin variable.
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })
    child.once('error', (err) => {
      resolveRun({ stdout, stderr: stderr + (err instanceof Error ? err.message : String(err)), code: null })
    })
    child.once('close', (code) => {
      resolveRun({ stdout, stderr, code })
    })
    if (stdinInput !== undefined && child.stdin) {
      // Swallow EPIPE if the child exits before reading stdin — the exit
      // code/JSON is the real signal, not the write.
      child.stdin.on('error', () => {})
      child.stdin.end(stdinInput)
    }
  })
}

export interface ExportP12Options {
  /**
   * Pre-resolved helper binary path. Used in tests to inject a fake binary;
   * in production this is computed automatically. Bypasses the signature
   * check — not reachable from user input.
   */
  helperPathOverride?: string
  /** Injection points for {@link resolveHelperBinary} (tests). */
  resolveOptions?: ResolveHelperBinaryOptions
}

/**
 * Export the chosen identity from the user's Keychain as a base64'd PKCS#12.
 *
 * Triggers exactly TWO macOS Keychain prompts on the user's first run for
 * a given identity (one for "access" ACL, one for "export" ACL). Both
 * decisions are cached when the user clicks "Always Allow", so subsequent
 * runs against the same identity from the same binary are silent.
 *
 * Internally runs the precompiled, signature-verified `helper keychain-export`
 * subcommand from the arch-matching `@capgo/cli-keychain-darwin-*` package.
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

  const helperPath = options.helperPathOverride ?? await resolveHelperBinary(options.resolveOptions)
  const passphrase = generateP12Passphrase()

  // Temp dir for the .p12 file — removed in finally{} regardless of outcome.
  const workDir = await mkdtemp(join(tmpdir(), 'capgo-p12-'))
  const p12Path = join(workDir, 'identity.p12')

  try {
    // Passphrase goes over stdin (one line), NOT argv, so it never appears in
    // `ps`/argv for the brief export window. The helper reads one line of stdin.
    const result = await spawnCapture(helperPath, [
      'keychain-export',
      '--sha1',
      sha1,
      '--output',
      p12Path,
      '--invoked-by',
      'capgo-cli',
    ], `${passphrase}\n`)

    // The helper ALWAYS emits one line of JSON on stdout — success or fail.
    // Parse it before checking exit code so we get the structured errorCode.
    const parsed = parseHelperJson(result.stdout, result.stderr, result.code)

    // Strict `=== true`: the JSON comes from an external process, so a truthy
    // non-boolean `ok` must NOT be read as success.
    if (parsed.ok !== true) {
      const code = parsed.errorCode ?? 'INTERNAL'
      const msg = parsed.message ?? 'Unknown error from keychain-export helper'
      const osStatus = parsed.osStatus !== undefined ? ` [OSStatus ${parsed.osStatus}]` : ''
      throw new MacOSSigningError(
        `keychain-export ${code}: ${msg}${osStatus}`,
      )
    }

    // Independently validate the artifact before we treat it as a signing key:
    // a truncated/empty export must fail loudly here, not be stored as a
    // "successful" empty credential.
    const p12Buffer = await readFile(p12Path)
    if (p12Buffer.length === 0) {
      throw new MacOSSigningError(
        'keychain-export reported success but the exported .p12 is empty.',
      )
    }
    if (typeof parsed.p12SizeBytes === 'number' && parsed.p12SizeBytes !== p12Buffer.length) {
      throw new MacOSSigningError(
        `keychain-export size mismatch: helper reported ${parsed.p12SizeBytes} bytes, read ${p12Buffer.length}.`,
      )
    }
    return { base64: p12Buffer.toString('base64'), passphrase }
  }
  finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => { /* best-effort */ })
  }
}

/**
 * Parse the helper's JSON output. Tolerates: extra whitespace, trailing
 * newline, BOM. Throws a clear error if the output is unparsable — that
 * indicates the helper crashed without emitting JSON, which our Swift code
 * tries hard to never do (see cli-helper/src/helper.swift's top-level catch).
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
      `keychain-export helper emitted unparsable JSON (exit ${exitCode}): "${lastLine}". `
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
