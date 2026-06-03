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
// TYPING NOTE — the iOS Apple-API / CSR / macOS-signing / mobileprovision helper
// modules DO exist in this codebase (pure, injectable, with tests). The injected
// helper data types + ephemeral selections below import the REAL exported types
// from those modules directly:
//   - apple-api.ts            → AscDistributionCert / AscProfileSummary
//   - macos-signing.ts        → SigningIdentity / DiscoveredProfile / IdentityProfileMatch
//   - mobileprovision-parser  → MobileprovisionDetail
//   - csr.ts                  → CsrResult / P12Result
// Types the codebase also defines (CertificateData / ProfileData / ApiKeyData /
// EnrichedIdentityAvailability, the CI-secret + TailTransient shapes) are imported
// from types.ts / ci-secrets.ts / tail/flow.ts. The only structural type kept local
// is IosNoMatchReason — the recovery-menu reason enum has no helper-module export.

import type { Buffer } from 'node:buffer'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AscDistributionCert, AscProfileSummary } from '../apple-api.js'
import type {
  ApiKeyData,
  CertificateData,
  EnrichedIdentityAvailability,
  OnboardingProgress,
  OnboardingStep,
  ProfileData,
} from '../types.js'
import type { AsyncCommandRunner, CiSecretDiscovery, CiSecretEntry, CiSecretTarget, CommandRunner } from '../ci-secrets.js'
import type { DiscoveredProfile, IdentityProfileMatch, SigningIdentity } from '../macos-signing.js'
import type { MobileprovisionDetail } from '../../mobileprovision-parser.js'
// Real helper-module types the tail-aligned IosEffectDeps signatures reference —
// the SAME set tail/flow.ts imports, so `toTailDeps` maps the deps 1:1.
import type { BuildCredentials } from '../../../schemas/build.js'
import type { BuildLogger, BuildRequestOptions, BuildRequestResult } from '../../request.js'
import type { EnvExportOpts, EnvExportResult } from '../env-export.js'
import type { GeneratedWorkflow, WorkflowGeneratorOpts } from '../workflow-generator.js'
import type { WorkflowWriteOptions, WorkflowWriteResult } from '../workflow-writer.js'
// The post-save tail transient is shared with android — reuse it verbatim so the
// `saving-credentials → ask-build` handoff (BATCH 1) threads the same fields.
// BATCH 1 also delegates the WHOLE post-save tail (saving-credentials → ask-build
// → CI-secrets → env/workflow → build-complete) to the platform-neutral shared
// module via `toTailDeps` — exactly as android/flow.ts does — so the routing is
// implemented once for both platforms.
import type { TailEffectDeps, TailInput, TailStep, TailStepCtx, TailStepView, TailTransient } from '../tail/flow.js'
import { applyTailInput, runTailEffect, tailViewForStep } from '../tail/flow.js'
import { CertificateLimitError, DuplicateProfileError } from '../apple-api.js'
import { DEFAULT_P12_PASSWORD } from '../csr.js'
import { extractKeyIdFromP8Path } from '../progress.js'
import { getIosResumeStep } from './progress.js'

// ─── Local structural helper types ───────────────────────────────────────────
//
// Almost every helper data type now comes from the REAL helper modules (imported
// above). The two types defined here have NO direct helper-module export:
//
//   - IosNoMatchReason   — the import-no-match-recovery menu's reason enum. It is
//     an engine-level concept, not produced by any helper module, so it stays local.
//   - IosDuplicateProfile — the duplicate-Capgo-profile shape surfaced by
//     apple-api's findCapgoProfiles() / DuplicateProfileError.profiles, which is the
//     inline `{ id, name, profileType }` triple. apple-api does not export a named
//     type for that triple, so we derive a minimal one from AscProfileSummary (the
//     richest exported profile shape) via Pick — keeping it tied to the real source.

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

/**
 * A duplicate Capgo provisioning profile (creating-profile / import-create).
 * Matches the `{ id, name, profileType }` triple returned by apple-api's
 * findCapgoProfiles() and carried on DuplicateProfileError.profiles. Derived
 * from the real AscProfileSummary so it tracks any future field additions.
 */
export type IosDuplicateProfile = Pick<AscProfileSummary, 'id' | 'name' | 'profileType'>

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
  chosenIdentity?: SigningIdentity
  /** Selected provisioning profile (import-pick-profile). REQUIRED by import-exporting. */
  chosenProfile?: DiscoveredProfile
  /** Discovery result list from import-scanning (identities + on-disk profiles). */
  importMatches?: IdentityProfileMatch[]
  /** Scanned on-disk profiles (paired with importMatches). */
  importProfiles?: DiscoveredProfile[]
  /** Per-identity Apple-side availability (import-validating-all-certs). */
  identityAvailability?: Record<string, EnrichedIdentityAvailability>
  /** Per-identity prefetched Apple profiles (parallel prefetch after validation). */
  profilePrefetch?: Record<string, DiscoveredProfile[]>
  /** Apple cert resource id for the chosen identity (import-checking-apple-cert). */
  _appleCertIdForChosen?: string
  /** Why the chosen identity has no usable profile — drives the recovery menu. */
  noMatchReason?: IosNoMatchReason

  // ── Cert-limit & duplicate-profile recovery (ephemeral) ──────────────────
  /** Duplicate Capgo profiles (creating-profile / import-create-profile-only). */
  duplicateProfiles?: IosDuplicateProfile[]
  /** Existing Apple certs offered for revocation when the cert limit is hit. */
  existingCerts?: AscDistributionCert[]
  /** The user's revoke selection (cert-limit-prompt → revoking-certificate). */
  certToRevoke?: AscDistributionCert

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
  /**
   * True once the p8-method-select file-picker effect has opened the native
   * dialog this drive — the engine returns it in transient and the driver
   * threads it back as `deps.carried.pickerOpened` so a re-render does NOT
   * re-open the picker. Mirrors the TUI's `pickerOpenedRef` guard.
   */
  pickerOpened?: boolean

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
 * type-checking. Data types are the REAL exports from apple-api / macos-signing /
 * mobileprovision-parser / csr; only the call-shape envelopes are engine-local.
 */
export interface IosEffectDeps {
  appId?: string

  // ── apple-api ────────────────────────────────────────────────────────────
  /** Verify an ASC API key (keyId + issuerId via the .p8). */
  verifyApiKey?: (args: { keyId: string, issuerId: string, p8Content: Buffer }) => Promise<{ teamId?: string }>
  /**
   * Create a distribution certificate from a CSR. Returns the RAW Apple cert
   * response (mirrors the real apple-api `createCertificate` helper): the cert
   * resource id, the base64 DER `certificateContent`, the expiry, and the team
   * id. The engine pairs `certificateContent` + the CSR private key via
   * `createP12` to produce the final .p12 — keeping the IO-free engine in charge
   * of assembling the CertificateData credential. Throws CertificateLimitError
   * (carrying the existing certs) when Apple's per-team cert limit is hit.
   */
  createCertificate?: (args: { csr: string, accessToken?: string }) => Promise<{
    certificateId: string
    certificateContent: string
    expirationDate: string
    teamId: string
  }>
  /** Revoke an existing certificate (cert-limit recovery). */
  revokeCertificate?: (certificateId: string) => Promise<void>
  /** Create a provisioning profile for a bundle id + cert. */
  createProfile?: (args: { bundleId: string, certificateId: string, distribution?: string }) => Promise<ProfileData>
  /** Delete a provisioning profile (duplicate-profile recovery). */
  deleteProfile?: (profileId: string) => Promise<void>
  /** Resolve the Apple cert resource id from a local cert SHA-1. */
  findCertIdBySha1?: (sha1: string) => Promise<string | null>
  /** Classify a cert's Apple-side availability (import-validating-all-certs). */
  classifyCertAvailability?: (identity: SigningIdentity) => Promise<EnrichedIdentityAvailability>
  /** List the team's distribution certificates (cert-limit prompt). */
  listCertificates?: () => Promise<AscDistributionCert[]>
  /** Check for duplicate Capgo profiles for a bundle id. */
  checkDuplicateProfiles?: (bundleId: string) => Promise<IosDuplicateProfile[]>
  /** Ensure the bundle id exists on Apple (import-create-profile-only). */
  ensureBundleId?: (bundleId: string) => Promise<void>
  /** List the Apple profiles linked to a cert (import-checking-apple-cert). */
  listProfilesForCert?: (certificateId: string) => Promise<DiscoveredProfile[]>

  // ── csr ────────────────────────────────────────────────────────────────
  /** Generate a CSR + private key PEM. */
  generateCsr?: (args?: { commonName?: string }) => { csr: string, privateKeyPem: string }
  /** Build a .p12 from a cert + private key. Returns base64. */
  createP12?: (args: { certificatePem: string, privateKeyPem: string, password: string }) => string

  // ── macos-signing ────────────────────────────────────────────────────────
  /** List the Mac's code-signing identities (import-scanning). */
  listSigningIdentities?: () => Promise<SigningIdentity[]>
  /** Scan the Mac's on-disk provisioning profiles (import-scanning). */
  scanProvisioningProfiles?: () => Promise<DiscoveredProfile[]>
  /** Export a .p12 (cert + key) from the Keychain (import-exporting). Returns base64. */
  exportP12FromKeychain?: (args: { identity: SigningIdentity, password: string }) => Promise<string>
  /** Pre-compile the Swift keychain-export helper (import-compiling-helper). */
  precompileSwiftHelper?: () => Promise<void>
  /** Whether the Swift keychain-export helper is already compiled + cached. */
  isHelperCached?: () => boolean

  // ── mobileprovision-parser ───────────────────────────────────────────────
  /** Parse a `.mobileprovision` file in detail (import-provide-profile-path). */
  parseMobileprovisionDetailed?: (bytes: Buffer) => MobileprovisionDetail

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
  /**
   * Open the native .p8 file picker (p8-method-select). Resolves to the chosen
   * absolute path, or null when the user cancels. The driver pre-binds the real
   * `openFilePicker` here; tests inject a canned path/null. Mirrors the TUI's
   * `openFilePicker()` call inside the p8-method-select effect.
   */
  openP8FilePicker?: () => Promise<string | null>
  /**
   * Whether the host is macOS. Gates the post-backup fork: on macOS the user is
   * offered import-vs-create at `setup-method-select`; off-macOS the import
   * sub-flow is unavailable so backing-up routes straight to the create-new
   * `api-key-instructions`. Mirrors the TUI's `isMacOS()` branch. Defaults to
   * true when omitted (the macOS-first onboarding target).
   */
  isMacOS?: () => boolean

  // ── shared post-save tail helpers (wired through toTailDeps in BATCH 1) ──
  // Reused from the android surface so the iOS engine can delegate the post-save
  // tail to runTailEffect/tailViewForStep/applyTailInput. The signatures mirror
  // the real helper modules VERBATIM (the same shapes TailEffectDeps expects) so
  // `toTailDeps` maps them 1:1 with no coercion, exactly as android/flow.ts does.
  createCiSecretEntries?: (credentials: Partial<BuildCredentials>, apiKey?: string) => CiSecretEntry[]
  detectCiSecretTargets?: (runner?: CommandRunner) => CiSecretDiscovery
  getCiSecretRepoLabelAsync?: (target: CiSecretTarget, runner?: AsyncCommandRunner) => Promise<string | null>
  listExistingCiSecretKeysAsync?: (target: CiSecretTarget, keys: string[], runner?: AsyncCommandRunner) => Promise<string[]>
  uploadCiSecretsAsync?: (
    target: CiSecretTarget,
    entries: CiSecretEntry[],
    existingKeys?: string[],
    runner?: AsyncCommandRunner,
    onProgress?: (current: number, total: number, keyName: string) => void,
  ) => Promise<void>
  exportCredentialsToEnv?: (opts: EnvExportOpts) => EnvExportResult
  defaultExportPath?: (appId: string, platform: 'ios' | 'android') => string
  generateWorkflow?: (opts: WorkflowGeneratorOpts) => GeneratedWorkflow
  writeWorkflowFile?: (opts: WorkflowGeneratorOpts, writeOptions?: WorkflowWriteOptions) => WorkflowWriteResult
  requestBuildInternal?: (appId: string, options: BuildRequestOptions, silent?: boolean, logger?: BuildLogger) => Promise<BuildRequestResult>

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
    chosenIdentity?: SigningIdentity
    /** The chosen provisioning profile (lossy re-scan source on resume). */
    chosenProfile?: DiscoveredProfile
    /** Resolved cert/profile/team export payloads carried into saving-credentials. */
    certData?: CertificateData
    profileData?: ProfileData
    teamId?: string
    /**
     * The validated .p8 file content (ASC private key) the driver carries
     * between the .p8 input chain and `verifying-key`. ONLY the p8Path is
     * persisted to progress.json — the raw key bytes ride this transient
     * channel, mirroring the TUI's `p8ContentRef`. The verifying-key effect
     * reads it from here; when absent (crash-recovery resume) it falls back to
     * re-reading the file at `progress.p8Path` via `deps.readFile`.
     */
    p8Content?: Buffer
    /**
     * Tracks that the p8-method-select file-picker effect already ran, so a
     * re-render does NOT re-open the native picker. Mirrors the TUI's
     * `pickerOpenedRef`. The driver threads the returned `pickerOpened: true`
     * transient back here on the next call.
     */
    pickerOpened?: boolean
    /**
     * Keychain export passphrase for the IMPORT path's .p12 (import-exporting).
     * Transient only — the import-exporting effect never persists it, so the
     * saving-credentials handoff reads it from carried. Absent on the create-new
     * path (which uses the well-known DEFAULT_P12_PASSWORD) and on a crash-recovery
     * resume that lost the in-memory state.
     */
    importedP12Password?: string
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

// ─── Post-save tail delegation (BATCH 1) ────────────────────────────────────
//
// The post-save tail (saving-credentials → ask-build → CI-secrets → env/workflow
// → build-complete) is platform-NEUTRAL and already implemented once in
// `../tail/flow.js`. The iOS engine delegates to it exactly as android does:
//   - runIosEffect      → runTailEffect       for steps in TAIL_EFFECT_STEPS
//   - iosViewForStep    → tailViewForStep      for steps in TAIL_VIEW_STEPS
//   - applyIosInput     → applyTailInput       for steps in TAIL_INPUT_STEPS
// `toTailDeps(iosDeps)` adapts the iOS effect deps to the neutral TailEffectDeps,
// supplying the iOS credential SHAPE (cert/profile/teamId/p12) + the iOS resume
// resolver. The neutral view maps 1:1 back onto IosStepView. The step-id sets are
// the SAME ids android uses (the shared TailStep union), echoed as OnboardingStep.

/**
 * Post-save tail steps whose EFFECT the iOS engine delegates to the shared
 * module. INCLUDES saving-credentials (the convergence point) so the
 * saving-credentials → ask-build handoff (transient: ciSecretEntries,
 * savedCredentials) is owned by the shared tail. EXCLUDES ai-analysis-*
 * (TUI-only) and every iOS-specific provisioning effect.
 */
const TAIL_EFFECT_STEPS = new Set<OnboardingStep>([
  'saving-credentials',
  'detecting-ci-secrets',
  'checking-ci-secrets',
  'uploading-ci-secrets',
  'exporting-env',
  'overwrite-and-export-env',
  'writing-workflow-file',
  'requesting-build',
])

const TAIL_VIEW_STEPS = new Set<OnboardingStep>([
  'ci-secrets-setup',
  'ci-secrets-target-select',
  'ask-ci-secrets',
  'confirm-ci-secret-overwrite',
  'ci-secrets-failed',
  'ask-github-actions-setup',
  'confirm-secrets-push',
  'ask-export-env',
  'confirm-env-export-overwrite',
  'pick-package-manager',
  'pick-build-script',
  'pick-build-script-custom',
  'preview-workflow-file',
  'view-workflow-diff',
  'ask-build',
  'build-complete',
])

const TAIL_INPUT_STEPS = new Set<OnboardingStep>([
  'ci-secrets-target-select',
  'ask-github-actions-setup',
  'ask-export-env',
  'pick-package-manager',
  'pick-build-script',
  'pick-build-script-custom',
])

/**
 * Build the iOS saved-credential SHAPE written at `saving-credentials`.
 * Replicates the iOS TUI's `doSaveCredentials` map (ui/app.tsx) so the shared
 * tail stays platform-neutral while iOS owns its field set. Reads the resolved
 * cert/profile/team payloads from the driver's `carried` transient (the IMPORT
 * path synthesizes them transiently) and falls back to the persisted
 * create-new `completedSteps.certificateCreated/profileCreated` markers. Throws
 * on missing inputs — the same fail-fast guard the android builder uses.
 */
function buildIosSavedCredentials(progress: OnboardingProgress, deps: IosEffectDeps): Record<string, string> {
  const carried = deps.carried
  const certData = carried?.certData ?? progress.completedSteps.certificateCreated
  const profileData = carried?.profileData ?? progress.completedSteps.profileCreated
  if (!certData)
    throw new Error('iOS certificate not provisioned')
  if (!profileData)
    throw new Error('iOS provisioning profile not created')

  const teamId = carried?.teamId ?? certData.teamId
  if (!teamId)
    throw new Error('iOS team id missing')

  // Import path uses the random keychain-export passphrase; create-new uses the
  // well-known DEFAULT_P12_PASSWORD that csr.ts's createP12 produces.
  const isImport = progress.setupMethod === 'import-existing'
  const p12Password = isImport && carried?.importedP12Password ? carried.importedP12Password : DEFAULT_P12_PASSWORD

  // The provisioning_map key is the resolved iOS bundle id (override when the
  // user confirmed a different one), matching what the build system looks up by
  // PRODUCT_BUNDLE_IDENTIFIER at sign time.
  const provisioningBundleId = progress.iosBundleIdOverride || progress.appId
  const provisioningMap: Record<string, { profile: string, name: string }> = {
    [provisioningBundleId]: {
      profile: profileData.profileBase64,
      name: profileData.profileName,
    },
  }

  const distribution = isImport ? (progress.importDistribution || 'app_store') : 'app_store'

  return {
    BUILD_CERTIFICATE_BASE64: certData.p12Base64,
    P12_PASSWORD: p12Password,
    CAPGO_IOS_PROVISIONING_MAP: JSON.stringify(provisioningMap),
    APP_STORE_CONNECT_TEAM_ID: teamId,
    CAPGO_IOS_DISTRIBUTION: distribution,
  }
}

/**
 * Lossy fallback used when the driver did not thread the saved-credential map
 * through `carried` (a crash-recovery resume that lost the in-memory state).
 * Rebuilds ONLY from the persisted create-new `completedSteps` markers; the
 * IMPORT path's exported cert/profile are synthesized-and-transient (never
 * persisted), so an imported export cannot be rebuilt here — those resumes
 * restart the import export sub-flow from import-scanning. Returns {} when not
 * rebuildable (matching the android lossy-rebuild contract).
 */
function rebuildIosTailCredentials(progress: OnboardingProgress): Record<string, string> {
  const certData = progress.completedSteps.certificateCreated
  const profileData = progress.completedSteps.profileCreated
  if (!certData || !profileData || !certData.teamId)
    return {}

  const provisioningBundleId = progress.iosBundleIdOverride || progress.appId
  const provisioningMap: Record<string, { profile: string, name: string }> = {
    [provisioningBundleId]: {
      profile: profileData.profileBase64,
      name: profileData.profileName,
    },
  }
  const distribution = progress.setupMethod === 'import-existing' ? (progress.importDistribution || 'app_store') : 'app_store'

  return {
    BUILD_CERTIFICATE_BASE64: certData.p12Base64,
    P12_PASSWORD: DEFAULT_P12_PASSWORD,
    CAPGO_IOS_PROVISIONING_MAP: JSON.stringify(provisioningMap),
    APP_STORE_CONNECT_TEAM_ID: certData.teamId,
    CAPGO_IOS_DISTRIBUTION: distribution,
  }
}

/**
 * Adapt the iOS effect deps to the platform-neutral TailEffectDeps. The shared
 * tail module owns the routing/branching; iOS supplies its platform tag, its
 * credential SHAPE (closure-bound over `deps.carried` so the import path's
 * transient cert/profile/p12 reach the builder), its lossy rebuild, and its
 * resume resolver, plus the same injected helpers (passed straight through).
 * Mirrors android/flow.ts's toTailDeps 1:1.
 */
function toTailDeps(deps: IosEffectDeps): TailEffectDeps<OnboardingProgress> {
  return {
    platform: 'ios',
    buildSavedCredentials: progress => buildIosSavedCredentials(progress, deps),
    rebuildTailCredentials: rebuildIosTailCredentials,
    resumeStep: getIosResumeStep,
    updateSavedCredentials: deps.updateSavedCredentials!,
    loadProgress: deps.loadProgress!,
    saveProgress: deps.saveProgress!,
    deleteProgress: deps.deleteProgress!,
    createCiSecretEntries: deps.createCiSecretEntries,
    detectCiSecretTargets: deps.detectCiSecretTargets,
    getCiSecretRepoLabelAsync: deps.getCiSecretRepoLabelAsync,
    listExistingCiSecretKeysAsync: deps.listExistingCiSecretKeysAsync,
    uploadCiSecretsAsync: deps.uploadCiSecretsAsync,
    exportCredentialsToEnv: deps.exportCredentialsToEnv,
    defaultExportPath: deps.defaultExportPath,
    generateWorkflow: deps.generateWorkflow,
    writeWorkflowFile: deps.writeWorkflowFile,
    requestBuildInternal: deps.requestBuildInternal,
    carried: deps.carried,
    onStatus: deps.onStatus,
    onLog: deps.onLog,
    signal: deps.signal,
  }
}

/** Map the shared TailStepView back onto IosStepView (same field shape). */
function mapTailViewToIosStepView(v: TailStepView, step: OnboardingStep): IosStepView {
  return {
    step,
    kind: v.kind,
    title: v.title,
    prompt: v.prompt,
    collect: v.collect,
    options: v.options,
    message: v.message,
  }
}

// ─── Create-new choice/input vocabulary (BATCH 2b) ──────────────────────────────
//
// The create-new credential entry steps are pure choice/input screens — the .p8
// chain (api-key-instructions → input-p8-path → input-key-id → input-issuer-id)
// plus the setup-method fork. Their option labels MIRROR the TUI components
// (ui/steps/ios-credentials.tsx); the values MIRROR the TUI onChange handlers
// (ui/app.tsx). The per-step routing/persistence is split exactly as the TUI:
//   - setup-method-select → persists setupMethod; resume routes the fork
//   - api-key-instructions → navigation-only choice (picker | manual)
//   - input-p8-path/key-id/issuer-id → persist p8Path/keyId/issuerId incrementally
// File validation + keyId extraction are an IO boundary (the p8-method-select
// effect / the driver), NOT the pure reducer — so applyIosInput only records the
// path string. The detected Key ID default is re-derived from the filename here.

/** setup-method-select options (ui/steps/ios-credentials.tsx:105–108). */
const OPTIONS_SETUP_METHOD: IosStepOption[] = [
  { value: 'create', label: '🆕  Create new via App Store Connect API' },
  { value: 'import', label: '📥  Import existing from this Mac (Keychain + Xcode profiles)' },
]

/** api-key-instructions .p8-method options (ui/steps/ios-credentials.tsx:151–154). */
const OPTIONS_API_KEY_METHOD: IosStepOption[] = [
  { value: 'picker', label: '📂  Open file picker' },
  { value: 'manual', label: '📝  Type the path' },
]

/**
 * The create-new choice/input vocabulary. Mirrors android's `AndroidInput`:
 * one variant per choice/input step that records (or routes) state. The iOS
 * `applyIosInput` signature still accepts `unknown`, so callers cast to this.
 * Navigation-only choices (api-key-instructions) are included for completeness
 * but return progress unchanged.
 */
export type IosInput =
  // setup-method fork — 'create' → create-new (.p8 chain); 'import' → import sub-flow.
  | { step: 'setup-method-select', value: 'create' | 'import' }
  // .p8-method choice — navigation only ('picker' → p8-method-select effect,
  // 'manual' → input-p8-path). Persists nothing.
  | { step: 'api-key-instructions', value: 'picker' | 'manual' }
  // .p8 file PATH (validation + keyId extraction happen at the effect boundary).
  | { step: 'input-p8-path', value: string }
  // ASC Key ID (empty submission reuses the filename-detected default).
  | { step: 'input-key-id', value: string }
  // ASC Issuer ID.
  | { step: 'input-issuer-id', value: string }
// ─── Engine surface (tail-wired; non-tail steps remain stubs) ───────────────────

/**
 * Build the view-model for a given step. Post-save tail steps delegate to the
 * shared neutral view (adapted back to IosStepView). The create-new choice/input
 * steps (setup-method fork + .p8 chain) return real per-step views mirroring the
 * TUI prompts/options (ui/steps/ios-credentials.tsx). All other steps return a
 * minimal placeholder 'auto' view echoing the step (real per-step views land in
 * later batches).
 */
export function iosViewForStep(
  step: OnboardingStep,
  progress: OnboardingProgress,
  ctx?: IosStepCtx,
): IosStepView {
  // Post-save tail: delegate to the shared platform-neutral view. IosStepCtx is
  // a superset of TailStepCtx, so it threads straight through.
  if (TAIL_VIEW_STEPS.has(step))
    return mapTailViewToIosStepView(tailViewForStep(step as TailStep, progress, (ctx ?? {}) as TailStepCtx), step)

  switch (step) {
    // ── setup-method-select (choice) ──────────────────────────────────────────
    // ui/steps/ios-credentials.tsx:98–118. The create-vs-import fork.
    case 'setup-method-select':
      return {
        step,
        kind: 'choice',
        title: 'How do you want to set up iOS credentials?',
        options: OPTIONS_SETUP_METHOD,
      }

    // ── api-key-instructions (choice) ─────────────────────────────────────────
    // ui/steps/ios-credentials.tsx:139–207. Navigation-only .p8-method fork:
    // 'picker' → p8-method-select (native dialog effect), 'manual' → input-p8-path.
    case 'api-key-instructions':
      return {
        step,
        kind: 'choice',
        title: 'We need an App Store Connect API key to manage certificates and profiles for you.',
        prompt: 'How do you want to provide the .p8 file?',
        options: OPTIONS_API_KEY_METHOD,
      }

    // ── input-p8-path (input) ─────────────────────────────────────────────────
    // ui/steps/ios-credentials.tsx:240–250. The .p8 file path.
    case 'input-p8-path':
      return {
        step,
        kind: 'input',
        prompt: 'Path to your .p8 file:',
        collect: ['p8Path'],
      }

    // ── input-key-id (input) ──────────────────────────────────────────────────
    // ui/steps/ios-credentials.tsx:270–305. The ASC Key ID, pre-filled with the
    // value detected from the AuthKey_<id>.p8 filename (the picker effect persists
    // it; for the manual path it is re-derived here so the view can offer it).
    // An empty submission reuses this default (applyIosInput handles the reuse).
    case 'input-key-id': {
      const detected = progress.keyId || extractKeyIdFromP8Path(progress.p8Path ?? '')
      return {
        step,
        kind: 'input',
        prompt: detected
          ? `Key ID (detected from filename): ${detected} — press Enter to confirm, or type a different one`
          : 'Key ID (shown next to the key name in App Store Connect):',
        collect: ['keyId'],
      }
    }

    // ── input-issuer-id (input) ───────────────────────────────────────────────
    // ui/steps/ios-credentials.tsx:317–338. The ASC Issuer ID (UUID).
    case 'input-issuer-id':
      return {
        step,
        kind: 'input',
        prompt: 'Issuer ID (UUID at the very top of the API keys page, above the key list):',
        collect: ['issuerId'],
      }

    default:
      return { step, kind: 'auto', title: step }
  }
}

/**
 * Apply a user input to progress. Post-save tail choice/input steps delegate
 * the reducer to the shared neutral module. The create-new choice/input steps
 * persist their field(s) exactly as the TUI's onSubmit/onChange handlers do
 * (ui/app.tsx). All other steps return progress unchanged (real per-step
 * mutations land in later batches).
 *
 * PURE — no IO. The .p8 file read + keyId extraction + Apple verification are
 * effect-boundary concerns (p8-method-select / verifying-key); the reducers here
 * only record the raw user input into progress.
 */
export function applyIosInput(
  step: OnboardingStep,
  progress: OnboardingProgress,
  input: unknown,
): OnboardingProgress {
  // Post-save tail: delegate the tail choice/input reducers to the shared
  // platform-neutral module. The iOS tail input variants are structurally
  // identical to TailInput, so they thread straight through.
  if (TAIL_INPUT_STEPS.has(step))
    return applyTailInput(step as TailStep, progress, input as TailInput)

  switch (step) {
    // ── setup-method-select ───────────────────────────────────────────────────
    // ui/app.tsx:3042 — `value === 'import' ? 'import-existing' : 'create-new'`.
    // Persisting the fork is what lets resume route the right path (create-new
    // .p8 chain vs the import sub-flow) instead of re-asking.
    case 'setup-method-select': {
      const i = input as Extract<IosInput, { step: 'setup-method-select' }>
      return { ...progress, setupMethod: i.value === 'import' ? 'import-existing' : 'create-new' }
    }

    // ── api-key-instructions ──────────────────────────────────────────────────
    // ui/app.tsx:3800–3806 — navigation-only choice. 'picker' opens the native
    // dialog (the p8-method-select effect), 'manual' goes to input-p8-path. The
    // driver routes on the choice value; the pure reducer records nothing.
    case 'api-key-instructions':
      return progress

    // ── input-p8-path ─────────────────────────────────────────────────────────
    // ui/app.tsx:3836–3849 — the TUI reads/validates the file (IO) then persists
    // the path. Here we ONLY persist the path string (file validation + keyId
    // extraction are the effect boundary). Persisting just p8Path keeps the
    // resume routing landing on input-key-id (getResumeStep: p8Path set, no keyId).
    case 'input-p8-path': {
      const i = input as Extract<IosInput, { step: 'input-p8-path' }>
      const p8Path = i.value.trim()
      if (!p8Path)
        return progress
      return { ...progress, p8Path }
    }

    // ── input-key-id ──────────────────────────────────────────────────────────
    // ui/app.tsx:3863–3872 — `(value || keyId).trim()` reuses the detected key
    // ID when the user just presses Enter. The detected default is the value the
    // picker effect persisted (progress.keyId) or, on the manual path, the value
    // re-derived from the AuthKey_<id>.p8 filename. An empty submission with no
    // detectable default is a no-op (stays on the step) — mirroring the TUI guard.
    case 'input-key-id': {
      const i = input as Extract<IosInput, { step: 'input-key-id' }>
      const detected = progress.keyId || extractKeyIdFromP8Path(progress.p8Path ?? '')
      const keyId = (i.value || detected).trim()
      if (!keyId)
        return progress
      return { ...progress, keyId }
    }

    // ── input-issuer-id ───────────────────────────────────────────────────────
    // ui/app.tsx:3882–3888 — trim + reject empty, then persist. With p8Path +
    // keyId + issuerId all present, resume routes to verifying-key.
    case 'input-issuer-id': {
      const i = input as Extract<IosInput, { step: 'input-issuer-id' }>
      const issuerId = i.value.trim()
      if (!issuerId)
        return progress
      return { ...progress, issuerId }
    }

    default:
      return progress
  }
}

/**
 * Run the async side-effect for a step. Post-save tail steps (incl.
 * saving-credentials) delegate to the shared neutral module via toTailDeps; the
 * neutral result maps 1:1 onto IosEffectResult (next is a wider OnboardingStep;
 * transient is a subset of IosStepCtx). All other steps are not implemented yet
 * — the real Apple-API / keychain / build effects land in later batches.
 */
export async function runIosEffect(
  step: OnboardingStep,
  progress: OnboardingProgress,
  deps: IosEffectDeps,
): Promise<IosEffectResult> {
  // Post-save tail: delegate to the platform-neutral shared module. The tail
  // routing/branching/transient-threading lives there once for ios + android;
  // iOS supplies its platform tag + credential SHAPE via toTailDeps.
  if (TAIL_EFFECT_STEPS.has(step)) {
    const result = await runTailEffect(step as TailStep, progress, toTailDeps(deps))
    return {
      progress: result.progress,
      next: result.next as OnboardingStep | undefined,
      transient: result.transient,
    }
  }

  switch (step) {
    // ── backing-up ──────────────────────────────────────────────────────────
    // app.tsx:1230–1255. Copy the existing ~/.capgo-credentials/credentials.json
    // to a timestamped sibling (via the injected backup dep) BEFORE the cert/
    // profile phase can overwrite it, then advance to the setup-method fork.
    // A missing source file is non-fatal (yellow warning) — the gate's promise
    // was "backup first", not "must exist". The gate flips to 'done' so a resume
    // falls THROUGH to the setup routing instead of re-parking on backing-up.
    //
    // Routing mirrors the TUI: macOS offers the import-vs-create fork at
    // setup-method-select; off-macOS the import sub-flow is unavailable, so the
    // user goes straight to the create-new api-key-instructions. isMacOS defaults
    // to true (the macOS-first target) when the dep is omitted.
    case 'backing-up': {
      const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      try {
        await deps.copyFile?.(
          credentialsBackupSourcePath(),
          credentialsBackupDestPath(date),
        )
        deps.onLog?.('✔ Backup saved')
      }
      catch {
        deps.onLog?.('⚠ Could not backup credentials (file may not exist yet)', 'yellow')
      }
      const nextProgress: OnboardingProgress = { ...progress, _credentialsExistGate: 'done' }
      await deps.saveProgress?.(progress.appId, nextProgress)
      const onMac = deps.isMacOS ? deps.isMacOS() : true
      return { progress: nextProgress, next: onMac ? 'setup-method-select' : 'api-key-instructions' }
    }

    // ── p8-method-select (file-picker effect) ─────────────────────────────────
    // app.tsx:1862–1895. Open the native .p8 picker EXACTLY ONCE (idempotent —
    // the TUI guards with pickerOpenedRef; the engine guards with the carried
    // `pickerOpened` flag so a re-render/redrive does NOT re-open the dialog).
    //   - file chosen → read it, persist {p8Path, extracted keyId}, return the
    //     raw bytes in transient.p8Content, advance to input-key-id.
    //   - cancelled   → fall back to manual entry at input-p8-path.
    // Persisting the extracted keyId here means a quit-before-the-Key-ID-step
    // resume restores it instead of showing the empty placeholder (app.tsx:1879).
    case 'p8-method-select': {
      // Idempotency guard: if the picker already ran this drive, do not re-open.
      if (deps.carried?.pickerOpened)
        return { progress, next: 'input-p8-path', transient: { pickerOpened: true } }

      const selected = await deps.openP8FilePicker?.()
      if (!selected) {
        // User cancelled the picker — fall back to manual path entry.
        return { progress, next: 'input-p8-path', transient: { pickerOpened: true } }
      }

      const bytes = await deps.readFile!(selected)
      const extracted = extractKeyIdFromP8Path(selected)
      const nextProgress: OnboardingProgress = {
        ...progress,
        p8Path: selected,
        ...(extracted ? { keyId: extracted } : {}),
      }
      await deps.saveProgress?.(progress.appId, nextProgress)
      deps.onLog?.(`✔ Key file selected · ${selected}`)
      return {
        progress: nextProgress,
        next: 'input-key-id',
        transient: { pickerOpened: true, p8Content: bytes },
      }
    }

    // ── verifying-key ─────────────────────────────────────────────────────────
    // app.tsx:1897–1976. Verify the ASC API key with Apple, then (create-new
    // path) advance to certificate creation. The .p8 BYTES are transient: the
    // driver carries them from the .p8 input chain via deps.carried.p8Content;
    // on a crash-recovery resume that lost them, re-read the file at p8Path.
    //
    // On success persist completedSteps.apiKeyVerified (keyId + issuerId), MERGING
    // into existing progress so setupMethod / importDistribution are preserved
    // (app.tsx:1907–1928 — a fresh-object save here once wiped the import context
    // and resumed into create-new). The verified team id (if any) rides transient
    // so the downstream cert/profile effects can reuse it without a re-fetch.
    case 'verifying-key': {
      const keyId = progress.keyId
      const issuerId = progress.issuerId
      if (!keyId || !issuerId)
        throw new Error('verifying-key: keyId/issuerId not yet collected')

      const p8Content = await resolveP8Content(progress, deps)

      try {
        const { teamId } = await deps.verifyApiKey!({ keyId, issuerId, p8Content })
        const apiKey: ApiKeyData = { keyId, issuerId }
        const nextProgress: OnboardingProgress = {
          ...progress,
          completedSteps: { ...progress.completedSteps, apiKeyVerified: apiKey },
        }
        await deps.saveProgress?.(progress.appId, nextProgress)
        deps.onLog?.(`✔ API Key verified — Key: ${keyId}`)
        return {
          progress: nextProgress,
          next: 'creating-certificate',
          transient: { apiKey, ...(teamId ? { teamId } : {}) },
        }
      }
      catch (err) {
        deps.onLog?.(`✖ ${err instanceof Error ? err.message : String(err)}`, 'red')
        return { progress, next: 'error' }
      }
    }

    // ── creating-certificate ──────────────────────────────────────────────────
    // app.tsx:1978–2025. Generate a CSR + private key, ask Apple to mint a
    // distribution certificate from the CSR, then build the .p12 locally from
    // Apple's cert content + the private key. The cert id / expiry / teamId /
    // p12 base64 are persisted to completedSteps.certificateCreated (a MARKER —
    // the p12 base64 IS the credential, written here so resume can rebuild the
    // saved-credential map without re-minting). The private key PEM is NEVER
    // persisted (the TUI stashes it on `_privateKeyPem` only across the await and
    // deletes it after .p12 creation; the IO-free engine keeps it in a local).
    //
    // Cert-limit branch: Apple rejects a 4th cert → CertificateLimitError. Surface
    // the existing certs in transient.existingCerts (fetched via listCertificates)
    // and route to cert-limit-prompt (its view lands in BATCH 3). Other failures
    // route to 'error'.
    case 'creating-certificate': {
      const { csr, privateKeyPem } = deps.generateCsr!()
      try {
        const cert = await deps.createCertificate!({ csr })
        const p12Base64 = deps.createP12!({
          certificatePem: cert.certificateContent,
          privateKeyPem,
          password: DEFAULT_P12_PASSWORD,
        })
        const certData: CertificateData = {
          certificateId: cert.certificateId,
          expirationDate: cert.expirationDate,
          teamId: cert.teamId,
          p12Base64,
        }
        const nextProgress: OnboardingProgress = {
          ...progress,
          completedSteps: { ...progress.completedSteps, certificateCreated: certData },
        }
        await deps.saveProgress?.(progress.appId, nextProgress)
        deps.onLog?.(`✔ Distribution certificate created — Expires ${cert.expirationDate}`)
        return {
          progress: nextProgress,
          next: 'creating-profile',
          transient: { certData, ...(certData.teamId ? { teamId: certData.teamId } : {}) },
        }
      }
      catch (err) {
        if (err instanceof CertificateLimitError) {
          // Offer the existing certs for revocation. Prefer the certs carried on
          // the error; fall back to a fresh list via listCertificates.
          const existingCerts = err.certificates?.length
            ? err.certificates
            : (await deps.listCertificates?.()) ?? []
          return { progress, next: 'cert-limit-prompt', transient: { existingCerts } }
        }
        deps.onLog?.(`✖ ${err instanceof Error ? err.message : String(err)}`, 'red')
        return { progress, next: 'error' }
      }
    }

    // ── creating-profile ──────────────────────────────────────────────────────
    // app.tsx:2049–2088. Register/find the bundle id on Apple and create the App
    // Store provisioning profile linking the cert. The resolved bundle id is the
    // confirmed override (iosBundleIdOverride) or config.appId — the SAME value
    // the provisioning_map is keyed by at saving-credentials. On success persist
    // completedSteps.profileCreated and thread cert/profile/teamId through
    // transient so the saving-credentials handoff reuses them without a re-fetch.
    //
    // Duplicate branch: Apple already has Capgo profiles for this bundle id →
    // DuplicateProfileError. Record duplicateProfileOrigin='creating-profile' so
    // the post-deletion effect retries the create-new path (not the import D2),
    // surface the duplicates in transient, and route to duplicate-profile-prompt
    // (its view lands in BATCH 3). Other failures route to 'error'.
    case 'creating-profile': {
      const bundleId = resolveIosBundleId(progress)
      const certificateId = deps.carried?.certData?.certificateId
        ?? progress.completedSteps.certificateCreated?.certificateId
      if (!certificateId)
        throw new Error('creating-profile: certificate not yet created')

      try {
        const profile = await deps.createProfile!({ bundleId, certificateId })
        // Detect duplicates AFTER a successful create as well — the TUI surfaces
        // them via the createProfile DuplicateProfileError, but the injected dep
        // may also expose a separate checkDuplicateProfiles probe. When it does
        // and finds duplicates, route to the prompt instead of advancing.
        const duplicates = (await deps.checkDuplicateProfiles?.(bundleId)) ?? []
        if (duplicates.length > 0) {
          const nextProgress: OnboardingProgress = {
            ...progress,
            duplicateProfileOrigin: 'creating-profile',
          }
          await deps.saveProgress?.(progress.appId, nextProgress)
          return {
            progress: nextProgress,
            next: 'duplicate-profile-prompt',
            transient: { duplicateProfiles: duplicates },
          }
        }

        const profileData: ProfileData = {
          profileId: profile.profileId,
          profileName: profile.profileName,
          profileBase64: profile.profileBase64,
        }
        const teamId = deps.carried?.teamId
          ?? progress.completedSteps.certificateCreated?.teamId
        const certData = deps.carried?.certData ?? progress.completedSteps.certificateCreated
        const nextProgress: OnboardingProgress = {
          ...progress,
          completedSteps: { ...progress.completedSteps, profileCreated: profileData },
        }
        await deps.saveProgress?.(progress.appId, nextProgress)
        deps.onLog?.(`✔ Provisioning profile created — "${profile.profileName}"`)
        return {
          progress: nextProgress,
          next: 'saving-credentials',
          transient: {
            profileData,
            ...(certData ? { certData } : {}),
            ...(teamId ? { teamId } : {}),
          },
        }
      }
      catch (err) {
        if (err instanceof DuplicateProfileError) {
          const nextProgress: OnboardingProgress = {
            ...progress,
            duplicateProfileOrigin: 'creating-profile',
          }
          await deps.saveProgress?.(progress.appId, nextProgress)
          return {
            progress: nextProgress,
            next: 'duplicate-profile-prompt',
            transient: { duplicateProfiles: err.profiles },
          }
        }
        deps.onLog?.(`✖ ${err instanceof Error ? err.message : String(err)}`, 'red')
        return { progress, next: 'error' }
      }
    }

    default:
      throw new Error(`runIosEffect: not implemented for step '${step}'`)
  }
}

// ─── Create-new effect helpers ─────────────────────────────────────────────────

/** ~/.capgo-credentials/credentials.json — the backing-up source (app.tsx:1232). */
function credentialsBackupSourcePath(): string {
  return join(homedir(), '.capgo-credentials', 'credentials.json')
}

/** The timestamped sibling backup destination (app.tsx:1234). */
function credentialsBackupDestPath(date: string): string {
  return join(homedir(), '.capgo-credentials', `credentials-${date}.copy.json`)
}

/**
 * Resolve the Apple-side iOS bundle id used for ensureBundleId / createProfile
 * and as the provisioning_map key. Mirrors the TUI's `iosBundleId` = the
 * confirmed override (when the user picked a bundle id different from
 * config.appId at confirm-app-id) else config.appId (== progress.appId here).
 */
function resolveIosBundleId(progress: OnboardingProgress): string {
  return progress.iosBundleIdOverride || progress.appId
}

/**
 * Resolve the validated .p8 bytes for verifying-key. The driver carries them in
 * deps.carried.p8Content (the transient channel mirroring the TUI's
 * p8ContentRef); on a crash-recovery resume that lost them, fall back to
 * re-reading the file at progress.p8Path via the injected readFile. Throws a
 * NeedP8-style error when neither is available — the same fail-fast the TUI's
 * getFreshToken does so the driver can re-prompt for the .p8.
 */
async function resolveP8Content(progress: OnboardingProgress, deps: IosEffectDeps): Promise<Buffer> {
  if (deps.carried?.p8Content)
    return deps.carried.p8Content
  if (progress.p8Path && deps.readFile)
    return deps.readFile(progress.p8Path)
  throw new Error('verifying-key: .p8 content unavailable (no carried bytes and no readable p8Path)')
}
