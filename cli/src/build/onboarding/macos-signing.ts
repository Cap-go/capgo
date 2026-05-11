// src/build/onboarding/macos-signing.ts
//
// Helpers for inspecting and exporting Apple signing identities + provisioning
// profiles from a developer's Mac, so the iOS onboarding flow can offer
// "Import existing" as an alternative to creating fresh credentials via the
// App Store Connect API.
//
// Everything in this module shells out to `/usr/bin/security` and reads files
// under the user's home directory. macOS-only.

import type * as forgeTypes from 'node-forge'
import type { Buffer } from 'node:buffer'
import type { MobileprovisionDetail } from '../mobileprovision-parser.js'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
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

export interface ExportP12Options {
  /** Optional keychain path; defaults to the user's login keychain (login.keychain-db) */
  keychain?: string
  /** Optional injection point for the `security` subprocess runner — used in tests */
  runner?: SecurityRunner
  /**
   * Optional override for the P12 filter step (used in tests to avoid loading
   * node-forge against a real P12). Default uses the bundled node-forge.
   */
  forgeFilter?: (allP12Base64: string, passphrase: string, targetSha1: string) => string
}

/**
 * Export the chosen identity from the user's login keychain as a base64'd
 * PKCS#12 blob.
 *
 * THIS IS THE ONE CALL THAT TRIGGERS A MACOS KEYCHAIN PROMPT.
 *
 * macOS will display a single GUI dialog asking permission for `security` to
 * access the private key. The user should click "Always Allow" to avoid
 * being prompted again on retry.
 *
 * Implementation note: `security export -t identities` exports ALL identities
 * in the chosen keychain to a single P12. We then filter that P12 down to
 * the chosen identity using node-forge before returning. This keeps the
 * Keychain prompt count to exactly one, regardless of how many identities
 * the user has.
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

  const keychain = options.keychain ?? DEFAULT_LOGIN_KEYCHAIN
  const passphrase = generateP12Passphrase()
  const runner = options.runner ?? defaultRunner

  // Write into a fresh temp dir so we can rm -rf cleanly even if the export fails
  const workDir = await mkdtemp(join(tmpdir(), 'capgo-p12-'))
  const allP12Path = join(workDir, 'all.p12')

  try {
    const exportResult = await runner([
      'export',
      '-k',
      keychain,
      '-t',
      'identities',
      '-f',
      'pkcs12',
      '-P',
      passphrase,
      '-o',
      allP12Path,
    ])
    if (exportResult.code !== 0) {
      throw new MacOSSigningError(
        `security export failed (exit ${exportResult.code}). `
        + `Most common cause: the private key isn't marked exportable in Keychain Access, `
        + `or the user denied the access prompt. `
        + `Stderr: ${exportResult.stderr.trim() || '(empty)'}`,
      )
    }

    const allP12Buffer = await readFile(allP12Path)
    const allP12Base64 = allP12Buffer.toString('base64')

    // Filter the multi-identity P12 down to just the chosen one
    const filterFn = options.forgeFilter ?? filterP12ToSingleIdentity
    const filtered = filterFn(allP12Base64, passphrase, sha1)

    return { base64: filtered, passphrase }
  }
  finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ })
  }
}

/**
 * Re-encode a multi-identity PKCS#12 to contain only the entry whose
 * certificate matches `targetSha1`. Uses the same 3DES PBE that the rest of
 * the pipeline produces so `security import` on the build server accepts it.
 *
 * Exported for tests; call sites should use exportP12FromKeychain instead.
 */
export function filterP12ToSingleIdentity(
  allP12Base64: string,
  passphrase: string,
  targetSha1: string,
): string {
  // Lazy require — node-forge has heavy import-time cost we don't want to pay
  // when the module is loaded on non-macOS hosts.
  // eslint-disable-next-line ts/no-require-imports
  const forge: typeof import('node-forge') = require('node-forge')

  const p12Der = forge.util.decode64(allP12Base64)
  const p12Asn1 = forge.asn1.fromDer(p12Der)
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, passphrase)

  const wantSha1 = targetSha1.toLowerCase()
  let chosenKey: forgeTypes.pki.PrivateKey | undefined

  // Walk safe contents and bag entries to find matching cert + paired key
  const certCandidates: Array<{ sha1: string, cert: forgeTypes.pki.Certificate, localKeyId?: string }> = []
  const keyCandidates: Array<{ key: forgeTypes.pki.PrivateKey, localKeyId?: string }> = []

  for (const safeContent of p12.safeContents) {
    for (const safeBag of safeContent.safeBags) {
      const localKeyId = safeBag.attributes?.localKeyId?.[0] as string | undefined
      if (safeBag.type === forge.pki.oids.certBag && safeBag.cert) {
        const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(safeBag.cert)).getBytes()
        const sha1 = forge.md.sha1.create().update(certDer).digest().toHex().toLowerCase()
        certCandidates.push({ sha1, cert: safeBag.cert, localKeyId })
      }
      else if (
        (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag || safeBag.type === forge.pki.oids.keyBag)
        && safeBag.key
      ) {
        keyCandidates.push({ key: safeBag.key, localKeyId })
      }
    }
  }

  const matchingCert = certCandidates.find(c => c.sha1 === wantSha1)
  if (!matchingCert) {
    throw new MacOSSigningError(`Exported P12 did not contain identity with SHA1 ${targetSha1}`)
  }
  const chosenCert = matchingCert.cert
  // Pair by localKeyId if present (PKCS#12 standard linkage), else fall back
  // to the only key in the file.
  if (matchingCert.localKeyId) {
    chosenKey = keyCandidates.find(k => k.localKeyId === matchingCert.localKeyId)?.key
  }
  if (!chosenKey && keyCandidates.length === 1) {
    chosenKey = keyCandidates[0].key
  }
  if (!chosenKey) {
    throw new MacOSSigningError(`Exported P12 did not contain a private key paired to identity ${targetSha1}`)
  }

  // Re-encode with 3DES PBE — matches the existing csr.ts createP12() output.
  // node-forge's `PrivateKey` union also covers symmetric keys; the export came
  // from `security export -t identities` so we know it's an RSA key.
  const filteredAsn1 = forge.pkcs12.toPkcs12Asn1(
    chosenKey as forgeTypes.pki.rsa.PrivateKey,
    [chosenCert],
    passphrase,
    { algorithm: '3des' },
  )
  const filteredDer = forge.asn1.toDer(filteredAsn1).getBytes()
  return forge.util.encode64(filteredDer)
}
