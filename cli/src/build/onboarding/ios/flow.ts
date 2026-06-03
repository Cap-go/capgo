// src/build/onboarding/ios/flow.ts
//
// iOS onboarding engine skeleton. Mirrors the android engine shapes
// (android/flow.ts) so the platform-agnostic PlatformFlow adapter can wrap it
// the same way android-flow.ts wraps the android engine.
//
// BATCH 0 (scaffolding) widens the transient surface (IosStepCtx) and the
// injected-deps surface (IosEffectDeps) to the FULL driver-held shape the
// per-step logic will need — see docs/superpowers/audits/2026-06-03-ios-
// transition-graph.md "Ephemeral inventory". The actual per-step view-models,
// input mutations and async effects are still stubs, to be filled in by the
// later batches:
//   - iosViewForStep   → real per-step view-models      (BATCH 2/4/6 …)
//   - applyIosInput    → real progress mutations         (BATCH 2/4 …)
//   - runIosEffect     → real async side-effects         (BATCH 2/3/5/7 …)
//
// iOS reuses the EXISTING master types — OnboardingStep / OnboardingProgress —
// rather than inventing a parallel iOS step union.
//
// TYPING NOTE — the iOS Apple-API / CSR / macOS-signing / mobileprovision
// helper modules do NOT exist in this codebase yet (the corresponding steps are
// documented as "STUB – not implemented" in the transition-graph audit). So the
// injected helper signatures below are MINIMAL STRUCTURAL types that mirror the
// real signatures from the audit. When those helper modules land, swap the
// structural aliases for the real exported types — the field names already
// match so callers will not need to change. Types the codebase DOES define
// (CertificateData / ProfileData / ApiKeyData / EnrichedIdentityAvailability,
// the CI-secret + TailTransient shapes) are imported for real.

import type { Buffer } from 'node:buffer'
import type {
  ApiKeyData,
  CertificateData,
  EnrichedIdentityAvailability,
  OnboardingProgress,
  OnboardingStep,
  ProfileData,
} from '../types.js'
import type { CiSecretEntry, CiSecretSetupAdvice, CiSecretTarget } from '../ci-secrets.js'
// The post-save tail transient is shared with android — reuse it verbatim so the
// `saving-credentials → ask-build` handoff (BATCH 1) threads the same fields.
import type { TailTransient } from '../tail/flow.js'

// ─── Structural helper types (placeholders for the not-yet-existing modules) ──
//
// Each mirrors the shape the audit attributes to the named helper module. They
// are intentionally minimal — only the fields the engine threads. Replace with
// the real exports from apple-api.ts / macos-signing.ts / mobileprovision-
// parser.ts when those modules are added.

/** A signing identity discovered on the Mac (macos-signing listSigningIdentities). */
export interface IosSigningIdentity {
  /** Common name / label as it appears in the Keychain. */
  name: string
  /** SHA-1 of the identity's certificate. */
  sha1?: string
  /** Apple team id, when resolvable. */
  teamId?: string
}

/** A provisioning profile discovered on disk or synthesized from Apple. */
export interface IosDiscoveredProfile {
  /** Absolute path on disk, when the profile came from a local scan. */
  path?: string
  /** Profile name. */
  name?: string
  /** UUID. */
  uuid?: string
  /** Bundle id the profile is scoped to. */
  bundleId?: string
  /** Allowed-cert SHA-1 list. */
  certificateSha1s?: string[]
  /** Base64 of the profile bytes, when synthesized from an Apple-API response. */
  profileBase64?: string
}

/** A scanned identity + its matched on-disk profiles (import-scanning result). */
export interface IosImportMatch {
  identity: IosSigningIdentity
  profiles: IosDiscoveredProfile[]
}

/**
 * Stable reason an identity has no usable matching profile. Drives the
 * `import-no-match-recovery` menu variant. (Mirrors the `noMatchReason` enum.)
 */
export type IosNoMatchReason
  = | 'apple-no-cert-match'
    | 'apple-no-profiles-linked'
    | 'apple-bundle-mismatch'
    | 'apple-distribution-mismatch'
    | 'apple-other'
    | 'no-profile-on-disk'

/** An existing Apple cert offered for revocation when the 3-cert limit is hit. */
export interface IosExistingCert {
  certificateId: string
  name?: string
  expirationDate?: string
  serialNumber?: string
}

/** A duplicate Capgo provisioning profile (creating-profile / import-create). */
export interface IosDuplicateProfile {
  profileId: string
  name?: string
}

/** Parsed result of a `.mobileprovision` file (mobileprovision-parser). */
export interface IosParsedMobileprovision {
  name?: string
  uuid?: string
  bundleId?: string
  certificateSha1s?: string[]
  /** Distribution type, e.g. 'app-store' | 'ad-hoc'. */
  distributionType?: string
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type IosStepKind = 'auto' | 'input' | 'choice' | 'done' | 'error'

export interface IosStepOption {
  value: string
  label?: string
  note?: string
}

export interface IosStepView {
  step: OnboardingStep
  kind: IosStepKind
  title?: string
  prompt?: string // 'input' steps
  collect?: string[] // field(s) an 'input' step gathers
  options?: IosStepOption[] // 'choice' steps
  message?: string // 'done' | 'error'
}

/**
 * Per-step runtime context the driver supplies to the view builder AND threads
 * back through `IosEffectResult.transient` between effects. EVERY field is
 * OPTIONAL so a caller that only passes `{ appId }` still gets a usable view.
 *
 * This is the iOS "ephemeral inventory" — driver-held transient state that is
 * NEVER persisted to progress.json (it carries Apple-side selections + raw
 * cert/profile/keychain payloads). The total resume function (getIosResumeStep)
 * NEVER produces a step that depends on these — on resume the driver re-runs the
 * silent inventory (import-scanning) and re-renders the picker. See the audit's
 * "Ephemeral inventory" section for the producer/consumer map.
 */
export interface IosStepCtx {
  appId?: string

  // ── Import-flow selections (the core ephemeral set) ──────────────────────
  /** Selected signing identity (import-pick-identity). REQUIRED by import-exporting. */
  chosenIdentity?: IosSigningIdentity
  /** Selected provisioning profile (import-pick-profile). REQUIRED by import-exporting. */
  chosenProfile?: IosDiscoveredProfile
  /** Discovery result list from import-scanning (identities + on-disk profiles). */
  importMatches?: IosImportMatch[]
  /** Scanned on-disk profiles (paired with importMatches). */
  importProfiles?: IosDiscoveredProfile[]
  /** Per-identity Apple-side availability (import-validating-all-certs). */
  identityAvailability?: Record<string, EnrichedIdentityAvailability>
  /** Per-identity prefetched Apple profiles (parallel prefetch after validation). */
  profilePrefetch?: Record<string, IosDiscoveredProfile[]>
  /** Apple cert resource id for the chosen identity (import-checking-apple-cert). */
  _appleCertIdForChosen?: string
  /** Why the chosen identity has no usable profile — drives the recovery menu. */
  noMatchReason?: IosNoMatchReason

  // ── Cert-limit & duplicate-profile recovery (ephemeral) ──────────────────
  /** Duplicate Capgo profiles (creating-profile / import-create-profile-only). */
  duplicateProfiles?: IosDuplicateProfile[]
  /** Existing Apple certs offered for revocation when the cert limit is hit. */
  existingCerts?: IosExistingCert[]
  /** The user's revoke selection (cert-limit-prompt → revoking-certificate). */
  certToRevoke?: IosExistingCert

  // ── Cert/profile export payloads (resolved once, carried to saving-credentials) ──
  /** Resolved certificate data (creating-profile create-new / import-exporting). */
  certData?: CertificateData
  /** Resolved profile data (creating-profile create-new / import-exporting). */
  profileData?: ProfileData
  /** Apple team id resolved alongside certData/profileData. */
  teamId?: string
  /** Keychain export password (import-exporting). Transient only. */
  importedP12Password?: string

  // ── .p8 validation buffer (ephemeral during input-p8-path) ───────────────
  /** Buffer of .p8 file content during validation (only the PATH is persisted). */
  p8Content?: Buffer

  // ── ASC API key data surfaced after verifying-key (ephemeral mirror) ─────
  /** Verified key id + issuer id (mirror of completedSteps.apiKeyVerified). */
  apiKey?: ApiKeyData

  // ── Confirm-app-id custom-input sub-mode (pure UI) ───────────────────────
  /** True while the confirm-app-id step is in its custom-input sub-mode. */
  confirmAppIdTyping?: boolean

  // ── Shared post-save tail transient (reused verbatim from android) ───────
  // The same fields the android engine threads after saving-credentials. Spread
  // in so the `saving-credentials → ask-build` handoff (BATCH 1) carries them.
  ciSecretEntries?: TailTransient['ciSecretEntries']
  savedCredentials?: TailTransient['savedCredentials']
  ciSecretTargets?: TailTransient['ciSecretTargets']
  ciSecretSetupAdvice?: TailTransient['ciSecretSetupAdvice']
  ciSecretRepoLabel?: TailTransient['ciSecretRepoLabel']
  ciSecretExistingKeys?: TailTransient['ciSecretExistingKeys']
  ciSecretUploadSummary?: TailTransient['ciSecretUploadSummary']
  envExportPath?: TailTransient['envExportPath']
  workflowFilePath?: TailTransient['workflowFilePath']
  buildUrl?: TailTransient['buildUrl']
  buildOutput?: TailTransient['buildOutput']
  aiJobId?: TailTransient['aiJobId']
}

/**
 * Async dependencies the iOS effects need (Apple API client, CSR + keychain
 * export, mobileprovision parsing, persistence, the shared tail helpers, and
 * status/log callbacks). EVERY helper is OPTIONAL and ADDITIVE so a driver can
 * inject only what the path it drives needs and the skeleton's stubs keep
 * type-checking. Signatures mirror the audit's helper modules; the structural
 * placeholder types above stand in until the real modules land.
 */
export interface IosEffectDeps {
  appId?: string

  // ── apple-api ────────────────────────────────────────────────────────────
  /** Verify an ASC API key (keyId + issuerId via the .p8). */
  verifyApiKey?: (args: { keyId: string, issuerId: string, p8Content: Buffer }) => Promise<{ teamId?: string }>
  /** Create a distribution certificate from a CSR. */
  createCertificate?: (args: { csr: string, accessToken?: string }) => Promise<CertificateData>
  /** Revoke an existing certificate (cert-limit recovery). */
  revokeCertificate?: (certificateId: string) => Promise<void>
  /** Create a provisioning profile for a bundle id + cert. */
  createProfile?: (args: { bundleId: string, certificateId: string, distribution?: string }) => Promise<ProfileData>
  /** Delete a provisioning profile (duplicate-profile recovery). */
  deleteProfile?: (profileId: string) => Promise<void>
  /** Resolve the Apple cert resource id from a local cert SHA-1. */
  findCertIdBySha1?: (sha1: string) => Promise<string | null>
  /** Classify a cert's Apple-side availability (import-validating-all-certs). */
  classifyCertAvailability?: (identity: IosSigningIdentity) => Promise<EnrichedIdentityAvailability>
  /** List the team's distribution certificates (cert-limit prompt). */
  listCertificates?: () => Promise<IosExistingCert[]>
  /** Check for duplicate Capgo profiles for a bundle id. */
  checkDuplicateProfiles?: (bundleId: string) => Promise<IosDuplicateProfile[]>
  /** Ensure the bundle id exists on Apple (import-create-profile-only). */
  ensureBundleId?: (bundleId: string) => Promise<void>
  /** List the Apple profiles linked to a cert (import-checking-apple-cert). */
  listProfilesForCert?: (certificateId: string) => Promise<IosDiscoveredProfile[]>

  // ── csr ────────────────────────────────────────────────────────────────
  /** Generate a CSR + private key PEM. */
  generateCsr?: (args?: { commonName?: string }) => { csr: string, privateKeyPem: string }
  /** Build a .p12 from a cert + private key. Returns base64. */
  createP12?: (args: { certificatePem: string, privateKeyPem: string, password: string }) => string

  // ── macos-signing ────────────────────────────────────────────────────────
  /** List the Mac's code-signing identities (import-scanning). */
  listSigningIdentities?: () => Promise<IosSigningIdentity[]>
  /** Scan the Mac's on-disk provisioning profiles (import-scanning). */
  scanProvisioningProfiles?: () => Promise<IosDiscoveredProfile[]>
  /** Export a .p12 (cert + key) from the Keychain (import-exporting). Returns base64. */
  exportP12FromKeychain?: (args: { identity: IosSigningIdentity, password: string }) => Promise<string>
  /** Pre-compile the Swift keychain-export helper (import-compiling-helper). */
  precompileSwiftHelper?: () => Promise<void>
  /** Whether the Swift keychain-export helper is already compiled + cached. */
  isHelperCached?: () => boolean

  // ── mobileprovision-parser ───────────────────────────────────────────────
  /** Parse a `.mobileprovision` file in detail (import-provide-profile-path). */
  parseMobileprovisionDetailed?: (bytes: Buffer) => IosParsedMobileprovision

  // ── persistence (the iOS progress equivalents of the android deps) ───────
  loadProgress?: (appId: string) => Promise<OnboardingProgress | null>
  saveProgress?: (appId: string, progress: OnboardingProgress) => Promise<void>
  deleteProgress?: (appId: string) => Promise<void>
  /** Persist the saved build-credential map (saving-credentials). */
  updateSavedCredentials?: (appId: string, platform: 'ios' | 'android', credentials: Record<string, string>) => Promise<void>
  loadSavedCredentials?: (appId: string) => Promise<unknown>

  // ── file system (injected so effects can be tested without real FS) ──────
  readFile?: (path: string) => Promise<Buffer>
  copyFile?: (src: string, dest: string) => Promise<void>

  // ── shared post-save tail helpers (wired through toTailDeps in BATCH 1) ──
  // Reused verbatim from the android surface so the iOS engine can delegate the
  // post-save tail to runTailEffect/tailViewForStep/applyTailInput. Left here as
  // OPTIONAL so BATCH 0 widens the surface without wiring the dispatch yet.
  createCiSecretEntries?: (credentials: Record<string, string>, apiKey?: string) => CiSecretEntry[]
  detectCiSecretTargets?: () => { targets: CiSecretTarget[], advice: CiSecretSetupAdvice[] }
  getCiSecretRepoLabelAsync?: (target: CiSecretTarget) => Promise<string | null>
  listExistingCiSecretKeysAsync?: (target: CiSecretTarget, keys: string[]) => Promise<string[]>
  uploadCiSecretsAsync?: (
    target: CiSecretTarget,
    entries: CiSecretEntry[],
    existingKeys?: string[],
    onProgress?: (current: number, total: number, keyName: string) => void,
  ) => Promise<void>
  defaultExportPath?: (appId: string, platform: 'ios' | 'android') => string
  requestBuildInternal?: (appId: string, options: Record<string, unknown>, silent?: boolean) => Promise<unknown>

  /**
   * DRIVER-HELD transient tail state threaded back into each post-save effect.
   * The TUI resolves these ONCE (at saving-credentials) and keeps them in React
   * state; a headless driver mirrors that by capturing the matching
   * IosEffectResult.transient and passing it back here on the NEXT effect.
   * NEVER persisted to progress.json. When absent (crash-recovery resume) the
   * effect falls back to a single lossy re-derivation from progress.
   */
  carried?: {
    savedCredentials?: Record<string, string>
    ciSecretEntries?: CiSecretEntry[]
    ciSecretExistingKeys?: string[]
    /** The chosen signing identity (lossy re-scan source on resume). */
    chosenIdentity?: IosSigningIdentity
    /** The chosen provisioning profile (lossy re-scan source on resume). */
    chosenProfile?: IosDiscoveredProfile
    /** Resolved cert/profile/team export payloads carried into saving-credentials. */
    certData?: CertificateData
    profileData?: ProfileData
    teamId?: string
  }

  // ── callbacks (optional — callers that don't need streaming can omit) ────
  onStatus?: (message: string) => void
  onLog?: (message: string, color?: string) => void
  signal?: AbortSignal
}

export interface IosEffectResult {
  /** Updated progress after the effect ran (matches what was persisted). */
  progress: OnboardingProgress
  /** Explicit next step when not derivable from progress alone (★ transitions). */
  next?: OnboardingStep
  /** Transient runtime data that lives in the driver but is NOT persisted. */
  transient?: Partial<IosStepCtx>
}

// ─── Stubs (to be filled in later batches) ──────────────────────────────────────

/**
 * Build the view-model for a given step. Stub: returns a minimal placeholder
 * 'auto' view echoing the step. Real per-step views land in later batches.
 */
export function iosViewForStep(
  step: OnboardingStep,
  _progress: OnboardingProgress,
  _ctx?: IosStepCtx,
): IosStepView {
  return { step, kind: 'auto', title: step }
}

/**
 * Apply a user input to progress. Stub: returns progress unchanged. Real
 * per-step mutations land in later batches.
 */
export function applyIosInput(
  _step: OnboardingStep,
  progress: OnboardingProgress,
  _input: unknown,
): OnboardingProgress {
  return progress
}

/**
 * Run the async side-effect for a step. Stub: not implemented yet — the real
 * Apple-API / keychain / build effects land in later batches.
 */
export function runIosEffect(
  _step: OnboardingStep,
  _progress: OnboardingProgress,
  _deps: IosEffectDeps,
): Promise<IosEffectResult> {
  throw new Error('runIosEffect: not implemented')
}
