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
import { DEFAULT_P12_PASSWORD } from '../csr.js'
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

// ─── Engine surface (tail-wired; non-tail steps remain stubs) ───────────────────

/**
 * Build the view-model for a given step. Post-save tail steps delegate to the
 * shared neutral view (adapted back to IosStepView); all other steps return a
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

  return { step, kind: 'auto', title: step }
}

/**
 * Apply a user input to progress. Post-save tail choice/input steps delegate
 * the reducer to the shared neutral module; all other steps return progress
 * unchanged (real per-step mutations land in later batches).
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

  return progress
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

  throw new Error(`runIosEffect: not implemented for step '${step}'`)
}
