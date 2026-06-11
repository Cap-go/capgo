// src/build/onboarding/mcp/engine.ts
import type { AndroidOnboardingProgress, AndroidOnboardingStep } from '../android/types.js'
import type { AndroidEffectDeps, AndroidStepCtx } from '../android/flow.js'
import type { IosEffectDeps, IosStepCtx, IosStepView } from '../ios/flow.js'
import type { OnboardingProgress, OnboardingStep } from '../types.js'
import type { ChoiceOption, NextStepResult, Platform } from './contract.js'
import type { IosCarried, TailParkedState } from './session-state.js'
import type { BuildOutputRecord } from '../../output-record.js'
import type { TailEffectProgress, TailStep, TailStepCtx } from '../tail/flow.js'
import { buildAppIdConflictSuggestions } from '../../../init/app-conflict.js'
import { ONBOARDING_RULES } from './contract.js'
import { explainForState } from './explanations.js'
import { isSafeAppIdForCommand } from './app-id-validation.js'
import { ANDROID_STEP_PROGRESS } from '../android/types.js'
import { STEP_PROGRESS } from '../types.js'
import { getAndroidResumeStep } from '../android/progress.js'
import { getIosResumeStep } from '../ios/progress.js'
import { TAIL_INPUT_KEYS, validateIosStepInput, validateStepInput, validateStorePassword, validateTailStepInput } from './step-input.js'
import { androidViewForStep, applyAndroidInput, applyGoogleSignIn, runAndroidEffect } from '../android/flow.js'
import { applyIosInput, iosViewForStep, runIosEffect } from '../ios/flow.js'
import { applyTailInput, tailViewForStep } from '../tail/flow.js'
import { clearSession, dropIosCarried, getSession, mergeIosCarried, mergeTailCarried, setTailParked } from './session-state.js'
import { slimAndroidTailProgress, slimIosTailProgress } from './tail-progress.js'
import { beginOAuthSession, clearOAuthSession, pollOAuthSession } from './oauth-session.js'
import { SUPPORT_EMAIL } from '../../../support/contact-support.js'

/** Facts gathered during preflight; the pure deciders branch only on these. */
export interface PreflightFacts {
  capacitorProject: boolean
  appId?: string
  platformsDetected: Platform[]
  authenticated: boolean
  appRegistered: boolean
  androidProgress: AndroidOnboardingProgress | null
  iosProgress: OnboardingProgress | null
}

const ROADMAP: string[] = [
  'Preflight — detect your project & account',
  'Register the app in Capgo',
  'Set up signing credentials',
  'Run your first cloud build',
]

const NEXT_STEP_TOOL = 'capgo_builder_onboarding_next_step'

/** User input carried into the flow via next_step. */
interface OnboardingInput {
  platform?: string
  serviceAccountJsonPath?: string
  runBuild?: boolean
  checkBuild?: boolean
  keyId?: string
  issuerId?: string
  p8Path?: string
  serviceAccountMethod?: 'generate' | 'existing'
  playDeveloperId?: string
  gcpProjectId?: string
  gcpProjectName?: string
  androidPackage?: string
  saMethodChoice?: 'retry' | 'save-anyway' | 'oauth'
  credentialsExistChoice?: 'backup' | 'cancel'
  keystoreMethod?: 'existing' | 'generate'
  keystorePath?: string
  keystoreStorePassword?: string
  keystoreAlias?: string
  keystoreKeyPassword?: string
  keystoreNewAlias?: string
  keystorePasswordMethod?: 'random' | 'manual'
  keystoreCommonName?: string
  /** Answer to the parked iOS verify-app gate (the TUI Select vocabulary). */
  verifyAction?: 'pick' | 'create-new' | 'autofix' | 'continue' | 'recheck' | 'open' | 'reopen' | 'back' | 'cancel'
  /** The picked App Store app's bundle id — only with verifyAction 'pick'. */
  verifyAppId?: string
  /**
   * Answer to the parked iOS cert-limit-prompt (S6b): the Apple resource id of
   * the Distribution certificate to revoke, or '__exit__' (the engine's
   * OPTION_CERT_LIMIT_EXIT sentinel) to stop.
   */
  certToRevoke?: string
  /** Answer to the parked iOS duplicate-profile-prompt (S6b). */
  duplicateProfileAction?: 'delete' | 'exit'
  /**
   * Answer to the parked iOS error recovery screen (S6b): 'retry' re-runs the
   * failing step (carried.retryStep), 'restart' wipes progress + session and
   * starts over, 'exit' stops, 'email-support' surfaces support instructions
   * (MCP-only arm — no host-side opens).
   */
  errorAction?: 'retry' | 'restart' | 'exit' | 'email-support'
  // ── Post-build tail answers (S9-S11) — one field per step family ───────────
  // The per-step value vocabulary + one-answer-per-call is enforced by the
  // strict tail gate (validateTailStepInput) against the parked/resume step.
  /** Answer to the CI-secrets choice steps (target-select / ask / overwrite / push-confirm / setup / failed). */
  ciSecretAction?: 'github' | 'gitlab' | 'skip' | 'yes' | 'no' | 'replace' | 'retry' | 'continue' | 'confirm' | 'cancel'
  /** Answer to ask-github-actions-setup ('no' maps to the persisted setupMode 'declined'). */
  githubActionsSetup?: 'with-workflow' | 'secrets-only' | 'no'
  /** Answer to ask-export-env (yes/no) and confirm-env-export-overwrite (replace/skip). */
  exportEnvAction?: 'yes' | 'no' | 'replace' | 'skip'
  /** Custom .env target path — only together with exportEnvAction 'yes'. */
  envExportPath?: string
  /** Answer to pick-package-manager. */
  packageManager?: 'bun' | 'npm' | 'pnpm' | 'yarn'
  /** Answer to pick-build-script: a script name, '__custom__', or '__skip__'. */
  buildScript?: string
  /** Answer to pick-build-script-custom: the exact custom build command. */
  buildScriptCustom?: string
  /** Answer to preview-workflow-file: write / view (returns the file text, re-asks) / cancel. */
  workflowFileAction?: 'write' | 'view' | 'cancel'
  // ── iOS import-existing fork answers (S12) — one field per step ─────────────
  // The per-step vocabulary + one-answer-per-call is enforced by the strict iOS
  // gate (validateIosStepInput) against the effective (parked/resume) step.
  /** Answer to the iOS setup-method fork: create fresh credentials via Apple, or import from this Mac's Keychain. */
  setupMethod?: 'create-new' | 'import-existing'
  /** Answer to import-distribution-mode ('__cancel__' switches to the create-new path). */
  importDistribution?: 'app_store' | 'ad_hoc' | '__cancel__'
  /** Answer to import-pick-identity: the chosen identity's SHA-1 (an option value), or '__cancel__' for create-new. */
  identityChoice?: string
  /** Answer to import-pick-profile: the chosen profile's UUID (an option value), or '__back__' to re-pick the identity. */
  profileChoice?: string
  /** Answer to the import-no-match-recovery hub. */
  importRecoveryAction?: 'create' | 'provide-profile-path' | 'browser' | 'back'
  /** Answer to import-portal-explanation (the manual Apple-portal walkthrough). */
  portalAction?: 'use-create' | 'open-anyway' | 'use-file' | 'back'
  /** Absolute path to a .mobileprovision file — answers import-provide-profile-path (the MCP's manual-path arm of the TUI's native picker). */
  profilePath?: string
  /** Answer to import-export-warning: 'go' exports from the Keychain (the one macOS permission dialog), 'back' re-picks the profile, 'exit' stops. */
  exportConfirm?: 'go' | 'back' | 'exit'
}

// decideStart

/** Decide the first/again step for a fresh or resumed session. */
export async function decideStart(
  facts: PreflightFacts,
  progress: OnboardingProgress | null,
  deps: EngineDeps,
): Promise<NextStepResult> {
  if (!facts.capacitorProject || !facts.appId) {
    return {
      onboarding: 'capgo-builder',
      phase: 'preflight',
      state: 'no-capacitor-project',
      progress: 0,
      kind: 'error',
      summary: 'This does not look like a Capacitor project (no capacitor.config with an app id). Run onboarding from your app directory.',
      rules: ONBOARDING_RULES,
    }
  }

  if (!facts.authenticated) {
    return {
      onboarding: 'capgo-builder',
      phase: 'preflight',
      state: 'login-required',
      progress: 5,
      kind: 'human_gate',
      summary: `Found your app "${facts.appId}". First, connect your Capgo account.`,
      roadmap: ROADMAP,
      context: { appId: facts.appId, platformsDetected: facts.platformsDetected },
      human: {
        instruction: 'Get an API key at app.capgo.io — Account — API keys, then run `npx @capgo/cli login` in your terminal so it is stored locally. Do not paste the key into this chat.',
      },
      next: {
        tool: NEXT_STEP_TOOL,
        instruction: 'After the user has run `capgo login`, call next_step again (no arguments) to continue.',
        call: `${NEXT_STEP_TOOL}({})`,
      },
      rules: ONBOARDING_RULES,
    }
  }

  // App phase: ensure the app is registered in Capgo Cloud before signing.
  if (!facts.appRegistered) {
    return {
      onboarding: 'capgo-builder',
      phase: 'app',
      state: 'registering-app',
      progress: 8,
      kind: 'auto',
      summary: `Registering "${facts.appId}" in Capgo Cloud...`,
      context: { appId: facts.appId },
      rules: ONBOARDING_RULES,
    }
  }

  // Resume an in-flight platform credential flow so credential-submission calls
  // that omit `platform` are not bounced back to platform selection.
  const active = activePlatform(facts)
  if (active === 'android')
    return decideAndroid(facts, deps)
  if (active === 'ios')
    return decideIos(facts, deps)

  // Single android platform with no in-flight progress → auto-route to android.
  if (facts.platformsDetected.length === 1 && facts.platformsDetected[0] === 'android')
    return decideAndroid(facts, deps)

  return decidePlatform(facts, progress, deps)
}

/** Which platform's credential flow is already in progress (if any). */
function activePlatform(facts: PreflightFacts): Platform | null {
  // completedSteps.credentialsSaved: the S8 SLIM tail progress (markers +
  // non-secret prefs only) carries none of the credential-phase fields, so the
  // marker itself is what keeps the post-save tail resumable — a plain
  // next_step({}) after the save must NOT bounce to platform-select.
  const a = facts.androidProgress
  if (a && (a.activePlatform === 'android' || Boolean(a.completedSteps?.keystoreReady) || Boolean(a.serviceAccountForkSeen) || Boolean(a.completedSteps?.credentialsSaved)))
    return 'android'
  const i = facts.iosProgress
  // setupMethod: the S12 import fork persists it as the FIRST iOS write (before
  // any .p8 field exists), so a fork-only progress must already count as an
  // in-flight iOS flow — a follow-up next_step({}) may not bounce to platform-select.
  if (i && (Boolean(i.setupMethod) || Boolean(i.keyId) || Boolean(i.p8Path) || Boolean(i.completedSteps?.apiKeyVerified) || Boolean(i.completedSteps?.credentialsSaved)))
    return 'ios'
  return null
}

async function decidePlatform(facts: PreflightFacts, _progress: OnboardingProgress | null, deps: EngineDeps): Promise<NextStepResult> {
  const platforms = facts.platformsDetected

  if (platforms.length === 0) {
    return {
      onboarding: 'capgo-builder',
      phase: 'preflight',
      state: 'no-platform',
      progress: 5,
      kind: 'human_gate',
      summary: 'No native platform folder found (ios/ or android/).',
      human: {
        instruction: 'Add a native platform first (run `npx cap add ios` or `npx cap add android`), then continue.',
      },
      next: {
        tool: NEXT_STEP_TOOL,
        instruction: 'After the user has added a native platform, call next_step (no arguments).',
        call: `${NEXT_STEP_TOOL}({})`,
      },
      rules: ONBOARDING_RULES,
    }
  }

  if (platforms.length === 1) {
    // Single-platform (ios only): auto-route to ios. Single android is handled
    // via decideAndroid in the async path (activePlatform or platform selection).
    return decideIos(facts, deps)
  }

  return {
    onboarding: 'capgo-builder',
    phase: 'preflight',
    state: 'platform-select',
    progress: 5,
    kind: 'choice',
    summary: `Found your app "${facts.appId}". Which platform do you want to set up first?`,
    roadmap: ROADMAP,
    context: { appId: facts.appId, appRegistered: facts.appRegistered },
    options: [
      { value: 'ios', label: 'iOS', note: 'you will create an App Store Connect API key' },
      { value: 'android', label: 'Android', note: 'mostly automatic; one Google sign-in' },
    ],
    next: {
      tool: NEXT_STEP_TOOL,
      with: { platform: '<ios|android>' },
      instruction: 'Ask the user which platform, then call next_step with their choice.',
      call: `${NEXT_STEP_TOOL}({ platform: "ios" })`,
    },
    rules: ONBOARDING_RULES,
  }
}

// ─── iOS (granular shared-engine path, S6a) ───────────────────────────────────
//
// decideIos is a thin driver over the SHARED iOS flow engine (ios/flow.ts),
// mirroring decideAndroid: state = getIosResumeStep(progress); auto steps run
// via runIosEffect inside the bounded loop (the same non-progress guard);
// choice/gate steps render via mapIosView. iOS engine step ids become the MCP
// state names VERBATIM — with one exception: the TUI-only .p8 input chain
// (api-key-instructions / p8-method-select / input-p8-path / input-key-id /
// input-issuer-id, plus welcome and the setup-method fork) renders as the
// SINGLE 'ios-api-key' human gate (the e2e tree pins that state name). The
// gate collects all three fields in one call; on receipt drive() applies them
// sequentially through applyIosInput so progress persists identically to the
// TUI (see persistIosApiKeyInput).
//
// Carried transients (certData / profileData / teamId / p8Content / the
// verify-app gate fields ...) live in the process-local session registry
// (session-state.ts): threaded into every effect as deps.carried and merged
// back from every IosEffectResult.transient — the headless mirror of the TUI's
// iosCarriedRef. A server restart loses them; the flow engine self-heals from
// persisted progress (resolveP8Content re-reads the .p8 from p8Path; the
// cert/profile markers rebuild the credential map), so nothing here may crash
// on a missing carried field. Secrets in carried (p8 bytes, p12 base64,
// passwords) must NEVER serialize into a NextStepResult — mapIosView builds
// results exclusively from view fields + whitelisted non-secret context.

/** The TUI-only .p8 input chain steps the MCP collapses into one 'ios-api-key' gate. */
const IOS_API_KEY_GATE_STEPS = new Set<OnboardingStep>([
  'welcome',
  'setup-method-select',
  'api-key-instructions',
  'p8-method-select',
  'input-p8-path',
  'input-key-id',
  'input-issuer-id',
])

/** The single ios-api-key human gate (collects keyId + issuerId + p8Path in one call). */
function iosApiKeyGateResult(facts: PreflightFacts): NextStepResult {
  return {
    onboarding: 'capgo-builder',
    phase: 'credentials',
    state: 'ios-api-key',
    platform: 'ios',
    progress: 25,
    kind: 'human_gate',
    summary: `Set up iOS signing for "${facts.appId}". I need an App Store Connect API key.`,
    human: {
      instruction: 'In App Store Connect go to Users and Access, Integrations, App Store Connect API, create a key with App Manager access and download the .p8 (you can only download it once). Then give me the Key ID, the Issuer ID, and the path to the .p8 file. The .p8 stays on your machine — do not paste its contents here.',
    },
    collect: [
      { field: 'keyId', desc: 'the Key ID shown next to the key' },
      { field: 'issuerId', desc: 'the Issuer ID at the top of the Keys page' },
      { field: 'p8Path', desc: 'absolute path to the downloaded .p8 file' },
    ],
    next: {
      tool: NEXT_STEP_TOOL,
      with: { keyId: '<keyId>', issuerId: '<issuerId>', p8Path: '<path>' },
      instruction: 'Collect all three from the user, then call next_step with keyId, issuerId, and p8Path.',
      call: `${NEXT_STEP_TOOL}({ keyId: "ABC123", issuerId: "1a2b-...", p8Path: "/path/to/AuthKey.p8" })`,
    },
    rules: ONBOARDING_RULES,
  }
}

// ─── iOS import-existing fork (S12) ─────────────────────────────────────────────
//
// The TUI's import sub-flow (ios/flow.ts BATCH 5-7b) driven headless: the
// persisted forks (setup-method-select / import-distribution-mode) ride the
// SAME pure reducers the TUI uses (applyIosInput via persistIosImportForkInput);
// the EPHEMERAL prompts (pickers / recovery hub / portal walkthrough / export
// warning / manual profile path) park in the session registry between tool
// calls (carried.parkedImportStep — the headless mirror of the TUI's React
// `step` state) and re-drive as ONE-SHOT resolver effects, exactly the
// cert-limit/verify-app mechanism above. A server restart loses the park + the
// inventory; the flow self-heals via a fresh import-scanning (the audit's
// resume contract — pickers are NEVER resume targets).

/** The interactive import prompts the MCP parks between tool calls. */
const IOS_IMPORT_PARK_STEPS = new Set<OnboardingStep>([
  'import-pick-identity',
  'import-pick-profile',
  'import-no-match-recovery',
  'import-portal-explanation',
  'import-export-warning',
])

/**
 * Steps that need the carried import-scanning inventory before they can render
 * or route. Entering one without `carried.importMatches` (fresh entry / server
 * restart) re-runs the silent scan first — it routes back via
 * getImportEntryStep, mirroring BOTH the TUI's scan-before-questions order and
 * its crash-recovery resume.
 */
const IOS_IMPORT_INVENTORY_STEPS = new Set<OnboardingStep>([
  'import-distribution-mode',
  'import-pick-identity',
  'import-pick-profile',
])

/**
 * Whether the driver declares the import-existing capability: isMacOS() ===
 * true AND the Keychain scan dep is wired (a fork without
 * listSigningIdentities could never complete). Off-macOS — or for drivers
 * that don't wire the import deps (legacy fakes, the scenario e2e world) —
 * the fork stays hidden and the chain keeps rendering as the single
 * ios-api-key gate (the S6a forced create-new behavior).
 */
function iosImportCapable(ios?: IosEffectDeps): boolean {
  return ios?.isMacOS?.() === true && typeof ios?.listSigningIdentities === 'function'
}

/**
 * Map a .p8-chain gate step to the setup-method fork while the fork is still
 * undecided AND the driver is import-capable. A legacy mid-chain progress
 * (p8Path persisted, no setupMethod) is never re-asked. NOTE: when the step
 * is ALREADY 'setup-method-select' (backing-up routes there on macOS) but the
 * capability is absent, the step is returned UNCHANGED — callers must branch
 * on iosImportCapable, not on the returned name (the gate-set membership is
 * what collapses it back to the ios-api-key gate).
 */
function iosSetupForkStep(step: OnboardingStep, progress: OnboardingProgress | null, ios?: IosEffectDeps): OnboardingStep {
  if (
    IOS_API_KEY_GATE_STEPS.has(step)
    && !progress?.setupMethod
    && !progress?.p8Path
    && iosImportCapable(ios)
  ) {
    return 'setup-method-select'
  }
  return step
}

/**
 * The S12 setup-method fork — the FIRST iOS choice on a fresh macOS entry.
 * Option values are the PERSISTED setupMethod vocabulary (the TUI Select's
 * 'create'/'import' map onto these via applyIosInput in
 * persistIosImportForkInput, so progress.json stays byte-identical to a TUI run).
 */
function iosSetupMethodResult(facts: PreflightFacts): NextStepResult {
  return {
    onboarding: 'capgo-builder',
    phase: 'credentials',
    state: 'setup-method-select',
    platform: 'ios',
    progress: STEP_PROGRESS['setup-method-select'] ?? 20,
    kind: 'choice',
    summary: `How do you want to set up iOS signing credentials for "${facts.appId}"? Create new ones via the App Store Connect API, or import an existing distribution certificate + provisioning profile already on this Mac (Keychain + Xcode profiles).`,
    options: [
      { value: 'create-new', label: '🆕  Create new via App Store Connect API' },
      { value: 'import-existing', label: '📥  Import existing from this Mac (Keychain + Xcode profiles)' },
    ],
    next: {
      tool: NEXT_STEP_TOOL,
      with: { setupMethod: '<create-new|import-existing>' },
      instruction: 'Ask the user. "create-new" mints a fresh certificate + profile via Apple (needs an App Store Connect API key); "import-existing" reuses a signing identity already in this Mac\'s Keychain. Then call next_step with setupMethod set to their pick.',
      call: `${NEXT_STEP_TOOL}({ setupMethod: "create-new" })`,
    },
    rules: ONBOARDING_RULES,
  }
}

/**
 * The existing ios-credentials-failed re-collect gate. S6a maps EVERY iOS
 * engine 'error' here (the message carries the failing step's human text);
 * S6b replaces this with structured per-failure recovery.
 */
function iosCredentialsFailedResult(facts: PreflightFacts, message: string): NextStepResult {
  return {
    onboarding: 'capgo-builder',
    phase: 'credentials',
    state: 'ios-credentials-failed',
    platform: 'ios',
    progress: 25,
    kind: 'human_gate',
    summary: `iOS signing setup failed: ${message}`,
    human: { instruction: 'This often means the API key lacks access, the .p8 moved, or Apple\'s certificate limit was hit. Provide corrected Key ID / Issuer ID / .p8 path, then continue.' },
    collect: [
      { field: 'keyId', desc: 'the Key ID' },
      { field: 'issuerId', desc: 'the Issuer ID' },
      { field: 'p8Path', desc: 'absolute path to the .p8 file' },
    ],
    next: {
      tool: NEXT_STEP_TOOL,
      with: { keyId: '<keyId>', issuerId: '<issuerId>', p8Path: '<path>' },
      instruction: 'Collect corrected values from the user, then call next_step with keyId, issuerId, p8Path — or call next_step({}) to retry as-is.',
      call: `${NEXT_STEP_TOOL}({ keyId: "ABC123", issuerId: "1a2b-...", p8Path: "/path/to/AuthKey.p8" })`,
    },
    rules: ONBOARDING_RULES,
  }
}

/**
 * The iOS data-safety gate (a TUI run parked `_credentialsExistGate: 'pending'`).
 * Mirrors the android credentials-exist choice — answered via credentialsExistChoice.
 */
function iosCredentialsExistResult(facts: PreflightFacts): NextStepResult {
  return {
    onboarding: 'capgo-builder',
    phase: 'credentials',
    state: 'credentials-exist',
    platform: 'ios',
    progress: STEP_PROGRESS['credentials-exist'],
    kind: 'choice',
    summary: `iOS credentials already exist for "${facts.appId}". Continuing onboarding will create new credentials and replace the existing ones. Back them up first, or stop?`,
    options: [
      { value: 'backup', label: 'Start fresh (backup existing credentials first)' },
      { value: 'cancel', label: 'Stop — keep my existing credentials' },
    ],
    next: {
      tool: NEXT_STEP_TOOL,
      with: { credentialsExistChoice: '<backup|cancel>' },
      instruction: 'Tell the user their existing iOS credentials will be replaced. Ask whether to back them up first and continue, or stop. Then call next_step with credentialsExistChoice.',
      call: `${NEXT_STEP_TOOL}({ credentialsExistChoice: "backup" })`,
    },
    rules: ONBOARDING_RULES,
  }
}

/** A thrown (non-engine-routed) iOS effect failure → the same re-collect gate. */
function iosEffectError(step: OnboardingStep, err: unknown, facts: PreflightFacts): NextStepResult {
  const message = err instanceof Error ? err.message : String(err)
  return iosCredentialsFailedResult(facts, `at step "${step}": ${message}`)
}

/**
 * Map an interactive IosStepView into a NextStepResult — the iOS mirror of
 * mapAndroidView. State names reuse the engine step ids; option values mirror
 * the TUI Select values. Only NON-SECRET, view-derived data may appear here.
 */
export function mapIosView(
  view: IosStepView,
  facts: PreflightFacts,
  ctx?: IosStepCtx,
): NextStepResult {
  const base = {
    onboarding: 'capgo-builder' as const,
    phase: 'credentials' as const,
    platform: 'ios' as const,
    state: view.step,
    progress: STEP_PROGRESS[view.step] ?? 45,
    rules: ONBOARDING_RULES,
  }

  switch (view.step) {
    // ── verify-app (the parked App Store verification gate, PR #2397) ────────
    // Three variants, mirroring iosViewForStep: the PICKER (option values are
    // app bundle ids + the '__create_new__' escape — answered via
    // verifyAction 'pick' + verifyAppId, or verifyAction 'create-new'), and
    // the Path-A / Path-B gates (option values ARE verifyAction members).
    case 'verify-app': {
      const releaseId = ctx?.verifyReleaseBundleId ?? ''
      const options = (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note }))
      const isPicker = !ctx?.verifyPath
      const isCreateApp = ctx?.verifyPath === 'create-app'
      const createAppUrl = 'https://appstoreconnect.apple.com/apps'
      const title = view.title ?? `Verifying the App Store app for ${releaseId}.`
      return {
        ...base,
        kind: 'choice',
        summary: isPicker
          ? `${title} Pick the App Store app this project should build for, or create a new one.`
          : title,
        context: {
          ...(releaseId ? { releaseBundleId: releaseId } : {}),
          ...(isCreateApp ? { createAppUrl } : {}),
          ...(ctx?.verifyAttempt ? { attempt: ctx.verifyAttempt } : {}),
        },
        options,
        next: isPicker
          ? {
              tool: NEXT_STEP_TOOL,
              with: { verifyAction: '<pick|create-new>', verifyAppId: '<bundle id when picking>' },
              instruction: 'Present the App Store apps to the user. To build for one of them, call next_step with verifyAction "pick" AND verifyAppId set to that option\'s bundle id. If none match and the build id is correct, call next_step with verifyAction "create-new" (no verifyAppId).',
              call: `${NEXT_STEP_TOOL}({ verifyAction: "pick", verifyAppId: "com.example.app" })`,
            }
          : {
              tool: NEXT_STEP_TOOL,
              with: { verifyAction: `<${options.map(o => o.value).join('|')}>` },
              instruction: isCreateApp
                ? `Tell the user to create the App Store app at ${createAppUrl} (I cannot open a browser for them). Then call next_step with verifyAction — "recheck" once they created it, or another listed action.`
                : 'Present the options to the user, then call next_step with verifyAction set to their pick.',
              call: `${NEXT_STEP_TOOL}({ verifyAction: "${options[0]?.value ?? 'recheck'}" })`,
            },
      }
    }

    // ── cert-limit-prompt (S6b — cert-limit recovery) ────────────────────────
    // Apple's per-team Distribution-cert limit was hit. One option per existing
    // cert (value = its Apple resource id; label carries name + expiry, with
    // the Capgo-created cert flagged) plus the engine's '__exit__' sentinel —
    // answered via certToRevoke. The list itself is the engine view's options
    // (built from ctx.existingCerts), so the MCP never re-derives it.
    case 'cert-limit-prompt': {
      const options = (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note }))
      return {
        ...base,
        kind: 'choice',
        summary: `${view.title ?? 'Apple\'s Distribution-certificate limit was reached.'} Revoking one frees a slot so a new certificate can be created.`,
        options,
        next: {
          tool: NEXT_STEP_TOOL,
          with: { certToRevoke: '<certificate id|__exit__>' },
          instruction: 'Present the certificates to the user (the one created by Capgo is flagged). WARNING: revoking a certificate invalidates anything still signing with it, so let the USER choose. Then call next_step with certToRevoke set to the chosen option\'s value, or "__exit__" to stop.',
          call: `${NEXT_STEP_TOOL}({ certToRevoke: "${options[0]?.value ?? '__exit__'}" })`,
        },
      }
    }

    // ── duplicate-profile-prompt (S6b — duplicate-profile recovery) ──────────
    // Apple already has Capgo provisioning profiles for this bundle id. The
    // options are the engine's static delete|exit pair — answered via
    // duplicateProfileAction. Origin routing (creating-profile vs
    // import-create-profile-only) is the engine's job, keyed off the persisted
    // duplicateProfileOrigin marker.
    case 'duplicate-profile-prompt': {
      const options = (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note }))
      return {
        ...base,
        kind: 'choice',
        summary: `${view.title ?? 'Apple already has Capgo provisioning profile(s) for this app.'} Delete them and create a fresh one, or stop here.`,
        options,
        next: {
          tool: NEXT_STEP_TOOL,
          with: { duplicateProfileAction: '<delete|exit>' },
          instruction: 'Ask the user. To delete the duplicate Capgo profile(s) and recreate a fresh one, call next_step with duplicateProfileAction "delete"; to stop, "exit".',
          call: `${NEXT_STEP_TOOL}({ duplicateProfileAction: "delete" })`,
        },
      }
    }

    // ── error (S6b — the structured recovery screen) ─────────────────────────
    // The engine error view's choices verbatim ('retry' only when a retryStep
    // is carried — exactly the TUI's showRetry gate), plus the MCP-only
    // 'email-support' arm (no host-side opens; instructions only). Corrected
    // ASC key details (keyId/issuerId/p8Path) are ALSO accepted while parked
    // here — the S6a re-collect arm folded into the recovery menu.
    case 'error': {
      const engineOptions = (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note }))
      const options = [
        ...engineOptions,
        { value: 'email-support', label: '📧  Email Capgo support', note: undefined },
      ]
      const hasRetry = engineOptions.some(o => o.value === 'retry')
      return {
        ...base,
        kind: 'choice',
        summary: `iOS setup hit an error: ${view.message ?? 'unknown error.'}`,
        options,
        next: {
          tool: NEXT_STEP_TOOL,
          with: { errorAction: `<${options.map(o => o.value).join('|')}>` },
          instruction: `Show the error to the user and present the recovery options.${hasRetry ? ' "retry" re-runs the failing step.' : ''} "restart" wipes the onboarding progress and starts over; "exit" stops here; "email-support" returns instructions for contacting Capgo support. If the error looks like a wrong API key, you can instead send corrected keyId/issuerId/p8Path directly.`,
          call: `${NEXT_STEP_TOOL}({ errorAction: "${engineOptions[0]?.value ?? 'restart'}" })`,
        },
      }
    }

    // ── import-distribution-mode (S12 — the import sub-flow's first question) ──
    // Persisted fork: the answer rides applyIosInput('import-distribution-mode')
    // (persistIosImportForkInput), so resume == fresh-advance with no re-ask.
    case 'import-distribution-mode': {
      const options = (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note }))
      return {
        ...base,
        kind: 'choice',
        summary: `${view.title ?? 'How will Capgo distribute your build?'} ${view.prompt ?? ''}`.trim(),
        options,
        next: {
          tool: NEXT_STEP_TOOL,
          with: { importDistribution: '<app_store|ad_hoc|__cancel__>' },
          instruction: 'Ask the user how this build will be distributed. "app_store" uploads to TestFlight (needs an App Store Connect API key); "ad_hoc" signs for direct/QR install (no ASC key). Call next_step with importDistribution set to their pick, or "__cancel__" to switch to creating fresh credentials instead.',
          call: `${NEXT_STEP_TOOL}({ importDistribution: "app_store" })`,
        },
      }
    }

    // ── import-pick-identity (S12 — Keychain identity picker, EPHEMERAL) ──────
    // Option values are the identities' SHA-1s (+ the '__cancel__' escape) —
    // answered via identityChoice; the driver resolves the SHA-1 against the
    // carried inventory and re-drives the step as a resolver effect.
    case 'import-pick-identity': {
      const options = (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note }))
      return {
        ...base,
        kind: 'choice',
        summary: `${view.title ?? 'Pick a signing identity to import.'} ${view.prompt ?? ''}`.trim(),
        options,
        next: {
          tool: NEXT_STEP_TOOL,
          with: { identityChoice: '<identity SHA-1|__cancel__>' },
          instruction: 'Present the Keychain signing identities to the user (each option label names the certificate and how many of its profiles match this app). Call next_step with identityChoice set to the chosen option\'s value (the identity SHA-1), or "__cancel__" to switch to creating a fresh certificate instead.',
          call: `${NEXT_STEP_TOOL}({ identityChoice: "${options[0]?.value ?? '__cancel__'}" })`,
        },
      }
    }

    // ── import-pick-profile (S12 — provisioning-profile picker, EPHEMERAL) ────
    // Option values are the profile UUIDs (+ the '__back__' escape) — answered
    // via profileChoice.
    case 'import-pick-profile': {
      const options = (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note }))
      return {
        ...base,
        kind: 'choice',
        summary: `${view.title ?? 'Pick a provisioning profile to import.'} ${view.prompt ?? ''}`.trim(),
        options,
        next: {
          tool: NEXT_STEP_TOOL,
          with: { profileChoice: '<profile UUID|__back__>' },
          instruction: 'Present the matching provisioning profiles to the user. Call next_step with profileChoice set to the chosen option\'s value (the profile UUID), or "__back__" to return to identity selection.',
          call: `${NEXT_STEP_TOOL}({ profileChoice: "${options[0]?.value ?? '__back__'}" })`,
        },
      }
    }

    // ── import-no-match-recovery (S12 — the recovery hub, EPHEMERAL) ──────────
    // The menu VARIANT (title sentence + which rows show) is the engine view's
    // job (noMatchReason / distribution / ASC-key state); the MCP surfaces it
    // verbatim — answered via importRecoveryAction.
    case 'import-no-match-recovery': {
      const options = (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note }))
      return {
        ...base,
        kind: 'choice',
        summary: `${view.title ?? 'No usable provisioning profile matches this identity.'} ${view.prompt ?? ''}`.trim(),
        options,
        next: {
          tool: NEXT_STEP_TOOL,
          with: { importRecoveryAction: `<${options.map(o => o.value).join('|')}>` },
          instruction: 'Present the recovery options to the user. "create" makes a fresh App Store profile for this certificate via Apple; "provide-profile-path" lets the user supply a .mobileprovision file path; "browser" explains the manual Apple Developer Portal route; "back" returns to identity selection. Call next_step with importRecoveryAction set to their pick.',
          call: `${NEXT_STEP_TOOL}({ importRecoveryAction: "${options[0]?.value ?? 'back'}" })`,
        },
      }
    }

    // ── import-portal-explanation (S12 — manual-portal walkthrough, EPHEMERAL) ─
    // HEADLESS: the MCP never opens a browser — 'open-anyway' logs a breadcrumb
    // engine-side and bounces back to the recovery menu; the agent gives the
    // user the portal URL from context instead.
    case 'import-portal-explanation': {
      const options = (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note }))
      const portalUrl = 'https://developer.apple.com/account/resources/profiles/list'
      return {
        ...base,
        kind: 'choice',
        summary: `${view.title ?? 'You can create the profile manually in the Apple Developer Portal.'} ${view.prompt ?? ''}`.trim(),
        context: { portalUrl },
        options,
        next: {
          tool: NEXT_STEP_TOOL,
          with: { portalAction: `<${options.map(o => o.value).join('|')}>` },
          instruction: `Present the options to the user. I cannot open a browser for them — if they want the manual route, give them the portal URL (${portalUrl}); once they have downloaded a .mobileprovision, "use-file" lets them provide its path. "use-create" (when offered) creates the profile automatically instead — recommended. "open-anyway"/"back" return to the recovery menu. Call next_step with portalAction set to their pick.`,
          call: `${NEXT_STEP_TOOL}({ portalAction: "${options[0]?.value ?? 'back'}" })`,
        },
      }
    }

    // ── import-provide-profile-path (S12 — the manual-path arm, INPUT) ────────
    // The TUI opens a native .mobileprovision picker; the headless MCP collects
    // the path as text (decideIos synthesizes this input view) and re-drives the
    // engine effect with a one-shot picker resolving the provided path.
    case 'import-provide-profile-path': {
      return {
        ...base,
        kind: 'human_gate',
        summary: view.title ?? 'Use a .mobileprovision file from disk.',
        human: {
          instruction: 'Locate (or download from the Apple Developer Portal) the .mobileprovision profile for this app, then give me its absolute path. The file stays on your machine.',
        },
        collect: [
          { field: 'profilePath', desc: 'absolute path to the .mobileprovision file' },
        ],
        next: {
          tool: NEXT_STEP_TOOL,
          with: { profilePath: '<path>' },
          instruction: 'Ask the user for the absolute path to their .mobileprovision file, then call next_step with profilePath.',
          call: `${NEXT_STEP_TOOL}({ profilePath: "/path/to/profile.mobileprovision" })`,
        },
      }
    }

    // ── import-export-warning (S12 — the Keychain-dialog heads-up, EPHEMERAL) ──
    // 'go' runs the export INSIDE the next tool call, which BLOCKS on the single
    // macOS Keychain permission dialog — the instruction makes the agent warn
    // the user to expect + approve it BEFORE confirming (the accepted design).
    case 'import-export-warning': {
      const options = (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note }))
      return {
        ...base,
        kind: 'choice',
        summary: `${view.title ?? 'macOS will now ask permission to access your private key.'} ${view.prompt ?? ''}`.trim(),
        options,
        next: {
          tool: NEXT_STEP_TOOL,
          with: { exportConfirm: '<go|back|exit>' },
          instruction: 'IMPORTANT — tell the USER first: confirming with "go" exports the certificate from the macOS Keychain during the next call, and macOS will pop up a Keychain permission dialog on their Mac. They should click "Always Allow" (the call waits until they answer; "Always Allow" prevents re-prompts on retries). Once they are ready, call next_step with exportConfirm "go". "back" returns to profile selection; "exit" stops onboarding.',
          call: `${NEXT_STEP_TOOL}({ exportConfirm: "go" })`,
        },
      }
    }

    default: {
      // Generic mapping for views outside the S6a create-new scope (the
      // cert-limit / duplicate-profile recoveries land in S6b as structured
      // states). Mirrors mapAndroidView's default: surface the engine view
      // verbatim and allow a plain re-check.
      if (view.kind === 'choice') {
        return {
          ...base,
          kind: 'choice',
          summary: view.title ?? `iOS setup: ${view.step}`,
          options: (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note })),
          next: {
            tool: NEXT_STEP_TOOL,
            instruction: 'Present the options to the user. Structured answers for this step arrive in a later milestone — call next_step({}) to re-check, or finish this step in the interactive wizard (`npx @capgo/cli build init`).',
            call: `${NEXT_STEP_TOOL}({})`,
          },
        }
      }
      return {
        ...base,
        kind: 'human_gate',
        summary: view.title ?? `iOS setup: ${view.step}`,
        human: { instruction: view.prompt ?? 'Continue when ready.' },
        next: { tool: NEXT_STEP_TOOL, instruction: 'Call next_step to continue.', call: `${NEXT_STEP_TOOL}({})` },
      }
    }
  }
}

/**
 * The session-parked iOS recovery step, if any (S6b). The cert-limit /
 * duplicate-profile prompts and the error screen are NOT resume targets
 * (their state is the TUI's React state — here the per-app session): the
 * presence of their carried markers is what parks them between tool calls.
 * Precedence mirrors causality: an error parked AFTER a recovery prompt
 * (e.g. a failed revoke) must win over the prompt's own marker. A server
 * restart loses the markers and the flow self-heals via a fresh resume —
 * re-deriving the inventory through the failing step, never crashing.
 */
function iosParkedStep(carried: IosCarried): OnboardingStep | null {
  if (carried.error !== undefined)
    return 'error'
  if (carried.existingCerts !== undefined)
    return 'cert-limit-prompt'
  if (carried.duplicateProfiles !== undefined)
    return 'duplicate-profile-prompt'
  // S12: the parked interactive import prompt (pickers / recovery hub / portal
  // walkthrough / export warning / manual profile path). LAST in precedence —
  // an error (or recovery prompt) raised while an import prompt was parked
  // must win, exactly like the TUI's React step moving off the picker.
  if (carried.parkedImportStep !== undefined)
    return carried.parkedImportStep
  return null
}

/**
 * The effective iOS step an incoming answer must address: the session-parked
 * recovery step when one is parked, else the persisted resume step — mapped
 * through the S12 setup-method fork (a fresh macOS entry's effective step is
 * 'setup-method-select', not the collapsed .p8 gate). This is what the strict
 * iOS input gate validates against.
 */
function effectiveIosStep(appId: string, progress: OnboardingProgress | null, ios?: IosEffectDeps): OnboardingStep {
  const step = iosParkedStep(getSession(appId).iosCarried) ?? getIosResumeStep(progress)
  return iosSetupForkStep(step, progress, ios)
}

/**
 * Phase-0 data-safety gate seeding (S7, mirrors the android gate at
 * decideAndroid): when saved iOS credentials already exist for this app AND
 * the user is entering the credential phase fresh (the resume step is still in
 * the .p8-chain entry set) AND the gate has not been evaluated, persist
 * `_credentialsExistGate: 'pending'` so getIosResumeStep parks on
 * 'credentials-exist' BEFORE any Apple traffic — matching the FROZEN TUI
 * journey semantics (ios-resume.journeys.mjs: the gate intercepts before the
 * verify-app/create pipeline). Only fires on a truly fresh entry, so an
 * in-flight onboarding is unaffected. Returns the (possibly updated) progress.
 */
async function seedIosCredentialsExistGate(
  appId: string,
  ios: IosEffectDeps | undefined,
  progress: OnboardingProgress | null,
): Promise<OnboardingProgress | null> {
  if (progress?._credentialsExistGate !== undefined)
    return progress
  if (!IOS_API_KEY_GATE_STEPS.has(getIosResumeStep(progress)))
    return progress
  let hasSavedIos = false
  try {
    const saved = await ios?.loadSavedCredentials?.(appId)
    hasSavedIos = !!(saved && typeof saved === 'object' && (saved as { ios?: unknown }).ios)
  }
  catch {
    // Treat a load failure as "no saved credentials" — never block onboarding
    // on a read error; the worst case is the pre-existing (no-gate) behavior.
    hasSavedIos = false
  }
  if (!hasSavedIos)
    return progress
  const seeded: OnboardingProgress = {
    ...(progress ?? { platform: 'ios', appId, startedAt: new Date().toISOString(), completedSteps: {} }),
    _credentialsExistGate: 'pending',
  }
  await ios?.saveProgress?.(appId, seeded)
  return seeded
}

/**
 * The 'email-support' arm of the parked error screen (S6b, MCP-only). NO
 * host-side opens — the MCP server never launches a mail client or browser;
 * it surfaces the support address + what to include and leaves the error
 * parked so the user can still retry/restart/exit afterwards.
 */
function iosEmailSupportResult(facts: PreflightFacts, message?: string): NextStepResult {
  return {
    onboarding: 'capgo-builder',
    phase: 'credentials',
    state: 'error',
    platform: 'ios',
    progress: STEP_PROGRESS.error ?? 45,
    kind: 'human_gate',
    summary: `To get help from Capgo support, email ${SUPPORT_EMAIL}.${message ? ` Include the error: "${message}"` : ''}`,
    human: {
      instruction: `Email ${SUPPORT_EMAIL} describing what you were doing (iOS build onboarding for "${facts.appId}") and paste the error message shown above. I cannot open your mail app from here. Running \`npx @capgo/cli@latest doctor\` and attaching its output speeds up support.`,
    },
    context: { supportEmail: SUPPORT_EMAIL },
    next: {
      tool: NEXT_STEP_TOOL,
      with: { errorAction: '<retry|restart|exit>' },
      instruction: 'After the user has emailed support (or decided not to), call next_step with errorAction: "retry" to re-run the failing step, "restart" to start onboarding over, or "exit" to stop.',
      call: `${NEXT_STEP_TOOL}({ errorAction: "retry" })`,
    },
    rules: ONBOARDING_RULES,
  }
}

/** The 'exit' arm of the parked error screen — a clean stop, progress kept. */
function iosErrorExitResult(facts: PreflightFacts, message?: string): NextStepResult {
  return {
    onboarding: 'capgo-builder',
    phase: 'credentials',
    state: 'error',
    platform: 'ios',
    progress: STEP_PROGRESS.error ?? 45,
    kind: 'done',
    summary: `Stopped iOS onboarding after an error${message ? ` ("${message}")` : ''}. Nothing else was changed — your saved progress is kept, so running onboarding again resumes from the failing step.`,
    rules: ONBOARDING_RULES,
  }
}

export async function decideIos(
  facts: PreflightFacts,
  deps: EngineDeps,
  opts?: {
    verifyAction?: OnboardingInput['verifyAction']
    verifyAppId?: string
    certToRevoke?: string
    duplicateProfileAction?: 'delete' | 'exit'
    errorAction?: 'retry' | 'restart' | 'exit' | 'email-support'
    // ── S12: iOS import-existing fork answers (ephemeral resolver picks) ──────
    /** import-pick-identity answer: an identity SHA-1 or '__cancel__'. */
    identityChoice?: string
    /** import-pick-profile answer: a profile UUID or '__back__'. */
    profileChoice?: string
    /** import-no-match-recovery answer. */
    importRecoveryAction?: 'create' | 'provide-profile-path' | 'browser' | 'back'
    /** import-portal-explanation answer. */
    portalAction?: 'use-create' | 'open-anyway' | 'use-file' | 'back'
    /** import-provide-profile-path answer: the .mobileprovision path. */
    profilePath?: string
    /** import-export-warning answer. */
    exportConfirm?: 'go' | 'back' | 'exit'
    /**
     * S9-S11: the explicit tail step a validated tail answer routed to
     * (drive() → applyMcpTailAnswer). Honored only while the slim tail
     * progress carries credentialsSaved — the same guard as the tail park.
     */
    tailNext?: OnboardingStep
  },
): Promise<NextStepResult> {
  const appId = facts.appId!
  const ios: IosEffectDeps = deps.iosEffectDeps ?? {}

  // Seed empty progress on first entry (mirrors decideAndroid's seeding): the
  // resume resolver then lands on the .p8 chain entry, not the TUI-only
  // 'welcome'. NOT persisted — the first persist happens when the gate's
  // three fields arrive (persistIosApiKeyInput).
  let progress: OnboardingProgress = facts.iosProgress ?? {
    platform: 'ios',
    appId,
    startedAt: new Date().toISOString(),
    completedSteps: {},
  }

  // ── Parked error screen actions (S6b) — validated by the strict gate ───────
  // (errorAction only reaches here while the session is parked on 'error').
  // 'retry' re-drives the engine's error RESOLVER (carried.retryStep routing);
  // the other arms are DRIVER-owned, mirroring the TUI: restart =
  // resetForFreshStart (wipe progress + session), exit = leave onboarding,
  // email-support = surface instructions (no host-side opens, stays parked).
  let errorRetry = false
  if (opts?.errorAction) {
    const carriedNow = getSession(appId).iosCarried
    const errorMessage = carriedNow.error
    if (opts.errorAction === 'email-support')
      return iosEmailSupportResult(facts, errorMessage)
    if (opts.errorAction === 'exit') {
      dropIosCarried(appId, ['error', 'retryStep', 'errorAction'])
      return iosErrorExitResult(facts, errorMessage)
    }
    if (opts.errorAction === 'retry') {
      if (!carriedNow.retryStep) {
        // No retry was offered (unrecoverable / user-initiated exit sink) —
        // the engine resolver would self-loop; treat as the exit arm.
        dropIosCarried(appId, ['error', 'retryStep', 'errorAction'])
        return iosErrorExitResult(facts, errorMessage)
      }
      mergeIosCarried(appId, { errorAction: 'retry' })
      errorRetry = true
    }
    if (opts.errorAction === 'restart') {
      // Wipe progress + session, back to the very start (the TUI's
      // resetForFreshStart + setStep('welcome')). The data-safety gate below
      // re-evaluates against the fresh progress, so saved credentials are
      // re-protected before any new Apple traffic.
      try {
        await ios.deleteProgress?.(appId)
      }
      catch {
        // Best-effort: a failed delete leaves the old progress; the resume
        // routing then simply continues from it instead of restarting.
      }
      clearSession(appId)
      progress = { platform: 'ios', appId, startedAt: new Date().toISOString(), completedSteps: {} }
    }
  }

  // ── Phase-0 data-safety gate (S7) ──────────────────────────────────────────
  progress = (await seedIosCredentialsExistGate(appId, ios, progress)) ?? progress

  // 'cancel' on the data-safety gate is a hard stop (mirrors the android gate):
  // the user declined to back up their existing iOS credentials.
  if (progress._credentialsExistGate === 'cancel') {
    return {
      onboarding: 'capgo-builder', phase: 'credentials', state: 'credentials-exist', platform: 'ios',
      progress: STEP_PROGRESS['credentials-exist'], kind: 'done',
      summary: `Onboarding stopped to protect the existing iOS credentials for "${appId}". Nothing was changed. Re-run onboarding and choose "Start fresh (backup existing credentials first)" when you're ready to replace them.`,
      rules: ONBOARDING_RULES,
    }
  }

  // Record the user's verify-app gate pick into the session BEFORE driving, so
  // the parked step re-runs as a RESOLVER effect (the same carried-driven
  // mechanism the TUI uses). 'pick' also resolves verifyAppId → the chosen
  // AscApp against the carried picker inventory; an unknown id resolves to
  // null and the resolver simply re-parks the picker.
  if (opts?.verifyAction) {
    const carriedNow = getSession(appId).iosCarried
    const chosen = opts.verifyAction === 'pick'
      ? ((carriedNow.verifyApps ?? []).find(a => a.bundleId === opts.verifyAppId) ?? null)
      : undefined
    mergeIosCarried(appId, {
      verifyAction: opts.verifyAction,
      ...(chosen !== undefined ? { verifyChosenApp: chosen } : {}),
    })
  }

  // ── Parked cert-limit-prompt answer (S6b) ──────────────────────────────────
  // Resolve the picked option value (a cert's Apple resource id) against the
  // carried inventory into carried.certToRevoke — the engine resolver then
  // routes pick → revoking-certificate / no-pick ('__exit__') → the error
  // sink, mirroring app.tsx:3917-3926. An unknown id re-renders the prompt
  // with a correction and applies NOTHING.
  let certLimitAnswered = false
  if (opts?.certToRevoke !== undefined) {
    const carriedNow = getSession(appId).iosCarried
    if (opts.certToRevoke === '__exit__') {
      // The engine resolver reads "no carried certToRevoke" as the exit pick.
      dropIosCarried(appId, ['certToRevoke'])
      certLimitAnswered = true
    }
    else {
      const chosenCert = (carriedNow.existingCerts ?? []).find(c => c.id === opts.certToRevoke)
      if (!chosenCert) {
        const ctx: IosStepCtx = { appId, ...(carriedNow as Partial<IosStepCtx>) }
        const rerender = mapIosView(iosViewForStep('cert-limit-prompt', progress, ctx), facts, ctx)
        return { ...rerender, summary: `Unknown certificate id "${opts.certToRevoke}" — call next_step with certToRevoke set to one of the listed option values, or "__exit__".\n\n${rerender.summary}` }
      }
      mergeIosCarried(appId, { certToRevoke: chosenCert })
      certLimitAnswered = true
    }
  }

  // ── Parked duplicate-profile-prompt answer (S6b) ───────────────────────────
  // 'delete' → carried.confirmDeleteDuplicates=true → the resolver routes to
  // deleting-duplicate-profiles (then back to the persisted
  // duplicateProfileOrigin); 'exit' → no confirm → the error sink. Mirrors
  // app.tsx:3941-3949.
  let dupAnswered = false
  if (opts?.duplicateProfileAction) {
    if (opts.duplicateProfileAction === 'delete')
      mergeIosCarried(appId, { confirmDeleteDuplicates: true })
    else
      dropIosCarried(appId, ['confirmDeleteDuplicates'])
    dupAnswered = true
  }

  // ── Parked import sub-flow answers (S12) — validated by the strict gate ────
  // Each ephemeral pick is recorded into the session (the MCP mirror of the
  // TUI's React state) and the parked prompt re-driven as a ONE-SHOT resolver
  // effect — the same mechanism as cert-limit / verify-app above. The PERSISTED
  // forks (setupMethod / importDistribution) never reach here: drive() applies
  // them through the pure reducers (persistIosImportForkInput) and the resume
  // routing takes over.
  let importAnswered: OnboardingStep | undefined
  let profilePathAnswer: string | undefined

  if (opts?.identityChoice !== undefined) {
    const carriedNow = getSession(appId).iosCarried
    if (opts.identityChoice === '__cancel__') {
      // The user bailed to create-new. The DRIVER owns the persistence (switch
      // setupMethod, drop the stale importDistribution — ui/app.tsx onPick) and
      // clears the carried identity so the resolver routes the cancel.
      dropIosCarried(appId, ['chosenIdentity'])
      const { importDistribution: _droppedDist, ...rest } = progress
      progress = { ...rest, setupMethod: 'create-new' }
      await ios.saveProgress?.(appId, progress)
    }
    else {
      const match = (carriedNow.importMatches ?? []).find(m => m.identity.sha1 === opts.identityChoice)
      if (!match) {
        const ctx: IosStepCtx = { appId, ...(carriedNow as Partial<IosStepCtx>) }
        const rerender = mapIosView(iosViewForStep('import-pick-identity', progress, ctx), facts, ctx)
        return { ...rerender, summary: `Unknown identity "${opts.identityChoice}" — call next_step with identityChoice set to one of the listed option values (the identity SHA-1), or "__cancel__".\n\n${rerender.summary}` }
      }
      // Stale per-identity state from a previous pick must not leak into the
      // new identity's routing (the TUI clears its appleCertId mirror + the
      // chosen profile when the identity changes).
      dropIosCarried(appId, ['_appleCertIdForChosen', 'chosenProfile'])
      mergeIosCarried(appId, { chosenIdentity: match.identity })
    }
    importAnswered = 'import-pick-identity'
  }

  if (opts?.profileChoice !== undefined) {
    const carriedNow = getSession(appId).iosCarried
    if (opts.profileChoice === '__back__') {
      // No carried profile = the resolver's '__back__' arm (import-pick-identity).
      dropIosCarried(appId, ['chosenProfile'])
    }
    else {
      const pool = (carriedNow.importMatches ?? [])
        .find(m => m.identity.sha1 === carriedNow.chosenIdentity?.sha1)?.profiles ?? []
      const picked = pool.find(p => p.uuid === opts.profileChoice)
      if (!picked) {
        const ctx: IosStepCtx = { appId, ...(carriedNow as Partial<IosStepCtx>) }
        const rerender = mapIosView(iosViewForStep('import-pick-profile', progress, ctx), facts, ctx)
        return { ...rerender, summary: `Unknown profile "${opts.profileChoice}" — call next_step with profileChoice set to one of the listed option values (the profile UUID), or "__back__".\n\n${rerender.summary}` }
      }
      mergeIosCarried(appId, { chosenProfile: picked })
    }
    importAnswered = 'import-pick-profile'
  }

  if (opts?.importRecoveryAction !== undefined) {
    mergeIosCarried(appId, { recoveryAction: opts.importRecoveryAction })
    // Re-entering the manual-path arm must re-ask for a file — the TUI clears
    // its picker-opened ref before routing (app.tsx:3593); same for the portal
    // 'use-file' arm below.
    if (opts.importRecoveryAction === 'provide-profile-path')
      dropIosCarried(appId, ['profilePickerOpened'])
    importAnswered = 'import-no-match-recovery'
  }

  if (opts?.portalAction !== undefined) {
    mergeIosCarried(appId, { portalAction: opts.portalAction })
    if (opts.portalAction === 'use-file')
      dropIosCarried(appId, ['profilePickerOpened'])
    importAnswered = 'import-portal-explanation'
  }

  if (opts?.exportConfirm !== undefined) {
    mergeIosCarried(appId, { exportWarningAction: opts.exportConfirm })
    importAnswered = 'import-export-warning'
  }

  if (opts?.profilePath !== undefined) {
    // The manual-path arm: the engine effect's openProfilePicker is injected as
    // a one-shot resolving this path (see the effect dispatch below).
    profilePathAnswer = opts.profilePath
    dropIosCarried(appId, ['profilePickerOpened'])
    importAnswered = 'import-provide-profile-path'
  }

  // S9-S11: a validated tail answer routes its explicit next step in (the same
  // guard as the tail park: only while the slim tail progress is in flight).
  let forcedNextStep: OnboardingStep | undefined
    = opts?.tailNext && progress.completedSteps?.credentialsSaved ? opts.tailNext : undefined

  for (let i = 0; i < MAX_AUTO_STEPS; i++) {
    // Session-parked recovery steps (error / cert-limit / duplicate-profile)
    // override the persisted resume step — they are the MCP's mirror of the
    // TUI's React `step` state, which resume routing can never reproduce.
    // The parked interactive TAIL step (S9-S11) sits between them and resume:
    // a re-render must re-ask the parked question, never drift forward through
    // the resume router (which collapses past the preview consent gate).
    let step = forcedNextStep
      ?? iosParkedStep(getSession(appId).iosCarried)
      ?? (mcpTailParkedStep(appId, progress) as OnboardingStep | null)
      ?? getIosResumeStep(progress)
    forcedNextStep = undefined

    // S12: the import park is one-shot per drive — consumed here and re-merged
    // only when an import prompt re-renders below, so it can never go stale
    // once the flow moves past the prompt (e.g. export → save → ask-build).
    if (getSession(appId).iosCarried.parkedImportStep !== undefined)
      dropIosCarried(appId, ['parkedImportStep'])

    // S12: inventory-dependent import steps re-run the silent scan first when
    // the carried inventory is absent (fresh fork entry / server restart) —
    // import-scanning routes back via getImportEntryStep, mirroring BOTH the
    // TUI's scan-before-questions order and its crash-recovery resume (the
    // ephemeral pickers are NEVER resume targets).
    if (IOS_IMPORT_INVENTORY_STEPS.has(step) && !getSession(appId).iosCarried.importMatches)
      step = 'import-scanning'

    // The TUI-only .p8 input chain renders as the single 'ios-api-key' gate —
    // or, on a fresh macOS entry with the import capability wired, the S12
    // setup-method fork (create-new vs import-existing). NOTE: branch on the
    // CAPABILITY, not on iosSetupForkStep's returned name — backing-up routes
    // next:'setup-method-select' on macOS, which must collapse back to the
    // api-key gate for import-incapable drivers (the S6a behavior).
    if (IOS_API_KEY_GATE_STEPS.has(step)) {
      if (!progress.setupMethod && !progress.p8Path && iosImportCapable(ios))
        return iosSetupMethodResult(facts)
      return iosApiKeyGateResult(facts)
    }
    // ask-build is the post-save entry point — map to the shared build-ready
    // choice exactly like the android driver (the unchanged C2/D2 contract).
    if (step === 'ask-build')
      return decideBuildPhase(facts, 'ios')

    // ── S8: post-save tail terminal ──────────────────────────────────────────
    // 'build-complete' ends the shared tail. The MCP run is over: drop the
    // slim tail progress (mirroring the TUI, which never keeps post-save state
    // on disk) and clear the session so a later onboarding starts fresh — the
    // credentials-exist gate re-protects the saved credentials. NEVER
    // decideBuildPhase here: the build already happened (buildRequested).
    if (step === 'build-complete') {
      try {
        await ios.deleteProgress?.(appId)
      }
      catch {
        // Best-effort cleanup — a stale slim file only re-renders this terminal.
      }
      clearSession(appId)
      return tailCompleteResult(appId, 'ios')
    }

    // Data-safety gate (parked by a TUI run or seeded above) → the
    // backup-or-cancel choice.
    if (step === 'credentials-exist')
      return iosCredentialsExistResult(facts)

    const session = getSession(appId)
    const ctx: IosStepCtx = { appId, ...(session.iosCarried as Partial<IosStepCtx>) }

    // ── S9-S11: interactive tail steps render structurally (and park) ────────
    // Includes ci-secrets-setup, whose TAIL_KIND is 'auto' but which has NO
    // effect in runTailEffect — it is the retry/skip screen shown when no
    // git-hosting CLI is ready. The view context comes from the session's
    // iosCarried (where decideIos merges every tail transient) overlaid on the
    // previously parked inventories.
    if (MCP_TAIL_INTERACTIVE_STEPS.has(step)) {
      return renderTailStep('ios', appId, step, progress, ctx as unknown as Record<string, unknown>, {
        defaultExportPath: ios.defaultExportPath,
        generateWorkflow: ios.generateWorkflow,
      })
    }

    // ── S12: import-provide-profile-path is a PATH INPUT over MCP ────────────
    // The TUI opens a native .mobileprovision picker inside the effect; the
    // headless MCP parks an input gate collecting profilePath instead, then
    // re-drives the effect with a one-shot picker resolving the provided path
    // (see the effect dispatch below). Without this park the 'auto' view would
    // dispatch the effect, see no picker, and bounce straight back to recovery.
    if (step === 'import-provide-profile-path' && profilePathAnswer === undefined) {
      mergeIosCarried(appId, { parkedImportStep: step })
      return mapIosView({
        step,
        kind: 'input',
        title: 'Use a .mobileprovision file from disk.',
        prompt: 'Absolute path to the .mobileprovision file:',
        collect: ['profilePath'],
      }, facts, ctx)
    }

    const view = iosViewForStep(step, progress, ctx)

    // A parked choice with a recorded answer re-drives as a RESOLVER effect
    // instead of re-rendering (mirrors the TUI onChange → runIosEffect with
    // the recorded carried state). Each is ONE-SHOT: consumed below so a
    // re-park in the same call renders the prompt instead of looping.
    const isVerifyResolver = step === 'verify-app' && Boolean(session.iosCarried.verifyAction)
    const isCertLimitResolver = step === 'cert-limit-prompt' && certLimitAnswered
    const isDupResolver = step === 'duplicate-profile-prompt' && dupAnswered
    const isErrorResolver = step === 'error' && errorRetry
    // S12: an import prompt whose answer arrived THIS call (one-shot).
    const isImportResolver = importAnswered !== undefined && importAnswered === step
    const isResolver = isVerifyResolver || isCertLimitResolver || isDupResolver || isErrorResolver || isImportResolver

    if (view.kind !== 'auto' && !isResolver) {
      if (view.kind === 'done')
        return decideBuildPhase(facts, 'ios')
      // S12: re-park the interactive import prompt the user is now looking at
      // (the headless mirror of the TUI's React `step`) so the next call's
      // strict gate validates the answer against THIS prompt.
      if (IOS_IMPORT_PARK_STEPS.has(step))
        mergeIosCarried(appId, { parkedImportStep: step })
      // 'error' (and the recovery prompts) map to structured states in
      // mapIosView — the S6a blanket ios-credentials-failed mapping is gone.
      return mapIosView(view, facts, ctx)
    }

    try {
      // saving-credentials needs the raw .p8 bytes for the APPLE_KEY_CONTENT
      // credential. They ride the process-local session (never persisted);
      // after a server restart re-read them from the persisted p8Path — the
      // same self-heal resolveP8Content performs for verifying-key.
      if (step === 'saving-credentials' && !session.iosCarried.p8Content && progress.p8Path && ios.readFile) {
        try {
          mergeIosCarried(appId, { p8Content: await ios.readFile(progress.p8Path) })
        }
        catch {
          // Degrade: credentials save without the APPLE_KEY_* fields.
        }
      }

      const isTailEffectStep = MCP_TAIL_EFFECT_STEPS.has(step)
      // S8 restart fallback: the tail carried (savedCredentials/ciSecretEntries
      // incl. CAPGO_TOKEN) is process-local; after a server restart re-derive
      // it from the saved credential store + the driver's pre-bound entry
      // builder BEFORE the effect consumes it. Never at saving-credentials
      // itself: there the store still holds the PREVIOUS credentials — the
      // save effect builds the fresh map from carried/progress.
      if (isTailEffectStep && step !== 'saving-credentials' && progress.completedSteps?.credentialsSaved)
        await rederiveTailCarried(appId, 'ios', ios)
      const liveSession = getSession(appId)
      // Tail effects read the TailEffectDeps carried shape; merge the tail
      // registry over the iOS one (saving-credentials still reads certData/
      // profileData/teamId/p8Content from the iOS carried).
      const carried = isTailEffectStep
        ? { ...liveSession.iosCarried, ...liveSession.tailCarried }
        : liveSession.iosCarried
      // S12: the manual-path arm re-drives the engine's import-provide-profile-
      // path effect with a ONE-SHOT picker resolving the user-provided path —
      // the engine's own read/parse/invariant pipeline then runs unchanged.
      const effectDeps: IosEffectDeps = { ...ios, appId, carried }
      if (step === 'import-provide-profile-path' && profilePathAnswer !== undefined) {
        const providedPath = profilePathAnswer
        profilePathAnswer = undefined
        effectDeps.openProfilePicker = async () => providedPath
      }
      const r = await runIosEffect(step, progress, effectDeps)
      progress = r.progress
      if (r.transient)
        mergeIosCarried(appId, r.transient as Partial<IosCarried>)

      // ── S8: MCP tail persistence (slim + secret-free) + carried registry ──
      // The shared tail NEVER persists post-save (the TUI keeps tail state in
      // memory); the MCP driver owns marker persistence (android/types.ts:
      // "markers are written by whichever driver chooses to persist the
      // tail"). The slim writers WHITELIST fields, so secrets can never reach
      // progress.json; the tail transients park in the session's tailCarried.
      if (isTailEffectStep) {
        mergeTailCarried(appId, {
          savedCredentials: r.transient?.savedCredentials,
          ciSecretEntries: r.transient?.ciSecretEntries,
          ciSecretExistingKeys: r.transient?.ciSecretExistingKeys,
        })
        if (step === 'saving-credentials' && r.next === 'ask-build') {
          // The save succeeded (the self-heal path returns a different next):
          // write the credentialsSaved marker so resume routes THROUGH the
          // tail (ask-build first) instead of bouncing to platform-select or
          // re-seeding the credentials-exist gate against the credentials the
          // save itself just wrote.
          progress = slimIosTailProgress({
            ...progress,
            completedSteps: { ...progress.completedSteps, credentialsSaved: { savedAt: new Date().toISOString() } },
          })
          await ios.saveProgress?.(appId, progress)
        }
        else if (progress.completedSteps?.credentialsSaved) {
          if (step === 'uploading-ci-secrets') {
            // Marker immediately after the successful upload (the TUI's
            // pre-delete marker semantics): a resume must never re-fire the
            // already-completed upload.
            progress = {
              ...progress,
              completedSteps: {
                ...progress.completedSteps,
                ciSecretsUploaded: {
                  provider: progress.ciSecretTarget?.provider ?? 'github',
                  count: getSession(appId).tailCarried.ciSecretEntries?.length ?? 0,
                },
              },
            }
          }
          // Re-slim on every tail effect so the markers + non-secret prefs the
          // effect recorded on progress (e.g. the auto-picked ciSecretTarget)
          // survive a restart.
          progress = slimIosTailProgress(progress)
          await ios.saveProgress?.(appId, progress)
        }
      }
      // Each resolver consumed its recorded answer — drop/clear it so a later
      // re-entry renders the prompt (or re-runs the initial fetch) instead of
      // replaying a stale action.
      if (isVerifyResolver)
        dropIosCarried(appId, ['verifyAction'])
      if (isCertLimitResolver)
        certLimitAnswered = false
      if (isDupResolver)
        dupAnswered = false
      if (isErrorResolver) {
        errorRetry = false
        dropIosCarried(appId, ['errorAction'])
      }
      // S12: the import resolver + its one-shot menu picks are consumed so a
      // later re-entry renders the prompt instead of replaying a stale action
      // (chosenIdentity/chosenProfile stay carried — downstream effects need
      // them, and a re-pick simply overwrites).
      if (isImportResolver)
        importAnswered = undefined
      if (step === 'import-no-match-recovery')
        dropIosCarried(appId, ['recoveryAction'])
      if (step === 'import-portal-explanation')
        dropIosCarried(appId, ['portalAction'])
      if (step === 'import-export-warning')
        dropIosCarried(appId, ['exportWarningAction'])

      // Recovery-park cleanup — the MCP mirror of the TUI clearing its React
      // state once a recovery resolves:
      //  - a successful revoke clears the cert-limit inventory + pick (the TUI
      //    clears certToRevoke/existingCerts after the revoke);
      //  - a completed duplicate deletion clears the duplicate list + confirm;
      //  - leaving the error screen (retry routed) clears the error park so the
      //    next call resumes the flow instead of re-rendering the stale error.
      if (step === 'revoking-certificate' && r.next === 'creating-certificate')
        dropIosCarried(appId, ['certToRevoke', 'existingCerts'])
      if (step === 'deleting-duplicate-profiles' && r.next && r.next !== 'error')
        dropIosCarried(appId, ['duplicateProfiles', 'confirmDeleteDuplicates'])
      if (step === 'error' && r.next && r.next !== 'error')
        dropIosCarried(appId, ['error', 'retryStep'])

      if (r.next === 'ai-analysis-prompt') {
        // TUI-only AI-debug entry — reroute to the existing build-failed handling.
        return {
          onboarding: 'capgo-builder', phase: 'build', state: 'build-failed', platform: 'ios',
          progress: 92, kind: 'error',
          summary: 'The build did not succeed. Check the build logs in your Capgo dashboard, fix the cause, and retry.',
          rules: ONBOARDING_RULES,
        }
      }
      // NOTE: r.next === 'error' is NOT special-cased — the loop parks on the
      // 'error' step (transient.error/retryStep just merged into the session)
      // and the next iteration renders the structured recovery screen.
      if (r.next)
        forcedNextStep = r.next
    }
    catch (err) {
      return iosEffectError(step, err, facts)
    }
  }

  return {
    onboarding: 'capgo-builder', phase: 'credentials', state: 'ios-auto-loop-guard', platform: 'ios', progress: 0, kind: 'error',
    summary: 'iOS onboarding stalled (too many automatic steps without progress). Please retry or run `capgo doctor`.',
    rules: ONBOARDING_RULES,
  }
}

export function mapAndroidView(
  view: ReturnType<typeof androidViewForStep>,
  facts: PreflightFacts,
  opts?: { keystorePath?: string, keystorePassword?: string },
): NextStepResult {
  const base = {
    onboarding: 'capgo-builder' as const,
    phase: 'credentials' as const,
    platform: 'android' as const,
    state: view.step,
    progress: ANDROID_STEP_PROGRESS[view.step] ?? 45,
    rules: ONBOARDING_RULES,
  }

  switch (view.step) {
    case 'credentials-exist':
      // Data-safety gate. Mirrors main's CredentialsExistStep: warn that saved
      // android credentials already exist and offer to back them up (then
      // continue) or stop. The agent must collect the choice and call next_step
      // with credentialsExistChoice.
      return {
        ...base,
        kind: 'choice',
        summary: `Android credentials already exist for "${facts.appId}". Continuing onboarding will create new credentials and replace the existing ones. Back them up first, or stop?`,
        options: (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note })),
        next: {
          tool: NEXT_STEP_TOOL,
          with: { credentialsExistChoice: '<backup|cancel>' },
          instruction: 'Tell the user their existing Android credentials will be replaced. Ask whether to back them up first and continue, or stop. Then call next_step with credentialsExistChoice.',
          call: `${NEXT_STEP_TOOL}({ credentialsExistChoice: "backup" })`,
        },
      }
    case 'service-account-method-select': {
      const savedLine = opts?.keystorePath
        ? `✓ Keystore created and saved to ${opts.keystorePath}${opts.keystorePassword ? ` (password: ${opts.keystorePassword})` : ''} — keep ${opts.keystorePassword ? 'both' : 'this file'} safe (you'll need ${opts.keystorePassword ? 'them' : 'it'} for every release). `
        : ''
      return {
        ...base,
        kind: 'choice',
        summary: `${savedLine}Now, connect Google Play so Capgo can upload your builds. A Google Play "service account" is the credential that lets Capgo publish on your behalf — how do you want to set it up?`,
        options: (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note })),
        ...(opts?.keystorePath ? { context: { keystorePath: opts.keystorePath, ...(opts.keystorePassword ? { keystorePassword: opts.keystorePassword } : {}) } } : {}),
        next: {
          tool: NEXT_STEP_TOOL,
          with: { serviceAccountMethod: '<generate|existing>' },
          instruction: 'Present the options to the user, then call next_step with serviceAccountMethod.',
          call: `${NEXT_STEP_TOOL}({ serviceAccountMethod: "generate" })`,
        },
      }
    }

    case 'google-sign-in':
      return {
        ...base,
        kind: 'human_gate',
        summary: `"${facts.appId}" needs access to Google Play. I will open your browser for a Google sign-in.`,
        human: {
          instruction: `I will open your browser for a Google sign-in. Approve every requested permission. Your tokens are used only during setup and are revoked when onboarding finishes; they never reach Capgo servers. Open your browser, approve the permissions, then tell me to continue.`,
        },
        next: {
          tool: NEXT_STEP_TOOL,
          instruction: 'After the user approves in the browser, call next_step with no arguments to continue.',
          call: `${NEXT_STEP_TOOL}({})`,
        },
      }

    case 'play-developer-id-input':
      return {
        ...base,
        kind: 'human_gate',
        summary: `Google sign-in complete. Now I need your Google Play Developer account ID.`,
        collect: [{ field: 'playDeveloperId', desc: 'Your Play Developer account ID (the number in the Play Console URL, e.g. 1234567890123456789)' }],
        human: {
          instruction: 'Open play.google.com/console, look at the URL the number after /developers/ is your account ID. Paste it here.',
        },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { playDeveloperId: '<developerId>' },
          instruction: 'Collect the Play Developer account ID from the user, then call next_step with playDeveloperId.',
          call: `${NEXT_STEP_TOOL}({ playDeveloperId: "1234567890123456789" })`,
        },
      }

    case 'gcp-projects-select':
      return {
        ...base,
        kind: 'choice',
        summary: `Pick the Google Cloud project to use for "${facts.appId}".`,
        options: (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note })),
        next: {
          tool: NEXT_STEP_TOOL,
          // Two routes (mirrors main's app.tsx onChange): pick an EXISTING
          // project by passing gcpProjectId, OR create a NEW project by passing
          // gcpProjectName (the "Create a new project" / __new__ option). Send
          // exactly one — the strict gate rejects both at once.
          with: { gcpProjectId: '<projectId>', gcpProjectName: '<new project name>' },
          instruction: 'Present the GCP project options to the user. To use an existing project call next_step with gcpProjectId. To create a new project (the "Create a new project" option), call next_step with gcpProjectName instead. Send exactly one.',
          call: `${NEXT_STEP_TOOL}({ gcpProjectId: "my-gcp-project" })  // or, to create a new one: ${NEXT_STEP_TOOL}({ gcpProjectName: "My App Capgo" })`,
        },
      }

    case 'gcp-project-create-name':
      return {
        ...base,
        kind: 'human_gate',
        summary: `Creating a new GCP project for "${facts.appId}". What should it be called?`,
        collect: [{ field: 'gcpProjectName', desc: 'Display name for the new GCP project (e.g. My App Capgo)' }],
        human: {
          instruction: 'Choose a display name for the new Google Cloud project (it can be changed later).',
        },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { gcpProjectName: '<name>' },
          instruction: 'Collect a project name from the user, then call next_step with gcpProjectName.',
          call: `${NEXT_STEP_TOOL}({ gcpProjectName: "My App Capgo" })`,
        },
      }

    case 'android-package-select': {
      if (view.kind === 'choice') {
        return {
          ...base,
          kind: 'choice',
          summary: `Which Android package (applicationId) should I grant access to?`,
          options: [
            ...(view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note })),
            { value: '__manual__', label: 'Type a different package name' },
          ],
          next: {
            tool: NEXT_STEP_TOOL,
            with: { androidPackage: '<packageName>' },
            instruction: 'Present the detected package options to the user, then call next_step with androidPackage.',
            call: `${NEXT_STEP_TOOL}({ androidPackage: "com.example.app" })`,
          },
        }
      }
      return {
        ...base,
        kind: 'human_gate',
        summary: `I could not detect the Android package name. Please provide it manually.`,
        collect: [{ field: 'androidPackage', desc: 'The applicationId from your Android app (e.g. com.example.app)' }],
        human: {
          instruction: 'Find the applicationId in your android/app/build.gradle file and provide it here.',
        },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { androidPackage: '<packageName>' },
          instruction: 'Collect the Android package name from the user, then call next_step with androidPackage.',
          call: `${NEXT_STEP_TOOL}({ androidPackage: "com.example.app" })`,
        },
      }
    }

    case 'sa-json-existing-path':
      return {
        ...base,
        kind: 'human_gate',
        summary: `Provide the path to your existing Google Play service-account JSON file.`,
        collect: [{ field: 'serviceAccountJsonPath', desc: 'Absolute path to the Google Play service-account .json file' }],
        human: {
          instruction: 'Give me the path to your Google Play service-account .json key file. The file stays on your machine do not paste its contents here.',
        },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { serviceAccountJsonPath: '<path>' },
          instruction: 'Ask the user for the service-account .json file path, then call next_step with serviceAccountJsonPath.',
          call: `${NEXT_STEP_TOOL}({ serviceAccountJsonPath: "/path/to/service-account.json" })`,
        },
      }

    case 'sa-json-validation-failed':
      return {
        ...base,
        kind: 'choice',
        summary: `Service account validation failed${view.message ? `: ${view.message}` : '.'}`,
        options: (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note })),
        next: {
          tool: NEXT_STEP_TOOL,
          with: { saMethodChoice: '<retry|save-anyway|oauth>' },
          instruction: 'Present the recovery options to the user, then call next_step with saMethodChoice.',
          call: `${NEXT_STEP_TOOL}({ saMethodChoice: "retry" })`,
        },
      }

    case 'keystore-method-select':
      return {
        ...base,
        kind: 'choice',
        summary: `Let's set up your Android signing keystore for "${facts.appId}". Do you already have one?`,
        options: (view.options ?? [])
          .filter(o => o.value !== 'learn')
          .map(o => ({ value: o.value, label: o.label, note: o.note })),
        next: {
          tool: NEXT_STEP_TOOL,
          with: { keystoreMethod: '<existing|generate>' },
          instruction: 'Ask the user whether they already have a keystore, then call next_step with keystoreMethod.',
          call: `${NEXT_STEP_TOOL}({ keystoreMethod: "generate" })`,
        },
      }

    case 'keystore-explainer':
      return {
        ...base,
        kind: 'human_gate',
        summary: 'A keystore signs your Android app. You need one to publish to Google Play.',
        human: { instruction: 'Let the user know about keystores, then ask them to choose: do they already have one or should we create one?' },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { keystoreMethod: '<existing|generate>' },
          instruction: 'Ask the user whether they already have a keystore, then call next_step with keystoreMethod.',
          call: `${NEXT_STEP_TOOL}({ keystoreMethod: "generate" })`,
        },
      }

    case 'keystore-existing-path':
      return {
        ...base,
        kind: 'human_gate',
        summary: 'Point me to your existing Android keystore.',
        collect: [{ field: 'keystorePath', desc: 'Absolute path to your keystore (.jks/.keystore/.p12)' }],
        human: { instruction: 'Give me the absolute path to your keystore file. It stays on your machine.' },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { keystorePath: '<path>' },
          instruction: 'Ask for the keystore path, then call next_step with keystorePath.',
          call: `${NEXT_STEP_TOOL}({ keystorePath: "/path/to/release.jks" })`,
        },
      }

    case 'keystore-existing-store-password':
      return {
        ...base,
        kind: 'human_gate',
        summary: "What is the keystore's store password?",
        collect: [{ field: 'keystoreStorePassword', desc: 'The keystore store password (stays on your machine)' }],
        human: { instruction: 'Ask the user for the store password and pass it as keystoreStorePassword. It is used locally to unlock the keystore.' },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { keystoreStorePassword: '<password>' },
          instruction: 'Ask the user for the store password, then call next_step with keystoreStorePassword.',
          call: `${NEXT_STEP_TOOL}({ keystoreStorePassword: "..." })`,
        },
      }

    case 'keystore-existing-alias-select':
      return {
        ...base,
        kind: 'choice',
        summary: 'Which key alias should we use?',
        options: (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note })),
        next: {
          tool: NEXT_STEP_TOOL,
          with: { keystoreAlias: '<alias>' },
          instruction: 'Present the alias options to the user, then call next_step with keystoreAlias.',
          call: `${NEXT_STEP_TOOL}({ keystoreAlias: "release" })`,
        },
      }

    case 'keystore-existing-alias':
      return {
        ...base,
        kind: 'human_gate',
        summary: 'Which key alias is in your keystore?',
        collect: [{ field: 'keystoreAlias', desc: 'The key alias' }],
        human: { instruction: 'Ask the user for the key alias inside the keystore, then pass it as keystoreAlias.' },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { keystoreAlias: '<alias>' },
          instruction: 'Ask the user for the key alias, then call next_step with keystoreAlias.',
          call: `${NEXT_STEP_TOOL}({ keystoreAlias: "release" })`,
        },
      }

    case 'keystore-existing-key-password':
      return {
        ...base,
        kind: 'human_gate',
        summary: 'What is the key password? (Leave blank if it is the same as the store password.)',
        collect: [{ field: 'keystoreKeyPassword', desc: 'The key password, or blank to match the store password' }],
        human: { instruction: 'Ask the user for the key password. If they leave it blank, it will use the store password.' },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { keystoreKeyPassword: '<password>' },
          instruction: 'Ask the user for the key password (blank means same as store password), then call next_step with keystoreKeyPassword.',
          call: `${NEXT_STEP_TOOL}({ keystoreKeyPassword: "..." })`,
        },
      }

    case 'keystore-new-alias':
      return {
        ...base,
        kind: 'human_gate',
        summary: 'Naming your new key. What alias? (default: release)',
        collect: [{ field: 'keystoreNewAlias', desc: 'Alias for the new key (default release)' }],
        human: { instruction: 'Ask the user for a key alias (suggest "release" as the default), then pass it as keystoreNewAlias.' },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { keystoreNewAlias: '<alias>' },
          instruction: 'Ask the user for the new key alias, then call next_step with keystoreNewAlias.',
          call: `${NEXT_STEP_TOOL}({ keystoreNewAlias: "release" })`,
        },
      }

    case 'keystore-new-password-method':
      return {
        ...base,
        kind: 'choice',
        summary: 'How should we set the keystore password?',
        options: (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note })),
        next: {
          tool: NEXT_STEP_TOOL,
          with: { keystorePasswordMethod: '<random|manual>' },
          instruction: 'Present the password method options to the user, then call next_step with keystorePasswordMethod.',
          call: `${NEXT_STEP_TOOL}({ keystorePasswordMethod: "random" })`,
        },
      }

    case 'keystore-new-store-password':
      return {
        ...base,
        kind: 'human_gate',
        summary: 'Set a store password for the new keystore (min 6 chars).',
        collect: [{ field: 'keystoreStorePassword', desc: 'Store password for the new keystore (min 6 chars)' }],
        human: { instruction: 'Ask the user to set a store password for the new keystore (at least 6 characters).' },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { keystoreStorePassword: '<password>' },
          instruction: 'Ask the user for the store password, then call next_step with keystoreStorePassword.',
          call: `${NEXT_STEP_TOOL}({ keystoreStorePassword: "..." })`,
        },
      }

    case 'keystore-new-key-password':
      return {
        ...base,
        kind: 'human_gate',
        summary: 'Set a key password (leave blank to match the store password).',
        collect: [{ field: 'keystoreKeyPassword', desc: 'Key password, or blank to match the store password' }],
        human: { instruction: 'Ask the user for a key password (blank means same as store password).' },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { keystoreKeyPassword: '<password>' },
          instruction: 'Ask the user for the key password (blank means same as store password), then call next_step with keystoreKeyPassword.',
          call: `${NEXT_STEP_TOOL}({ keystoreKeyPassword: "..." })`,
        },
      }

    case 'keystore-new-cn':
      return {
        ...base,
        kind: 'human_gate',
        summary: `Certificate common name? (default: your app id "${facts.appId}")`,
        collect: [{ field: 'keystoreCommonName', desc: 'Certificate Common Name (default: app id)' }],
        human: { instruction: `Ask the user for the certificate common name (suggest "${facts.appId}" as the default), then pass it as keystoreCommonName.` },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { keystoreCommonName: '<name>' },
          instruction: 'Ask the user for the certificate common name, then call next_step with keystoreCommonName.',
          call: `${NEXT_STEP_TOOL}({ keystoreCommonName: "com.x" })`,
        },
      }

    case 'error':
      return { ...base, kind: 'error', summary: view.message ?? 'Android setup error.' }

    default:
      // Generic mapping for views outside the structured cases (S8: the shared
      // post-save tail's interactive steps land here until the next slice maps
      // them structurally). Mirrors mapIosView's default: surface the engine
      // view verbatim (prompt/title + options) and allow a plain re-check.
      // Option-carrying views of any kind (choice, the ci-secrets-failed
      // 'error' view) render as a choice so the options are never dropped.
      if (view.kind === 'choice' || (view.options ?? []).length > 0) {
        return {
          ...base,
          kind: 'choice',
          summary: view.prompt ?? view.title ?? view.message ?? `Android setup: ${view.step}`,
          options: (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note })),
          next: {
            tool: NEXT_STEP_TOOL,
            instruction: 'Present the options to the user. Structured answers for this step arrive in a later milestone — call next_step({}) to re-check, or finish this step in the interactive wizard (`npx @capgo/cli build init`).',
            call: `${NEXT_STEP_TOOL}({})`,
          },
        }
      }
      return {
        ...base,
        kind: 'human_gate',
        summary: view.prompt ?? view.title ?? `Android setup: ${view.step}`,
        human: { instruction: view.prompt ?? 'Continue when ready.' },
        next: { tool: NEXT_STEP_TOOL, instruction: 'Call next_step to continue.', call: `${NEXT_STEP_TOOL}({})` },
      }
  }
}

function androidEffectError(
  step: AndroidOnboardingStep,
  err: unknown,
  _facts: PreflightFacts,
): NextStepResult {
  const message = err instanceof Error ? err.message : String(err)
  const stepProg = ANDROID_STEP_PROGRESS[step] ?? 45

  if (step === 'gcp-projects-loading') {
    return {
      onboarding: 'capgo-builder', phase: 'credentials', platform: 'android', state: step,
      progress: stepProg, kind: 'human_gate',
      summary: `Failed to load GCP projects: ${message}`,
      human: { instruction: 'Check that your Google account has access to GCP, then tell me to continue to retry.' },
      next: { tool: NEXT_STEP_TOOL, instruction: 'After the user checks their GCP access, call next_step({}) to retry.', call: `${NEXT_STEP_TOOL}({})` },
      rules: ONBOARDING_RULES,
    }
  }
  if (step === 'gcp-setup-running') {
    return {
      onboarding: 'capgo-builder', phase: 'credentials', platform: 'android', state: step,
      progress: stepProg, kind: 'human_gate',
      summary: `GCP setup failed: ${message}`,
      human: { instruction: 'Check your GCP permissions and Play Console access. Tell me to continue to retry.' },
      next: { tool: NEXT_STEP_TOOL, instruction: 'After the user checks their access, call next_step({}) to retry.', call: `${NEXT_STEP_TOOL}({})` },
      rules: ONBOARDING_RULES,
    }
  }
  if (step === 'saving-credentials') {
    return {
      onboarding: 'capgo-builder', phase: 'credentials', platform: 'android', state: step,
      progress: stepProg, kind: 'human_gate',
      summary: `Saving credentials failed: ${message}`,
      human: { instruction: 'Tell me to continue to retry saving credentials.' },
      next: { tool: NEXT_STEP_TOOL, instruction: 'Call next_step({}) to retry.', call: `${NEXT_STEP_TOOL}({})` },
      rules: ONBOARDING_RULES,
    }
  }
  return {
    onboarding: 'capgo-builder', phase: 'credentials', platform: 'android', state: step,
    progress: stepProg, kind: 'error',
    summary: `Android setup error at step "${step}": ${message}`,
    rules: ONBOARDING_RULES,
  }
}

export async function decideAndroid(
  facts: PreflightFacts,
  deps: EngineDeps,
  opts?: {
    signInProceed?: boolean
    /**
     * S9-S11: the explicit tail step a validated tail answer routed to
     * (drive() → applyMcpTailAnswer). Honored only while the slim tail
     * progress carries credentialsSaved — the same guard as the tail park.
     */
    tailNext?: AndroidOnboardingStep
  },
): Promise<NextStepResult> {
  const appId = facts.appId!

  // Seed empty progress when the user first enters the Android flow (null progress
  // means no prior run). getAndroidResumeStep(null) returns 'welcome' which is a
  // bootstrap-only step that the loop cannot drive; seeding an empty progress object
  // makes getAndroidResumeStep return 'keystore-method-select' — the correct first
  // interactive step. This mirrors how the Ink wizard begins.
  let progress: import('../android/types.js').AndroidOnboardingProgress = facts.androidProgress ?? {
    platform: 'android' as const,
    appId,
    startedAt: new Date().toISOString(),
    completedSteps: {},
  }
  // Record that the android flow is now active so a subsequent next_step that
  // omits `platform` resumes android instead of bouncing to platform-select.
  // Persist immediately because the first interactive step returns before the
  // loop ever saves (so the NEXT call must already see the marker).
  if (!progress.activePlatform) {
    progress = { ...progress, activePlatform: 'android' }
    await deps.androidEffectDeps.saveAndroidProgress(appId, progress)
  }

  // ── Data-safety gate (mirrors main's welcome-effect L1005) ────────────────
  // When saved android credentials already exist for this app AND the user is
  // about to enter the keystore phase fresh (no keystore progress yet) AND the
  // gate has not been evaluated, route through `credentials-exist` (backup-or-
  // cancel) before anything can overwrite the saved credentials. Encode the
  // decision in `_credentialsExistGate` so the stateless engine reproduces it on
  // every subsequent call. Only fires on a truly fresh keystore entry, so an
  // in-flight onboarding (and the e2e happy path, which has no saved creds) is
  // unaffected.
  if (
    progress._credentialsExistGate === undefined
    && getAndroidResumeStep(progress) === 'keystore-method-select'
  ) {
    let hasSavedAndroid = false
    try {
      const saved = await deps.androidEffectDeps.loadSavedCredentials(appId)
      hasSavedAndroid = !!(saved && typeof saved === 'object' && (saved as { android?: unknown }).android)
    }
    catch {
      // Treat a load failure as "no saved credentials" — never block onboarding
      // on a read error; the worst case is the pre-existing (no-gate) behavior.
      hasSavedAndroid = false
    }
    if (hasSavedAndroid) {
      progress = { ...progress, _credentialsExistGate: 'pending' }
      await deps.androidEffectDeps.saveAndroidProgress(appId, progress)
    }
  }

  // 'cancel' is a hard stop: the user declined to back up existing credentials,
  // so onboarding halts to protect them (mirrors main's exitOnboarding()).
  if (progress._credentialsExistGate === 'cancel') {
    return {
      onboarding: 'capgo-builder', phase: 'credentials', state: 'credentials-exist', platform: 'android',
      progress: ANDROID_STEP_PROGRESS['credentials-exist'], kind: 'done',
      summary: `Onboarding stopped to protect the existing Android credentials for "${appId}". Nothing was changed. Re-run onboarding and choose "Start fresh (backup existing credentials first)" when you're ready to replace them.`,
      rules: ONBOARDING_RULES,
    }
  }

  let ctx: AndroidStepCtx = { appId }
  // When an effect signals an explicit next step (e.g. gcp-projects-loading → gcp-projects-select),
  // use that instead of re-deriving from progress on the next iteration.
  // S9-S11: a validated tail answer routes its explicit next step in (the same
  // guard as the tail park: only while the slim tail progress is in flight).
  let forcedNextStep: AndroidOnboardingStep | undefined
    = opts?.tailNext && progress.completedSteps?.credentialsSaved ? opts.tailNext : undefined
  // Track whether we've already written the .p12 file this invocation so we only write once.
  let keystoreFileWritten = false

  for (let i = 0; i < MAX_AUTO_STEPS; i++) {
    // The parked interactive TAIL step (S9-S11) overrides resume derivation —
    // a re-render must re-ask the parked question, never drift forward through
    // the resume router (which collapses past the preview consent gate).
    const step = forcedNextStep
      ?? (mcpTailParkedStep(appId, progress) as AndroidOnboardingStep | null)
      ?? getAndroidResumeStep(progress)
    forcedNextStep = undefined

    if (step === 'google-sign-in') {
      if (!opts?.signInProceed) {
        const view = androidViewForStep(step, progress, ctx)
        return mapAndroidView(view, facts)
      }

      // Use injected session registry when available (for tests), else module-level.
      const session = deps.oauthSession ?? { begin: beginOAuthSession, poll: pollOAuthSession, clear: clearOAuthSession }
      const poll = session.poll(appId)

      if (poll.status === 'absent') {
        // startOAuthFlow is always provided by the MCP driver (buildAndroidEffectDeps);
        // the Ink driver never reaches this code path.
        await session.begin(appId, () => deps.androidEffectDeps.startOAuthFlow!())
        return {
          onboarding: 'capgo-builder', phase: 'credentials', state: 'google-sign-in', platform: 'android',
          progress: ANDROID_STEP_PROGRESS['google-sign-in'], kind: 'human_gate',
          summary: `I have opened your browser for Google sign-in. Approve the permissions, then tell me to continue.`,
          human: { instruction: `Your browser has been opened for Google sign-in. Approve every requested permission — your tokens never reach Capgo servers and are revoked when setup finishes. Once you have approved in the browser, tell me to continue.` },
          next: { tool: NEXT_STEP_TOOL, instruction: 'After the user approves in the browser, call next_step with no arguments to continue.', call: `${NEXT_STEP_TOOL}({})` },
          rules: ONBOARDING_RULES,
        }
      }

      if (poll.status === 'pending') {
        return {
          onboarding: 'capgo-builder', phase: 'credentials', state: 'google-sign-in', platform: 'android',
          progress: ANDROID_STEP_PROGRESS['google-sign-in'], kind: 'human_gate',
          summary: `Still waiting on the browser sign-in — finish in the browser, then tell me to continue.`,
          human: { instruction: `The browser sign-in is still in progress. Complete the sign-in in your browser, then tell me to continue.` },
          next: { tool: NEXT_STEP_TOOL, instruction: 'After finishing the browser sign-in, call next_step with no arguments to continue.', call: `${NEXT_STEP_TOOL}({})` },
          rules: ONBOARDING_RULES,
        }
      }

      if (poll.status === 'error') {
        const reason = poll.error?.message ?? 'unknown error'
        session.clear(appId)
        return {
          onboarding: 'capgo-builder', phase: 'credentials', state: 'google-sign-in', platform: 'android',
          progress: ANDROID_STEP_PROGRESS['google-sign-in'], kind: 'human_gate',
          summary: `Google sign-in did not complete (${reason}). Tell me to continue to try again.`,
          human: { instruction: `The Google sign-in did not complete successfully (${reason}). Tell me to continue and I will open the browser again for a fresh sign-in.` },
          next: { tool: NEXT_STEP_TOOL, instruction: 'Tell the user what went wrong, then call next_step({}) to retry.', call: `${NEXT_STEP_TOOL}({})` },
          rules: ONBOARDING_RULES,
        }
      }

      const tokens = poll.tokens!
      const info = await deps.androidEffectDeps.fetchUserInfo(tokens.accessToken)
      progress = applyGoogleSignIn(progress, tokens, info)
      await deps.androidEffectDeps.saveAndroidProgress(appId, progress)
      session.clear(appId)
      continue
    }

    // ask-build is the post-save entry point for the Ink driver's build-choice sub-flow.
    // The MCP bridge maps this to the shared build-ready choice (decideBuildPhase).
    if (step === 'ask-build')
      return decideBuildPhase(facts, 'android')

    // ── S8: post-save tail terminal ──────────────────────────────────────────
    // 'build-complete' ends the shared tail. Drop the slim tail progress
    // (mirroring the TUI, which never keeps post-save state on disk) and clear
    // the session so a later onboarding starts fresh — the credentials-exist
    // gate re-protects the saved credentials. NEVER decideBuildPhase here: the
    // build already happened (buildRequested).
    if (step === 'build-complete') {
      try {
        await deps.androidEffectDeps.deleteAndroidProgress(appId)
      }
      catch {
        // Best-effort cleanup — a stale slim file only re-renders this terminal.
      }
      clearSession(appId)
      return tailCompleteResult(appId, 'android')
    }

    // ── S9-S11: interactive tail steps render structurally (and park) ────────
    // Includes ci-secrets-setup, whose TAIL_KIND is 'auto' but which has NO
    // effect in runTailEffect — it is the retry/skip screen shown when no
    // git-hosting CLI is ready. The view context is the invocation-local ctx
    // (the effect transients accumulated this call) overlaid on the previously
    // parked inventories.
    if (MCP_TAIL_INTERACTIVE_STEPS.has(step)) {
      return renderTailStep('android', appId, step, progress, ctx as unknown as Record<string, unknown>, {
        defaultExportPath: deps.androidEffectDeps.defaultExportPath,
        generateWorkflow: deps.androidEffectDeps.generateWorkflow,
      })
    }

    // keystore-new-cn: the Ink wizard advances to keystore-generating immediately
    // after the CN input is submitted (persistAndStep sets step:'keystore-generating'
    // directly). getAndroidResumeStep cannot detect this transition on its own
    // because there is no dedicated "cn collected" marker — CN is the last input
    // before the auto effect. When CN is already in progress, force the next step.
    if (step === 'keystore-new-cn' && progress.keystoreCommonName !== undefined) {
      forcedNextStep = 'keystore-generating'
      continue
    }

    const view = androidViewForStep(step, progress, ctx)

    // keystore-existing-key-password has kind:'input' in KIND_TABLE but it also has
    // an auto-probe component: the effect first tries to unlock the key with the store
    // password. Only if that fails does it return needsKeyPasswordPrompt:true and the
    // driver shows the manual input. Run it as auto here (same as the Ink driver's
    // useEffect probe) so the probe path works without requiring a redundant user turn.
    const isKeyPasswordProbeStep = step === 'keystore-existing-key-password' && !progress.keystoreKeyPassword

    if (view.kind !== 'auto' && !isKeyPasswordProbeStep) {
      if (view.kind === 'done')
        return decideBuildPhase(facts, 'android')

      // When we reach service-account-method-select (the first step after the keystore
      // phase), write the .p12 file exactly once so the user has a local copy.
      // Guard: only when keystoreReady + _keystoreBase64 are both present and the file
      // has not yet been written this invocation.
      if (
        step === 'service-account-method-select'
        && !keystoreFileWritten
        && progress.completedSteps?.keystoreReady
        && progress._keystoreBase64
        && deps.writeKeystoreFile
      ) {
        keystoreFileWritten = true
        const alias = progress.keystoreAlias ?? progress.completedSteps.keystoreReady.alias ?? 'release'
        try {
          const writtenPath = await deps.writeKeystoreFile(appId, progress._keystoreBase64, alias)
          ctx = {
            ...ctx,
            _keystoreWrittenPath: writtenPath,
            // Surface the password ONLY when it was auto-generated (random method) —
            // the user has not seen it. Manual passwords are never echoed back.
            ...(progress.keystorePasswordGenerated && progress.keystoreStorePassword
              ? { _keystoreWrittenPassword: progress.keystoreStorePassword }
              : {}),
          } as AndroidStepCtx & { _keystoreWrittenPath: string, _keystoreWrittenPassword?: string }
          // Re-read the view with the path set so mapAndroidView gets it right below.
        }
        catch {
          // Non-fatal: keystore data is safe in progress.
        }
      }

      // Pass keystorePath through to service-account-method-select so the result
      // carries context.keystorePath when the keystore was just written to disk.
      const writeCtx = ctx as AndroidStepCtx & { _keystoreWrittenPath?: string, _keystoreWrittenPassword?: string }
      const keystorePath = writeCtx._keystoreWrittenPath
      const keystorePassword = writeCtx._keystoreWrittenPassword
      return mapAndroidView(view, facts, keystorePath ? { keystorePath, ...(keystorePassword ? { keystorePassword } : {}) } : undefined)
    }

    try {
      const isTailEffectStep = MCP_TAIL_EFFECT_STEPS.has(step)
      // S8 restart fallback: re-derive the process-local tail carried from the
      // saved credential store before a post-restart tail effect consumes it
      // (see the matching decideIos comment).
      if (isTailEffectStep && step !== 'saving-credentials' && progress.completedSteps?.credentialsSaved)
        await rederiveTailCarried(appId, 'android', deps.androidEffectDeps)
      // Tail effects read the driver-held carried transients; the MCP parks
      // them in the session registry between tool calls (the headless mirror
      // of the Ink TUI's React tail state).
      const effectDeps = isTailEffectStep
        ? { ...deps.androidEffectDeps, carried: { ...getSession(appId).tailCarried } }
        : deps.androidEffectDeps
      const r = await runAndroidEffect(step, progress, effectDeps)
      progress = r.progress
      const transient = r.transient ?? {}
      ctx = { ...ctx, ...transient }

      // ── S8: MCP tail persistence (slim + secret-free) + carried registry ──
      // Mirrors the decideIos block: the MCP driver owns marker persistence
      // (android/types.ts) via the WHITELISTING slim writer; tail transients
      // park in the session's tailCarried.
      if (isTailEffectStep) {
        mergeTailCarried(appId, {
          savedCredentials: transient.savedCredentials,
          ciSecretEntries: transient.ciSecretEntries,
          ciSecretExistingKeys: transient.ciSecretExistingKeys,
        })
        if (step === 'saving-credentials' && r.next === 'ask-build') {
          progress = slimAndroidTailProgress({
            ...progress,
            completedSteps: { ...progress.completedSteps, credentialsSaved: { savedAt: new Date().toISOString() } },
          })
          await deps.androidEffectDeps.saveAndroidProgress(appId, progress)
        }
        else if (progress.completedSteps?.credentialsSaved) {
          if (step === 'uploading-ci-secrets') {
            // Marker immediately after the successful upload — resume must
            // never re-fire the already-completed upload.
            progress = {
              ...progress,
              completedSteps: {
                ...progress.completedSteps,
                ciSecretsUploaded: {
                  provider: progress.ciSecretTarget?.provider ?? 'github',
                  count: getSession(appId).tailCarried.ciSecretEntries?.length ?? 0,
                },
              },
            }
          }
          progress = slimAndroidTailProgress(progress)
          await deps.androidEffectDeps.saveAndroidProgress(appId, progress)
        }
      }

      // ── Transient handling (mirrors the Ink driver's logic) ─────────────────
      //
      // keystore-existing-detecting-alias → wrongPassword:
      //   Re-prompt for the store password (do NOT advance).
      //   The progress already has keystoreExistingPath; clear the stale password so
      //   the next submission goes through detecting-alias fresh.
      if (transient.wrongPassword) {
        const view = androidViewForStep('keystore-existing-store-password', progress, ctx)
        return mapAndroidView(view, facts)
      }

      // keystore-existing-key-password (probe) → needsKeyPasswordPrompt:
      //   The effect could not auto-resolve the key password.
      //   Map the step as a human_gate so the user can supply it.
      if (transient.needsKeyPasswordPrompt) {
        const view = androidViewForStep('keystore-existing-key-password', progress, ctx)
        return mapAndroidView(view, facts)
      }

      // Respect explicit next from the effect (e.g. gcp-projects-loading → gcp-projects-select).
      if (r.next) {
        forcedNextStep = r.next
      }

      // ── Write .p12 once when the keystore phase just completed ──────────────
      // Detect transition: progress now has keystoreReady + _keystoreBase64 and we
      // haven't written the file yet. Write it and carry the path forward.
      if (
        !keystoreFileWritten
        && progress.completedSteps?.keystoreReady
        && progress._keystoreBase64
        && deps.writeKeystoreFile
      ) {
        keystoreFileWritten = true
        const alias = progress.keystoreAlias ?? progress.completedSteps.keystoreReady.alias ?? 'release'
        try {
          const writtenPath = await deps.writeKeystoreFile(appId, progress._keystoreBase64, alias)
          // Stash path (and the auto-generated password, if any) so the
          // service-account-method-select result can expose them.
          ctx = {
            ...ctx,
            _keystoreWrittenPath: writtenPath,
            ...(progress.keystorePasswordGenerated && progress.keystoreStorePassword
              ? { _keystoreWrittenPassword: progress.keystoreStorePassword }
              : {}),
          } as AndroidStepCtx & { _keystoreWrittenPath: string, _keystoreWrittenPassword?: string }
        }
        catch {
          // Non-fatal: the keystore data is safe in progress; the file write is best-effort.
        }
      }
    }
    catch (err) {
      return androidEffectError(step, err, facts)
    }
  }

  return {
    onboarding: 'capgo-builder', phase: 'credentials', state: 'android-auto-loop-guard', platform: 'android', progress: 0, kind: 'error',
    summary: 'Android onboarding stalled (too many automatic steps without progress). Please retry or run `capgo doctor`.',
    rules: ONBOARDING_RULES,
  }
}

function decideBuildPhase(facts: PreflightFacts, platform: Platform): NextStepResult {
  return {
    onboarding: 'capgo-builder', phase: 'build', state: 'build-ready', platform, progress: 90, kind: 'choice',
    summary: `Credentials for "${facts.appId}" (${platform}) are saved. Run your first cloud build now?`,
    options: [
      { value: 'build', label: 'Run the first build now' },
      { value: 'skip', label: 'Skip — I will build later' },
    ],
    next: {
      tool: NEXT_STEP_TOOL,
      with: { runBuild: true, platform },
      instruction: `Ask the user. To build now: next_step({ runBuild: true, platform: "${platform}" }). To skip (onboarding still completes): next_step({ runBuild: false, platform: "${platform}" }).`,
      call: `${NEXT_STEP_TOOL}({ runBuild: true, platform: "${platform}" })`,
    },
    rules: ONBOARDING_RULES,
  }
}

// ─── S8: MCP-driven post-save tail ────────────────────────────────────────────
//
// The step ids whose EFFECT both platform flows delegate to the shared tail
// (mirrors the private TAIL_EFFECT_STEPS sets in ios/flow.ts + android/flow.ts).
// For these the MCP driver: threads the session's tailCarried into the effect,
// captures the tail transients back into it, and persists the SLIM secret-free
// tail progress (markers + prefs — see mcp/tail-progress.ts). 'requesting-build'
// is listed for completeness but never runs here — the MCP build path is the
// unchanged C2/D2 handoff + checkBuild polling.
const MCP_TAIL_EFFECT_STEPS = new Set<string>([
  'saving-credentials',
  'detecting-ci-secrets',
  'checking-ci-secrets',
  'uploading-ci-secrets',
  'exporting-env',
  'overwrite-and-export-env',
  'writing-workflow-file',
  'requesting-build',
])

/** The tail's terminal screen — onboarding is fully complete (post-build). */
function tailCompleteResult(appId: string, platform: Platform): NextStepResult {
  return {
    onboarding: 'capgo-builder', phase: 'done', state: 'build-complete', platform, progress: 100, kind: 'done',
    summary: `Capgo Builder onboarding for "${appId}" (${platform}) is complete — credentials are saved and your first cloud build went through. Run \`npx @capgo/cli@latest build request --platform ${platform}\` anytime for new builds.`,
    rules: ONBOARDING_RULES,
  }
}

/**
 * S8 restart fallback: rebuild the process-local tail carried
 * (savedCredentials + ciSecretEntries) after a server restart lost the session
 * registry. loadSavedCredentials() returns the exact platform map
 * saving-credentials wrote; the driver-pre-bound createCiSecretEntries folds
 * the resolved Capgo key back in (CAPGO_TOKEN). The rebuilt values live ONLY
 * in the session registry — never in progress.json or tool results. Degrades
 * silently on any read error (the shared tail then falls back to its own
 * lossy rebuildTailCredentials).
 */
async function rederiveTailCarried(
  appId: string,
  platform: Platform,
  deps: {
    loadSavedCredentials?: (appId: string) => Promise<unknown>
    createCiSecretEntries?: (credentials: Record<string, string>, apiKey?: string) => import('../ci-secrets.js').CiSecretEntry[]
  },
): Promise<void> {
  const tail = getSession(appId).tailCarried
  if (tail.savedCredentials && tail.ciSecretEntries)
    return
  let creds: Record<string, string> | undefined
  try {
    const saved = await deps.loadSavedCredentials?.(appId)
    const platformCreds = (saved as Record<string, unknown> | null | undefined)?.[platform]
    if (platformCreds && typeof platformCreds === 'object')
      creds = platformCreds as Record<string, string>
  }
  catch {
    // Treat a load failure as "nothing to re-derive" — never block the tail.
  }
  if (!creds)
    return
  mergeTailCarried(appId, {
    ...(tail.savedCredentials ? {} : { savedCredentials: creds }),
    ...(tail.ciSecretEntries || !deps.createCiSecretEntries ? {} : { ciSecretEntries: deps.createCiSecretEntries(creds) }),
  })
}

// ─── S9-S11: structured tail steps (CI secrets / GH Actions / env / workflow) ─
//
// Every INTERACTIVE tail step renders as a structured MCP state with its own
// answer field (the schema's tail family fields) instead of the S8 generic
// "later milestone" choice. The vocabulary is tail/flow.ts's — tailViewForStep
// builds the options, applyTailInput records the prefs, and the answer routing
// below mirrors the android TUI's onChange handlers step-for-step
// (android/ui/app.tsx ~L3062-3470), so the MCP and the TUI cannot drift.
//
// PARKING: the MCP mirrors the TUI's React `step` state in the session's
// tailParked (session-state.ts) — set on every interactive tail render,
// consumed by the strict tail gate + the decide loops, cleared when the answer
// is applied. Without it a re-render would drift forward through the resume
// router and collapse past consent gates (preview-workflow-file →
// writing-workflow-file). A server restart loses the park; the frozen
// tailResumeStep contract then takes over.

/** The interactive tail steps the MCP renders structurally (and parks on). */
const MCP_TAIL_INTERACTIVE_STEPS = new Set<string>([
  'ci-secrets-setup',
  'ci-secrets-target-select',
  'ask-ci-secrets',
  'confirm-ci-secret-overwrite',
  'confirm-secrets-push',
  'ci-secrets-failed',
  'ask-github-actions-setup',
  'ask-export-env',
  'confirm-env-export-overwrite',
  'pick-package-manager',
  'pick-build-script',
  'pick-build-script-custom',
  'preview-workflow-file',
])

/**
 * The session-parked interactive tail step, if any. Only honored while the
 * slim tail progress proves the tail is actually in flight (credentialsSaved)
 * — a stale park from an abandoned run can never hijack a fresh onboarding.
 */
function mcpTailParkedStep(appId: string, progress: { completedSteps?: { credentialsSaved?: unknown } } | null): string | null {
  if (!progress?.completedSteps?.credentialsSaved)
    return null
  const parked = getSession(appId).tailParked
  if (parked && MCP_TAIL_INTERACTIVE_STEPS.has(parked.step))
    return parked.step
  return null
}

/**
 * Apply a validated tail answer: record the pref via the shared applyTailInput
 * reducer (the exact TUI write) and resolve the explicit next step from the
 * android TUI's onChange routing (app.tsx ~L3062-3470 — the [DIVERGE]
 * driver-routed branches are reproduced verbatim; the engine-derived [MATCH]
 * branches land on the same step the resume router would pick). Returns the
 * (possibly) updated progress and the forced next step.
 */
function applyMcpTailAnswer<P extends TailEffectProgress>(
  step: string,
  input: OnboardingInput,
  progress: P,
  parked: TailParkedState | undefined,
): { progress: P, next: string } {
  switch (step) {
    // retry re-runs the read-only detection; skip ends the tail.
    case 'ci-secrets-setup':
      return { progress, next: input.ciSecretAction === 'retry' ? 'detecting-ci-secrets' : 'build-complete' }

    case 'ci-secrets-target-select': {
      if (input.ciSecretAction === 'skip')
        return { progress, next: 'build-complete' }
      const target = (parked?.ciSecretTargets ?? []).find(t => t.provider === input.ciSecretAction) ?? null
      if (!target) {
        // Park lost (restart) — self-heal through the idempotent re-detection
        // instead of fabricating a target the discovery never produced.
        return { progress, next: 'detecting-ci-secrets' }
      }
      const next = applyTailInput('ci-secrets-target-select', progress, { step: 'ci-secrets-target-select', ciSecretTarget: target })
      // TUI fan-out: github → the 3-option GH Actions prompt; gitlab → the
      // legacy 2-option ask-ci-secrets flow.
      return { progress: next, next: target.provider === 'github' ? 'ask-github-actions-setup' : 'ask-ci-secrets' }
    }

    case 'ask-ci-secrets':
      return { progress, next: input.ciSecretAction === 'yes' ? 'checking-ci-secrets' : 'build-complete' }

    case 'confirm-ci-secret-overwrite':
      return { progress, next: input.ciSecretAction === 'replace' ? 'uploading-ci-secrets' : 'build-complete' }

    case 'confirm-secrets-push':
      return { progress, next: input.ciSecretAction === 'confirm' ? 'uploading-ci-secrets' : 'build-complete' }

    case 'ci-secrets-failed': {
      if (input.ciSecretAction !== 'retry')
        return { progress, next: 'build-complete' }
      // Retry re-checks when a destination is already chosen, else re-detects.
      return { progress, next: progress.ciSecretTarget ? 'checking-ci-secrets' : 'detecting-ci-secrets' }
    }

    case 'ask-github-actions-setup': {
      // Option value 'no' maps to the persisted setupMode 'declined'.
      const mode = input.githubActionsSetup === 'no' ? 'declined' : input.githubActionsSetup!
      const next = applyTailInput('ask-github-actions-setup', progress, { step: 'ask-github-actions-setup', value: mode })
      return { progress: next, next: mode === 'declined' ? 'ask-export-env' : 'checking-ci-secrets' }
    }

    case 'ask-export-env': {
      if (input.exportEnvAction !== 'yes')
        return { progress, next: 'build-complete' }
      // Record the custom path when given; otherwise leave it unset — the
      // exporting-env effect falls back to deps.defaultExportPath (the path
      // the prompt surfaced).
      const next = input.envExportPath
        ? applyTailInput('ask-export-env', progress, { step: 'ask-export-env', value: 'yes', envExportTargetPath: input.envExportPath })
        : progress
      return { progress: next, next: 'exporting-env' }
    }

    case 'confirm-env-export-overwrite':
      return { progress, next: input.exportEnvAction === 'replace' ? 'overwrite-and-export-env' : 'build-complete' }

    case 'pick-package-manager': {
      const next = applyTailInput('pick-package-manager', progress, { step: 'pick-package-manager', selectedPackageManager: input.packageManager! })
      return { progress: next, next: 'pick-build-script' }
    }

    case 'pick-build-script': {
      if (input.buildScript === '__custom__')
        return { progress, next: 'pick-build-script-custom' }
      const choice = input.buildScript === '__skip__'
        ? { type: 'skip' as const }
        : { type: 'npm-script' as const, name: input.buildScript! }
      const next = applyTailInput('pick-build-script', progress, { step: 'pick-build-script', buildScriptChoice: choice })
      // TUI parity: the preview CONFIRM gate comes before any file write.
      return { progress: next, next: 'preview-workflow-file' }
    }

    case 'pick-build-script-custom': {
      const next = applyTailInput('pick-build-script-custom', progress, { step: 'pick-build-script-custom', command: input.buildScriptCustom! })
      return { progress: next, next: 'preview-workflow-file' }
    }

    case 'preview-workflow-file': {
      if (input.workflowFileAction === 'write')
        return { progress, next: 'writing-workflow-file' }
      if (input.workflowFileAction === 'view') {
        // 'view' never advances: the preview re-parks with the proposed file
        // text in context (the MCP's flattening of the TUI's fullscreen
        // view-workflow-diff takeover).
        return { progress, next: 'preview-workflow-file' }
      }
      return { progress, next: 'build-complete' }
    }

    default:
      return { progress, next: step }
  }
}

/** The non-secret tail render deps a platform driver hands to renderTailStep. */
interface TailRenderDeps {
  defaultExportPath?: (appId: string, platform: 'ios' | 'android') => string
  generateWorkflow?: IosEffectDeps['generateWorkflow']
}

/**
 * Map a neutral tail view to the structured MCP result for its step — the
 * tail's mirror of the bespoke cases in mapAndroidView/mapIosView. Options come
 * from tailViewForStep verbatim; `next.with` names the step's answer field;
 * `context` surfaces NAMES/labels only (secret key NAMES, repo label, advice
 * commands, the proposed workflow YAML — never credential values).
 */
function mapTailView(
  step: string,
  platform: Platform,
  appId: string,
  progress: TailEffectProgress,
  viewCtx: TailStepCtx & { ciSecretError?: string, ciSecretExistingKeys?: string[] },
  renderDeps: TailRenderDeps,
): NextStepResult {
  const view = tailViewForStep(step as TailStep, progress, viewCtx)
  const progressValue = (platform === 'android' ? ANDROID_STEP_PROGRESS[step as AndroidOnboardingStep] : STEP_PROGRESS[step as OnboardingStep]) ?? 85
  const options: ChoiceOption[] = (view.options ?? []).map(o => ({ value: o.value, label: o.label, note: o.note }))
  const base = {
    onboarding: 'capgo-builder' as const,
    phase: 'credentials' as const,
    platform,
    state: step,
    progress: progressValue,
    kind: 'choice' as const,
    options,
    rules: ONBOARDING_RULES,
  }
  const entries = getSession(appId).tailCarried.ciSecretEntries ?? []
  const secretKeyNames = entries.map(e => e.key)

  switch (step) {
    case 'ci-secrets-setup': {
      const advice = viewCtx.ciSecretSetupAdvice ?? []
      return {
        ...base,
        summary: `${view.title ?? 'Set up your git hosting CLI to upload env vars'} — the CLI was found but is not ready yet (see context.setupAdvice for the exact commands). Credentials are already saved; this only affects the CI secret upload.`,
        ...(advice.length > 0 ? { context: { setupAdvice: advice } } : {}),
        next: {
          tool: NEXT_STEP_TOOL,
          with: { ciSecretAction: '<retry|skip>' },
          instruction: 'Show the user the setup commands from context.setupAdvice. After they installed/logged in, call next_step with ciSecretAction "retry" to re-detect; or "skip" to finish without uploading.',
          call: `${NEXT_STEP_TOOL}({ ciSecretAction: "retry" })`,
        },
      }
    }

    case 'ci-secrets-target-select':
      return {
        ...base,
        summary: view.prompt ?? 'Where should Capgo upload the build env vars?',
        next: {
          tool: NEXT_STEP_TOOL,
          with: { ciSecretAction: `<${options.map(o => o.value).join('|')}>` },
          instruction: 'Present the detected destinations to the user, then call next_step with ciSecretAction set to the chosen option\'s value ("skip" uploads nothing).',
          call: `${NEXT_STEP_TOOL}({ ciSecretAction: "${options[0]?.value ?? 'skip'}" })`,
        },
      }

    case 'ask-ci-secrets':
      return {
        ...base,
        summary: view.prompt ?? 'Upload the build env vars?',
        context: { secretKeys: secretKeyNames },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { ciSecretAction: '<yes|no>' },
          instruction: 'Ask the user whether to upload the listed env vars (context.secretKeys — names only), then call next_step with ciSecretAction.',
          call: `${NEXT_STEP_TOOL}({ ciSecretAction: "yes" })`,
        },
      }

    case 'confirm-ci-secret-overwrite': {
      const existing = viewCtx.ciSecretExistingKeys ?? []
      return {
        ...base,
        summary: view.prompt ?? 'These env vars already exist and will be replaced:',
        context: { existingKeys: existing },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { ciSecretAction: '<replace|skip>' },
          instruction: 'Show the user the existing env var NAMES (context.existingKeys). Replacing overwrites them irreversibly — ask before proceeding, then call next_step with ciSecretAction.',
          call: `${NEXT_STEP_TOOL}({ ciSecretAction: "replace" })`,
        },
      }
    }

    case 'confirm-secrets-push': {
      const existingSet = new Set(viewCtx.ciSecretExistingKeys ?? [])
      const repo = viewCtx.ciSecretRepoLabel ?? 'the repository'
      return {
        ...base,
        summary: view.prompt ?? `Confirm before pushing secrets to ${repo}`,
        context: {
          repository: repo,
          secretKeys: secretKeyNames.map(key => ({ name: key, status: existingSet.has(key) ? 'REPLACE' : 'NEW' })),
        },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { ciSecretAction: '<confirm|cancel>' },
          instruction: `Show the user the repository (${repo}) and the secret NAMES that will be pushed (context.secretKeys; REPLACE entries overwrite silently and cannot be recovered). Then call next_step with ciSecretAction "confirm" to push, or "cancel".`,
          call: `${NEXT_STEP_TOOL}({ ciSecretAction: "confirm" })`,
        },
      }
    }

    case 'ci-secrets-failed':
      return {
        ...base,
        summary: `Could not upload env vars${viewCtx.ciSecretError ? `: ${viewCtx.ciSecretError}` : '.'} Your credentials are already saved — only the CI upload failed.`,
        ...(viewCtx.ciSecretError ? { context: { error: viewCtx.ciSecretError } } : {}),
        next: {
          tool: NEXT_STEP_TOOL,
          with: { ciSecretAction: '<retry|continue>' },
          instruction: 'Show the user the upload error, then call next_step with ciSecretAction "retry" to try again, or "continue" to finish without uploading.',
          call: `${NEXT_STEP_TOOL}({ ciSecretAction: "retry" })`,
        },
      }

    case 'ask-github-actions-setup':
      return {
        ...base,
        summary: `${view.prompt ?? 'Set up GitHub Actions for you?'} Capgo can push the ${secretKeyNames.length} build env var${secretKeyNames.length === 1 ? '' : 's'} as repository secrets and drop a ${WORKFLOW_FILE_PATH} you can dispatch manually.`,
        next: {
          tool: NEXT_STEP_TOOL,
          with: { githubActionsSetup: '<with-workflow|secrets-only|no>' },
          instruction: 'Present the three options to the user, then call next_step with githubActionsSetup: "with-workflow" (secrets + workflow file), "secrets-only", or "no" (offers a local .env export instead).',
          call: `${NEXT_STEP_TOOL}({ githubActionsSetup: "with-workflow" })`,
        },
      }

    case 'ask-export-env': {
      const defaultPath = renderDeps.defaultExportPath?.(appId, platform) ?? viewCtx.defaultEnvExportPath
      return {
        ...base,
        summary: `${view.prompt ?? 'Export the credentials as a .env file instead?'}${defaultPath ? ` Default path: ${defaultPath}.` : ''} The file is written locally with 0600 permissions — never commit it.`,
        ...(defaultPath ? { context: { defaultPath } } : {}),
        next: {
          tool: NEXT_STEP_TOOL,
          with: { exportEnvAction: '<yes|no>', envExportPath: '<optional custom path with "yes">' },
          instruction: `Ask the user. To write the .env file call next_step with exportEnvAction "yes"${defaultPath ? ` (defaults to ${defaultPath}; add envExportPath for a custom location)` : ' (add envExportPath for a custom location)'}; "no" finishes without exporting.`,
          call: `${NEXT_STEP_TOOL}({ exportEnvAction: "yes" })`,
        },
      }
    }

    case 'confirm-env-export-overwrite': {
      const path = progress.envExportTargetPath ?? viewCtx.defaultEnvExportPath ?? 'the file'
      return {
        ...base,
        summary: view.prompt ?? `${path} already exists. Replace it with a fresh export, or skip?`,
        context: { path },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { exportEnvAction: '<replace|skip>' },
          instruction: 'The target .env file already exists. Ask the user, then call next_step with exportEnvAction "replace" to overwrite it, or "skip" to keep the existing file.',
          call: `${NEXT_STEP_TOOL}({ exportEnvAction: "replace" })`,
        },
      }
    }

    case 'pick-package-manager':
      return {
        ...base,
        summary: `${view.prompt ?? 'Which package manager does this project use?'} It drives the install + build steps in the generated workflow.`,
        next: {
          tool: NEXT_STEP_TOOL,
          with: { packageManager: '<bun|npm|pnpm|yarn>' },
          instruction: 'Ask the user which package manager the project uses, then call next_step with packageManager.',
          call: `${NEXT_STEP_TOOL}({ packageManager: "npm" })`,
        },
      }

    case 'pick-build-script': {
      const scriptValues = options.map(o => o.value)
      return {
        ...base,
        summary: `${view.prompt ?? 'Which script builds your web assets?'} The workflow runs it before \`capgo build request\`.`,
        next: {
          tool: NEXT_STEP_TOOL,
          with: { buildScript: `<${scriptValues.join('|')}>` },
          instruction: 'Present the script options to the user, then call next_step with buildScript set to the chosen value — a listed script name, "__custom__" to type a custom command, or "__skip__" when the app needs no build step.',
          call: `${NEXT_STEP_TOOL}({ buildScript: "${scriptValues.find(v => v !== '__custom__' && v !== '__skip__') ?? '__custom__'}" })`,
        },
      }
    }

    case 'pick-build-script-custom':
      return {
        ...base,
        kind: 'human_gate',
        options: undefined,
        summary: view.prompt ?? 'Custom build command',
        collect: [{ field: 'buildScriptCustom', desc: 'The exact command the workflow runs to build the web assets (e.g. "make web")' }],
        human: { instruction: 'Ask the user for the exact build command the workflow should run before `capgo build request` (e.g. "make web", "bash scripts/build.sh").' },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { buildScriptCustom: '<command>' },
          instruction: 'Collect the custom build command from the user, then call next_step with buildScriptCustom.',
          call: `${NEXT_STEP_TOOL}({ buildScriptCustom: "make web" })`,
        },
      }

    case 'preview-workflow-file': {
      // The proposed file content (non-secret: it references secret NAMES via
      // ${{ secrets.X }} only). Pure + best-effort: an absent dep or a thrown
      // generator just omits the preview text.
      let workflowContent: string | undefined
      let workflowPath = WORKFLOW_FILE_PATH
      if (renderDeps.generateWorkflow && progress.buildScriptChoice) {
        try {
          const generated = renderDeps.generateWorkflow({
            appId,
            defaultPlatform: platform,
            packageManager: progress.selectedPackageManager ?? 'npm',
            buildScript: progress.buildScriptChoice,
            secretKeys: secretKeyNames,
          })
          workflowContent = generated.content
          workflowPath = generated.path
        }
        catch {
          // Best-effort preview — the write step regenerates from the same opts.
        }
      }
      return {
        ...base,
        summary: view.prompt ?? `What should we do with ${workflowPath}?`,
        context: { workflowPath, ...(workflowContent ? { workflowContent } : {}) },
        next: {
          tool: NEXT_STEP_TOOL,
          with: { workflowFileAction: '<write|view|cancel>' },
          instruction: 'Show the user the proposed workflow file (context.workflowContent). Then call next_step with workflowFileAction: "write" to write it, "view" to get the file text again, or "cancel" to finish without writing.',
          call: `${NEXT_STEP_TOOL}({ workflowFileAction: "write" })`,
        },
      }
    }

    default:
      return {
        ...base,
        summary: view.prompt ?? view.title ?? view.message ?? `Capgo setup: ${step}`,
        next: {
          tool: NEXT_STEP_TOOL,
          instruction: 'Present the options to the user, then call next_step with the step\'s answer field.',
          call: `${NEXT_STEP_TOOL}({})`,
        },
      }
  }
}

/** The generated workflow's repo-relative path (workflow-generator's constant, inlined to avoid an import cycle risk). */
const WORKFLOW_FILE_PATH = '.github/workflows/capgo-build.yml'

/**
 * Render (and PARK) an interactive tail step. Merges the invocation's fresh
 * effect transients over the previously parked view context (so a corrective
 * re-render in a later call still has the option inventories), persists the
 * park, and returns the structured mapping. Secrets never enter the park:
 * every field is an option inventory / label / advice text.
 */
function renderTailStep(
  platform: Platform,
  appId: string,
  step: string,
  progress: TailEffectProgress,
  invocationCtx: Record<string, unknown>,
  renderDeps: TailRenderDeps,
): NextStepResult {
  const parked = getSession(appId).tailParked
  const carried = getSession(appId).tailCarried
  const pick = <T>(key: string): T | undefined =>
    (invocationCtx[key] !== undefined ? invocationCtx[key] : (parked as Record<string, unknown> | undefined)?.[key]) as T | undefined
  const viewCtx: TailStepCtx & { ciSecretError?: string, ciSecretExistingKeys?: string[] } = {
    ciSecretTargets: pick('ciSecretTargets'),
    ciSecretSetupAdvice: pick('ciSecretSetupAdvice'),
    ciSecretRepoLabel: pick('ciSecretRepoLabel'),
    ciSecretError: pick('ciSecretError'),
    availableScripts: pick('availableScripts'),
    recommendedScript: pick('recommendedScript'),
    ciSecretEntries: carried.ciSecretEntries,
    ciSecretExistingKeys: (invocationCtx.ciSecretExistingKeys as string[] | undefined) ?? carried.ciSecretExistingKeys,
    defaultEnvExportPath: renderDeps.defaultExportPath?.(appId, platform),
  }
  setTailParked(appId, {
    step,
    ...(viewCtx.ciSecretTargets ? { ciSecretTargets: viewCtx.ciSecretTargets } : {}),
    ...(viewCtx.ciSecretSetupAdvice ? { ciSecretSetupAdvice: viewCtx.ciSecretSetupAdvice } : {}),
    ...(viewCtx.ciSecretRepoLabel !== undefined ? { ciSecretRepoLabel: viewCtx.ciSecretRepoLabel } : {}),
    ...(viewCtx.ciSecretError ? { ciSecretError: viewCtx.ciSecretError } : {}),
    ...(viewCtx.availableScripts ? { availableScripts: viewCtx.availableScripts } : {}),
    ...(viewCtx.recommendedScript !== undefined ? { recommendedScript: viewCtx.recommendedScript } : {}),
  })
  return mapTailView(step, platform, appId, progress, viewCtx, renderDeps)
}

export async function decideAdvance(
  facts: PreflightFacts,
  progress: OnboardingProgress | null,
  input: OnboardingInput | undefined,
  deps: EngineDeps,
): Promise<NextStepResult> {
  // Thread a verify-app gate answer (or an S6b recovery answer — cert-limit /
  // duplicate-profile / error screen — or an S12 ephemeral import pick) into
  // the iOS driver. All validated upstream by the strict iOS step gate in
  // drive(). The PERSISTED import forks (setupMethod / importDistribution)
  // are applied in drive() via persistIosImportForkInput, not threaded here.
  const iosOpts = (input && (
    input.verifyAction !== undefined
    || input.certToRevoke !== undefined
    || input.duplicateProfileAction !== undefined
    || input.errorAction !== undefined
    || input.identityChoice !== undefined
    || input.profileChoice !== undefined
    || input.importRecoveryAction !== undefined
    || input.portalAction !== undefined
    || input.profilePath !== undefined
    || input.exportConfirm !== undefined
  ))
    ? {
        verifyAction: input.verifyAction,
        verifyAppId: input.verifyAppId,
        certToRevoke: input.certToRevoke,
        duplicateProfileAction: input.duplicateProfileAction,
        errorAction: input.errorAction,
        identityChoice: input.identityChoice,
        profileChoice: input.profileChoice,
        importRecoveryAction: input.importRecoveryAction,
        portalAction: input.portalAction,
        profilePath: input.profilePath,
        exportConfirm: input.exportConfirm,
      }
    : undefined
  if (input?.platform === 'ios' || input?.platform === 'android') {
    if (!facts.authenticated)
      return decideStart(facts, progress, deps)
    if (!facts.platformsDetected.includes(input.platform))
      return decideStart(facts, progress, deps)
    if (!facts.appRegistered)
      return decideStart(facts, progress, deps)
    if (input.platform === 'android')
      return decideAndroid(facts, deps)
    return decideIos(facts, deps, iosOpts)
  }
  // No platform supplied → resume the active flow if one exists, so a mid-flow
  // next_step that omits `platform` does not bounce back to platform-select.
  const active = activePlatform(facts)
  if (active === 'android')
    return decideAndroid(facts, deps)
  if (active === 'ios')
    return decideIos(facts, deps, iosOpts)
  return decideStart(facts, progress, deps)
}

export interface EngineDeps {
  cwd: string
  hasSavedKey: () => boolean
  getAppId: () => Promise<string | undefined>
  detectPlatforms: () => Promise<Platform[]>
  isAppRegistered: (appId: string) => Promise<boolean>
  loadProgress: (appId: string) => Promise<OnboardingProgress | null>
  registerApp: (appId: string) => Promise<{ ok: true } | { ok: false, alreadyExists: boolean, error: string }>
  loadAndroidProgress: (appId: string) => Promise<AndroidOnboardingProgress | null>
  readBuildRecord: (path: string) => Promise<BuildOutputRecord | null>
  buildRecordPath: (appId: string, platform: Platform) => string
  /**
   * The shared iOS flow engine's IO deps (Apple API / CSR / fs / persistence),
   * pre-bound by the driver (buildIosEffectDeps in onboarding-tools.ts for
   * production; canned fakes in tests). decideIos threads the per-app carried
   * session state in on every effect run. Optional so legacy fixtures that
   * never enter the iOS path keep working — a missing helper inside surfaces
   * as a caught effect error, never a crash.
   */
  iosEffectDeps?: IosEffectDeps
  androidEffectDeps: AndroidEffectDeps
  /** Returns true when the current host can launch Terminal.app (macOS). Injectable for tests. */
  canLaunchTerminal: () => boolean
  /** Launch `command` in a new macOS Terminal.app window. Injectable for tests. */
  launchBuildInTerminal: (command: string) => Promise<{ ok: true } | { ok: false, error: string }>
  /**
   * Optional injectable OAuth session registry for testing. When provided, the
   * engine uses these instead of the module-level functions in oauth-session.ts.
   * Production builds omit this and rely on the module-level registry.
   */
  oauthSession?: {
    begin: typeof beginOAuthSession
    poll: typeof pollOAuthSession
    clear: typeof clearOAuthSession
  }
  /**
   * Write the generated/loaded Android keystore (.p12) to a file on disk so the
   * user has a durable copy after onboarding. Called once when the keystore phase
   * completes. Returns the absolute path of the written file.
   *
   * Optional — when omitted the keystore is kept in progress only (no file written).
   * Omitting does not break the flow; the keystore data is always in _keystoreBase64.
   */
  writeKeystoreFile?: (appId: string, base64: string, alias: string) => Promise<string>
}

export async function gatherFacts(deps: EngineDeps): Promise<PreflightFacts> {
  const appId = await deps.getAppId()
  const authenticated = deps.hasSavedKey()

  if (!appId)
    return { capacitorProject: false, appId: undefined, platformsDetected: [], authenticated, appRegistered: false, androidProgress: null, iosProgress: null }

  const platformsDetected = await deps.detectPlatforms()
  const appRegistered = authenticated ? await deps.isAppRegistered(appId) : false
  const androidProgress = await deps.loadAndroidProgress(appId)
  const iosProgress = await deps.loadProgress(appId)
  return { capacitorProject: true, appId, platformsDetected, authenticated, appRegistered, androidProgress, iosProgress }
}

const MAX_AUTO_STEPS = 8

function appConflictResult(appId: string): NextStepResult {
  return {
    onboarding: 'capgo-builder', phase: 'app', state: 'app-id-conflict', progress: 8, kind: 'human_gate',
    summary: `The app id "${appId}" already exists and is not in your account. You will need a different app id.`,
    human: {
      instruction: `Choose a different app id (it must match your capacitor.config). Suggestions: ${buildAppIdConflictSuggestions(appId).slice(0, 4).join(', ')}. Update capacitor.config, then continue. (Automatic rename lands in a later milestone.)`,
    },
    next: {
      tool: 'capgo_builder_onboarding_next_step',
      instruction: 'After the user updates their app id in capacitor.config, call next_step (no arguments).',
      call: 'capgo_builder_onboarding_next_step({})',
    },
    rules: ONBOARDING_RULES,
  }
}

async function persistAndroidInput(deps: EngineDeps, appId: string, input: OnboardingInput): Promise<void> {
  // Seed an empty progress when there is none yet — the keystore inputs arrive
  // before any progress exists (the user is on the very first keystore step).
  const progressRaw = await deps.androidEffectDeps.loadAndroidProgress(appId)
    ?? {
      platform: 'android' as const,
      appId,
      activePlatform: 'android' as const,
      startedAt: new Date().toISOString(),
      completedSteps: {},
    }

  let updated = progressRaw

  // Data-safety gate answer (credentials-exist). 'backup' parks resume on
  // backing-up (the copy effect runs next); 'cancel' halts onboarding. Applied
  // first so it gates everything that follows.
  if (input.credentialsExistChoice) {
    updated = applyAndroidInput('credentials-exist', updated, {
      step: 'credentials-exist',
      value: input.credentialsExistChoice,
    })
  }
  if (input.serviceAccountMethod) {
    updated = applyAndroidInput('service-account-method-select', updated, {
      step: 'service-account-method-select',
      value: input.serviceAccountMethod,
    })
  }

  if (input.playDeveloperId) {
    updated = applyAndroidInput('play-developer-id-input', updated, {
      step: 'play-developer-id-input',
      rawDeveloperIdOrUrl: input.playDeveloperId,
    })
  }

  if (input.gcpProjectName) {
    updated = applyAndroidInput('gcp-project-create-name', updated, {
      step: 'gcp-project-create-name',
      displayName: input.gcpProjectName,
    })
  }

  if (input.gcpProjectId && input.gcpProjectId !== '__new__') {
    updated = applyAndroidInput('gcp-projects-select', updated, {
      step: 'gcp-projects-select',
      gcpProject: { projectId: input.gcpProjectId, name: input.gcpProjectId },
    })
  }

  if (input.androidPackage) {
    updated = applyAndroidInput('android-package-select', updated, {
      step: 'android-package-select',
      packageName: input.androidPackage,
      source: 'user-input',
      serviceAccountMethod: updated.serviceAccountMethod ?? 'generate',
    })
  }

  if (input.serviceAccountJsonPath) {
    updated = applyAndroidInput('sa-json-existing-path', updated, {
      step: 'sa-json-existing-path',
      path: input.serviceAccountJsonPath,
    })
  }

  if (input.saMethodChoice) {
    if (input.saMethodChoice === 'retry' || input.saMethodChoice === 'oauth') {
      updated = applyAndroidInput('sa-json-validation-failed', updated, {
        step: 'sa-json-validation-failed',
        value: input.saMethodChoice,
      })
    }
    else if (input.saMethodChoice === 'save-anyway') {
      const saPath = updated.serviceAccountJsonPath
      if (saPath) {
        const bytes = await deps.androidEffectDeps.readFile(saPath)
        const base64 = bytes.toString('base64')
        updated = applyAndroidInput('sa-json-validation-failed', updated, {
          step: 'sa-json-validation-failed',
          value: 'save-anyway',
          serviceAccountKeyBase64: base64,
        })
      }
    }
  }

  // ── Keystore inputs ──────────────────────────────────────────────────────

  if (input.keystoreMethod) {
    updated = applyAndroidInput('keystore-method-select', updated, {
      step: 'keystore-method-select',
      value: input.keystoreMethod,
    })
  }

  if (input.keystorePath) {
    updated = applyAndroidInput('keystore-existing-path', updated, {
      step: 'keystore-existing-path',
      path: input.keystorePath,
    })
  }

  if (input.keystoreNewAlias) {
    updated = applyAndroidInput('keystore-new-alias', updated, {
      step: 'keystore-new-alias',
      alias: input.keystoreNewAlias,
    })
  }

  if (input.keystorePasswordMethod) {
    updated = applyAndroidInput('keystore-new-password-method', updated, {
      step: 'keystore-new-password-method',
      value: input.keystorePasswordMethod,
    })
  }

  if (input.keystoreCommonName !== undefined && input.keystoreCommonName !== null) {
    updated = applyAndroidInput('keystore-new-cn', updated, {
      step: 'keystore-new-cn',
      cn: input.keystoreCommonName,
    })
  }

  if (input.keystoreAlias) {
    // Resolve which step to apply: alias-select if the current resume step is that, else alias input
    const currentStep = getAndroidResumeStep(updated)
    const aliasStep: 'keystore-existing-alias-select' | 'keystore-existing-alias' =
      currentStep === 'keystore-existing-alias-select'
        ? 'keystore-existing-alias-select'
        : 'keystore-existing-alias'
    updated = applyAndroidInput(aliasStep, updated, {
      step: aliasStep,
      alias: input.keystoreAlias,
    })
  }

  if (input.keystoreStorePassword !== undefined && input.keystoreStorePassword !== null) {
    // Route to existing or new sub-flow based on keystoreMethod
    const storePasswordStep: 'keystore-existing-store-password' | 'keystore-new-store-password' =
      updated.keystoreMethod === 'existing'
        ? 'keystore-existing-store-password'
        : 'keystore-new-store-password'
    updated = applyAndroidInput(storePasswordStep, updated, {
      step: storePasswordStep,
      password: input.keystoreStorePassword,
    })
  }

  if (input.keystoreKeyPassword !== undefined) {
    // Route to existing or new sub-flow based on keystoreMethod
    const keyPasswordStep: 'keystore-existing-key-password' | 'keystore-new-key-password' =
      updated.keystoreMethod === 'existing'
        ? 'keystore-existing-key-password'
        : 'keystore-new-key-password'
    updated = applyAndroidInput(keyPasswordStep, updated, {
      step: keyPasswordStep,
      password: input.keystoreKeyPassword,
    })
  }

  if (updated !== progressRaw) {
    await deps.androidEffectDeps.saveAndroidProgress(appId, updated)
  }
}

/**
 * Apply the ASC API key trio from the single 'ios-api-key' MCP gate (or the
 * ios-credentials-failed re-collect gate) to the persisted iOS progress.
 *
 * Routes each field through the SAME pure reducers the TUI input chain uses
 * (applyIosInput 'input-p8-path' / 'input-key-id' / 'input-issuer-id') so the
 * persisted progress is byte-identical to a TUI run — the resume routing
 * (getIosResumeStep) then lands on verifying-key exactly as it does for the
 * wizard. The create-new fork is persisted on first touch (the MCP only drives
 * create-new in this slice; the import fork is a later slice).
 *
 * Also buffers the .p8 bytes into the per-app session (the headless mirror of
 * the TUI's p8ContentRef) so verifying-key and the saving-credentials
 * APPLE_KEY_CONTENT write get them without a re-read. Best-effort: a missing/
 * unreadable file is NOT an error here — verifying-key's resolveP8Content
 * retries from p8Path and surfaces the failure with a clear message.
 */
async function persistIosApiKeyInput(deps: EngineDeps, appId: string, input: OnboardingInput): Promise<void> {
  const ios = deps.iosEffectDeps
  const loadIosProgress = ios?.loadProgress ?? deps.loadProgress
  const progressRaw: OnboardingProgress = (await loadIosProgress(appId)) ?? {
    platform: 'ios',
    appId,
    startedAt: new Date().toISOString(),
    completedSteps: {},
  }

  let updated = progressRaw
  if (!updated.setupMethod)
    updated = applyIosInput('setup-method-select', updated, { step: 'setup-method-select', value: 'create' })
  if (input.p8Path)
    updated = applyIosInput('input-p8-path', updated, { step: 'input-p8-path', value: input.p8Path })
  if (input.keyId)
    updated = applyIosInput('input-key-id', updated, { step: 'input-key-id', value: input.keyId })
  if (input.issuerId)
    updated = applyIosInput('input-issuer-id', updated, { step: 'input-issuer-id', value: input.issuerId })

  if (updated !== progressRaw)
    await ios?.saveProgress?.(appId, updated)

  if (input.p8Path && ios?.readFile) {
    try {
      mergeIosCarried(appId, { p8Content: await ios.readFile(input.p8Path) })
    }
    catch {
      // Unreadable .p8 — verifying-key re-reads from p8Path and reports.
    }
  }
}

/**
 * S12: apply the PERSISTED import-fork answers (setupMethod from the
 * setup-method-select choice; importDistribution — incl. the '__cancel__'
 * switch-to-create-new escape — from import-distribution-mode) through the
 * SAME pure reducers the TUI's onChange handlers use (applyIosInput), so the
 * persisted progress is byte-identical to a TUI run and the resume routing
 * (getIosResumeStep / getImportEntryStep) takes over from there. The MCP
 * setupMethod vocabulary IS the persisted one ('create-new'/'import-existing');
 * the reducer's input vocabulary is the TUI Select's ('create'/'import').
 */
async function persistIosImportForkInput(deps: EngineDeps, appId: string, input: OnboardingInput): Promise<void> {
  const ios = deps.iosEffectDeps
  const loadIosProgress = ios?.loadProgress ?? deps.loadProgress
  const progressRaw: OnboardingProgress = (await loadIosProgress(appId)) ?? {
    platform: 'ios',
    appId,
    startedAt: new Date().toISOString(),
    completedSteps: {},
  }

  let updated = progressRaw
  if (input.setupMethod !== undefined) {
    updated = applyIosInput('setup-method-select', updated, {
      step: 'setup-method-select',
      value: input.setupMethod === 'import-existing' ? 'import' : 'create',
    })
  }
  if (input.importDistribution !== undefined) {
    updated = applyIosInput('import-distribution-mode', updated, {
      step: 'import-distribution-mode',
      value: input.importDistribution,
    })
  }

  if (updated !== progressRaw)
    await ios?.saveProgress?.(appId, updated)
}

async function executeAuto(result: NextStepResult, facts: PreflightFacts, deps: EngineDeps): Promise<NextStepResult | null> {
  if (result.state === 'registering-app' && facts.appId) {
    const reg = await deps.registerApp(facts.appId)
    if (reg.ok)
      return null
    if (reg.alreadyExists)
      return appConflictResult(facts.appId)
    return {
      onboarding: 'capgo-builder', phase: 'app', state: 'register-app-failed', progress: 8, kind: 'error',
      summary: `Could not register "${facts.appId}" in Capgo: ${reg.error}`,
      rules: ONBOARDING_RULES,
    }
  }
  return result
}

function buildLaunchedResult(platform: Platform, command: string, recordPath: string): NextStepResult {
  return {
    onboarding: 'capgo-builder', phase: 'build', state: 'build-launched', platform, progress: 92, kind: 'human_gate',
    summary: 'I started your first cloud build in a new Terminal window — it takes a few minutes and won\'t block me.',
    context: { command, recordPath },
    human: {
      instruction: 'A Terminal window is now running your build. When it finishes, tell me to continue and I\'ll fetch the result.',
    },
    next: {
      tool: NEXT_STEP_TOOL,
      with: { checkBuild: true, platform },
      instruction: `When the Terminal build finishes, call next_step({ checkBuild: true, platform: "${platform}" }).`,
      call: `${NEXT_STEP_TOOL}({ checkBuild: true, platform: "${platform}" })`,
    },
    rules: ONBOARDING_RULES,
  }
}

function buildHandoffResult(platform: Platform, command: string, recordPath: string): NextStepResult {
  return {
    onboarding: 'capgo-builder', phase: 'build', state: 'build-run-handoff', platform, progress: 92, kind: 'human_gate',
    summary: 'Time to run your first cloud build — it takes a few minutes and runs in your terminal, so it won\'t block me.',
    context: { command, recordPath },
    human: {
      instruction: `Run this in your terminal:\n\n${command}\n\nIt builds in the cloud and writes the result to a file. When it finishes, tell me to continue.`,
    },
    next: {
      tool: NEXT_STEP_TOOL,
      with: { checkBuild: true, platform },
      instruction: `After the build command finishes, call next_step({ checkBuild: true, platform: "${platform}" }) so I can read the result.`,
      call: `${NEXT_STEP_TOOL}({ checkBuild: true, platform: "${platform}" })`,
    },
    rules: ONBOARDING_RULES,
  }
}

function buildWaitingResult(platform: Platform): NextStepResult {
  return {
    onboarding: 'capgo-builder', phase: 'build', state: 'build-waiting', platform, progress: 95, kind: 'human_gate',
    summary: 'I don\'t see the build result yet.',
    human: {
      instruction: 'Has the build command finished? If you haven\'t run it yet, run it now; once it completes, tell me to continue.',
    },
    next: {
      tool: NEXT_STEP_TOOL,
      with: { checkBuild: true, platform },
      instruction: `When the build command has finished, call next_step({ checkBuild: true, platform: "${platform}" }).`,
      call: `${NEXT_STEP_TOOL}({ checkBuild: true, platform: "${platform}" })`,
    },
    rules: ONBOARDING_RULES,
  }
}

function buildDoneResult(appId: string, platform: Platform, rec: BuildOutputRecord): NextStepResult {
  return {
    onboarding: 'capgo-builder', phase: 'done', state: 'build-complete', platform, progress: 100, kind: 'done',
    summary: `First cloud build for "${appId}" (${platform}) is ready: ${rec.outputUrl ?? 'see the build record'}. Onboarding complete!`,
    context: { appId, platform, jobId: rec.jobId, status: rec.status, outputUrl: rec.outputUrl, qrCodeAscii: rec.qrCodeAscii },
    rules: ONBOARDING_RULES,
  }
}

function buildFailedResult(appId: string, platform: Platform, rec: BuildOutputRecord, recordPath: string): NextStepResult {
  return {
    onboarding: 'capgo-builder', phase: 'build', state: 'build-failed', platform, progress: 92, kind: 'error',
    summary: `The build did not succeed (status: ${rec.status}). The full record is at ${recordPath}.`,
    rules: ONBOARDING_RULES,
  }
}

/**
 * S8: route a SUCCESSFUL checkBuild into the shared post-save tail instead of
 * the legacy terminal done. Three guards keep the C2/D2 contract intact for
 * every legacy caller:
 *  - the slim tail progress (completedSteps.credentialsSaved) must exist on
 *    disk — only the S8 MCP save writes it; TUI/legacy fixtures fall through
 *    to buildDoneResult verbatim;
 *  - the driver must have wired detectCiSecretTargets (the tail's first
 *    effect) — callers without tail deps keep the legacy terminal result;
 *  - any error falls back to the legacy terminal result, never breaking the
 *    polling protocol.
 * Persists completedSteps.buildRequested (the double-build guard) BEFORE
 * routing, so a resume can never re-offer the build. The tail then resumes at
 * 'detecting-ci-secrets' via the platform's tailResumeStep. Returns null when
 * the legacy terminal result should be used.
 */
async function enterTailAfterBuild(
  deps: EngineDeps,
  appId: string,
  platform: Platform,
  rec: BuildOutputRecord,
): Promise<NextStepResult | null> {
  try {
    const buildUrl = `https://capgo.app/app/${appId}/builds`
    if (platform === 'ios') {
      if (!deps.iosEffectDeps?.detectCiSecretTargets || !deps.iosEffectDeps.saveProgress)
        return null
      const prog = await deps.loadProgress(appId)
      if (!prog?.completedSteps?.credentialsSaved)
        return null
      if (!prog.completedSteps.buildRequested) {
        const updated = slimIosTailProgress({
          ...prog,
          completedSteps: { ...prog.completedSteps, buildRequested: { buildUrl } },
        })
        await deps.iosEffectDeps.saveProgress(appId, updated)
      }
    }
    else {
      if (!deps.androidEffectDeps.detectCiSecretTargets)
        return null
      const prog = await deps.loadAndroidProgress(appId)
      if (!prog?.completedSteps?.credentialsSaved)
        return null
      if (!prog.completedSteps.buildRequested) {
        const updated = slimAndroidTailProgress({
          ...prog,
          completedSteps: { ...prog.completedSteps, buildRequested: { buildUrl } },
        })
        await deps.androidEffectDeps.saveAndroidProgress(appId, updated)
      }
    }
    const facts = await gatherFacts(deps)
    const result = platform === 'ios' ? await decideIos(facts, deps) : await decideAndroid(facts, deps)
    // Lead with the build success the user just confirmed, ahead of the
    // tail's first question. Only the public dashboard/output URL — nothing
    // from the carried state may serialize here.
    return {
      ...result,
      summary: `First cloud build for "${appId}" (${platform}) is ready: ${rec.outputUrl ?? 'see the build record'}. ${result.summary}`,
    }
  }
  catch {
    return null
  }
}

async function drive(deps: EngineDeps, input?: OnboardingInput): Promise<NextStepResult> {
  if (input?.checkBuild) {
    const checkAppId = await deps.getAppId()
    const checkPlatform: Platform = (input.platform === 'ios' || input.platform === 'android')
      ? input.platform
      : (activePlatform(await gatherFacts(deps)) ?? 'android')
    if (checkAppId && !isSafeAppIdForCommand(checkAppId)) {
      return {
        onboarding: 'capgo-builder', phase: 'build', state: 'build-appid-unsafe', platform: checkPlatform,
        progress: 90, kind: 'error',
        summary: `Can't start the build: the app id isn't a valid package name (expected reverse-domain like com.example.app). Fix the appId in your capacitor config and try again.`,
        rules: ONBOARDING_RULES,
      }
    }
    if (checkAppId) {
      const recordPath = deps.buildRecordPath(checkAppId, checkPlatform)
      const rec = await deps.readBuildRecord(recordPath)
      if (rec === null)
        return buildWaitingResult(checkPlatform)
      if (rec.status === 'success' || Boolean(rec.outputUrl)) {
        // S8: a CONFIRMED first build enters the shared post-save tail
        // (CI-secrets → env/workflow) instead of ending the conversation —
        // but ONLY when the slim tail progress + tail deps exist (legacy
        // callers keep the terminal result; the C2/D2 polling protocol
        // itself is unchanged).
        const tailEntry = await enterTailAfterBuild(deps, checkAppId, checkPlatform, rec)
        if (tailEntry)
          return tailEntry
        return buildDoneResult(checkAppId, checkPlatform, rec)
      }
      return buildFailedResult(checkAppId, checkPlatform, rec, recordPath)
    }
  }
  if (input?.runBuild) {
    const buildAppId = await deps.getAppId()
    const buildPlatform = input.platform === 'ios' || input.platform === 'android' ? input.platform : undefined
    if (buildAppId && buildPlatform) {
      if (!isSafeAppIdForCommand(buildAppId)) {
        return {
          onboarding: 'capgo-builder', phase: 'build', state: 'build-appid-unsafe', platform: buildPlatform,
          progress: 90, kind: 'error',
          summary: `Can't start the build: the app id "${buildAppId}" isn't a valid package name (expected reverse-domain like com.example.app). Fix the appId in your capacitor config and try again.`,
          rules: ONBOARDING_RULES,
        }
      }
      const recordPath = deps.buildRecordPath(buildAppId, buildPlatform)
      const command = `npx @capgo/cli@latest build request ${buildAppId} --platform ${buildPlatform} --output-upload --output-record "${recordPath}"`
      if (deps.canLaunchTerminal()) {
        const launched = await deps.launchBuildInTerminal(command)
        if (launched.ok)
          return buildLaunchedResult(buildPlatform, command, recordPath)
        // launch failed → fall through to the portable agent hand-off
      }
      return buildHandoffResult(buildPlatform, command, recordPath)
    }
  }
  if (input?.runBuild === false) {
    const skipAppId = await deps.getAppId()
    const skipPlatform = input.platform === 'ios' || input.platform === 'android' ? input.platform : undefined
    if (skipAppId && skipPlatform) {
      return {
        onboarding: 'capgo-builder', phase: 'done', state: 'build-skipped', platform: skipPlatform, progress: 100, kind: 'done',
        summary: `Credentials for "${skipAppId}" (${skipPlatform}) are saved. You can start your first cloud build anytime.`,
        rules: ONBOARDING_RULES,
      }
    }
  }

  // ── iOS data-safety gate routing ───────────────────────────────────────────
  // credentialsExistChoice is shared between the android and iOS gates. When
  // the IOS flow is the one parked on 'credentials-exist' (a TUI run set
  // `_credentialsExistGate: 'pending'`), the answer belongs to the iOS
  // progress — apply it there and keep it OUT of the android persist path
  // (which would otherwise seed a stray android progress file).
  let iosOwnsCredentialsGate = false
  if (input?.credentialsExistChoice) {
    const gAppId = await deps.getAppId()
    if (gAppId) {
      const iosProg = await deps.loadProgress(gAppId)
      const androidProg = await deps.loadAndroidProgress(gAppId)
      if (!androidProg && iosProg && getIosResumeStep(iosProg) === 'credentials-exist') {
        iosOwnsCredentialsGate = true
        const updated: OnboardingProgress = {
          ...iosProg,
          _credentialsExistGate: input.credentialsExistChoice === 'backup' ? 'backup' : 'cancel',
        }
        await deps.iosEffectDeps?.saveProgress?.(gAppId, updated)
      }
    }
  }

  const androidInputPresent = input && (
    input.serviceAccountMethod !== undefined
    || input.playDeveloperId !== undefined
    || input.gcpProjectId !== undefined
    || input.gcpProjectName !== undefined
    || input.androidPackage !== undefined
    || input.serviceAccountJsonPath !== undefined
    || input.saMethodChoice !== undefined
    || (input.credentialsExistChoice !== undefined && !iosOwnsCredentialsGate)
    || input.keystoreMethod !== undefined
    || input.keystorePath !== undefined
    || input.keystoreStorePassword !== undefined
    || input.keystoreAlias !== undefined
    || input.keystoreKeyPassword !== undefined
    || input.keystoreNewAlias !== undefined
    || input.keystorePasswordMethod !== undefined
    || input.keystoreCommonName !== undefined
  )
  // Strict step-by-step gate: only the CURRENT android step's single expected
  // field may be applied. Runs BEFORE persistAndroidInput so a mega-call
  // (multiple fields) / wrong-field / non-answer is rejected with a correction
  // and nothing is applied. Scoped to android-input steps only — the iOS
  // fields are governed by their own gate below, and the bare-{}
  // sign-in-proceed path never sets androidInputPresent, so both are unaffected.
  if (androidInputPresent) {
    const gateAppId = await deps.getAppId()
    if (gateAppId) {
      const gateProgress = await deps.loadAndroidProgress(gateAppId)
      // S9-S11: while parked on an interactive tail step, an android key must
      // be gated against THAT step (whose only allowed field is its tail
      // answer), not the resume-derived step.
      const currentStep = (mcpTailParkedStep(gateAppId, gateProgress) as AndroidOnboardingStep | null) ?? getAndroidResumeStep(gateProgress)
      const check = validateStepInput(currentStep, input as unknown as Record<string, unknown>)
      if (!check.ok) {
        const facts = await gatherFacts(deps)
        const corrective = await decideAndroid(facts, deps) // re-returns the current step; no input applied
        const allowed = check.allowedFields
        const correction = allowed && allowed.length > 0
          ? `This step accepts only one of: ${allowed.map(f => `{ ${f}: ... }`).join(' or ')}. Call ${NEXT_STEP_TOOL} with EXACTLY ONE of those fields and no others${check.extras.length ? ` — remove: ${check.extras.join(', ')}` : ''}. Do not batch multiple answers.`
          : `Call ${NEXT_STEP_TOOL} with only the field this step asks for.`
        return { ...corrective, summary: `${correction}\n\n${corrective.summary}` }
      }
      // Content gate: enforce the store-password rules the ink TUI applies inline
      // (min 6 chars for a new keystore, non-empty for an existing one) BEFORE
      // persistAndroidInput, so a weak/empty password never reaches keystore-
      // generating. Re-renders the current step with the exact main wording.
      const pwCheck = validateStorePassword(currentStep, input.keystoreStorePassword)
      if (!pwCheck.ok) {
        const facts = await gatherFacts(deps)
        const corrective = await decideAndroid(facts, deps) // re-returns the current step; no input applied
        return { ...corrective, summary: `${pwCheck.message}\n\n${corrective.summary}` }
      }
    }
  }

  if (androidInputPresent) {
    const inputAppId = await deps.getAppId()
    if (inputAppId)
      await persistAndroidInput(deps, inputAppId, input!)
  }

  // ── iOS granular input path (S6a/S6b/S12) ──────────────────────────────────
  // The ASC API key trio (the single ios-api-key gate, all three in one call),
  // the verify-app gate answer, the S6b recovery answers (certToRevoke /
  // duplicateProfileAction / errorAction), and the S12 import-fork answers
  // (setupMethod / importDistribution / the ephemeral import picks). Validated
  // by the strict iOS gate against the EFFECTIVE current step (the
  // session-parked recovery/import step when one is parked, else the persisted
  // resume step, mapped through the setup-method fork) BEFORE anything is
  // applied — a stale/early answer or an off-step field is rejected with a
  // correction and nothing is applied.
  const iosInputPresent = input && (
    input.p8Path !== undefined
    || input.keyId !== undefined
    || input.issuerId !== undefined
    || input.verifyAction !== undefined
    || input.verifyAppId !== undefined
    || input.certToRevoke !== undefined
    || input.duplicateProfileAction !== undefined
    || input.errorAction !== undefined
    || input.setupMethod !== undefined
    || input.importDistribution !== undefined
    || input.identityChoice !== undefined
    || input.profileChoice !== undefined
    || input.importRecoveryAction !== undefined
    || input.portalAction !== undefined
    || input.profilePath !== undefined
    || input.exportConfirm !== undefined
  )
  if (iosInputPresent) {
    const gateAppId = await deps.getAppId()
    if (gateAppId) {
      // Seed the Phase-0 data-safety gate BEFORE validating, so an API-key
      // trio sent as the very first call cannot slip past the
      // credentials-exist gate (the FROZEN journey: the gate intercepts
      // BEFORE any Apple traffic). With the gate pending, the effective step
      // is 'credentials-exist', which takes none of the iOS keys — the trio
      // is rejected with a correction and the gate renders.
      const loaded = await deps.loadProgress(gateAppId)
      const gateProgress = await seedIosCredentialsExistGate(gateAppId, deps.iosEffectDeps, loaded)
      const currentStep = effectiveIosStep(gateAppId, gateProgress, deps.iosEffectDeps)
      const check = validateIosStepInput(currentStep, input as unknown as Record<string, unknown>)
      if (!check.ok) {
        const facts = await gatherFacts(deps)
        const corrective = await decideIos(facts, deps) // re-renders the current step; nothing applied
        return { ...corrective, summary: `${check.message}\n\n${corrective.summary}` }
      }
      // Apply the ASC key trio through the SAME reducers the TUI uses
      // (applyIosInput), so progress persists identically — the gate answers
      // (verifyAction / certToRevoke / duplicateProfileAction / errorAction)
      // ride through decideAdvance → decideIos instead (the resolver mechanism).
      if (input!.p8Path !== undefined || input!.keyId !== undefined || input!.issuerId !== undefined) {
        await persistIosApiKeyInput(deps, gateAppId, input!)
        // Corrected key details while parked on the error screen clear the
        // park (the re-collect arm): the flow resumes from the failing phase
        // with the new values instead of re-rendering the stale error.
        if (getSession(gateAppId).iosCarried.error !== undefined)
          dropIosCarried(gateAppId, ['error', 'retryStep', 'errorAction'])
      }
      // S12: the PERSISTED import-fork reducers (the TUI's setup-method /
      // distribution-mode onChange writes). The ephemeral import picks ride
      // through decideAdvance → decideIos instead (the resolver mechanism).
      if (input!.setupMethod !== undefined || input!.importDistribution !== undefined)
        await persistIosImportForkInput(deps, gateAppId, input!)
    }
  }
  // ── S9-S11: post-build tail answer path ─────────────────────────────────────
  // The tail family fields (ciSecretAction / githubActionsSetup /
  // exportEnvAction(+envExportPath) / packageManager / buildScript /
  // buildScriptCustom / workflowFileAction). Validated by the strict tail gate
  // against the EFFECTIVE tail step (the session-parked interactive step when
  // one is parked, else the platform resume step) BEFORE anything is applied —
  // an off-step / mis-vocabulary / batched answer is rejected with a correction
  // and NOTHING is applied. A valid answer records its pref via the shared
  // applyTailInput reducer, persists the SLIM progress, clears the park and
  // re-drives the platform with the TUI-routed next step.
  const tailInputPresent = Boolean(input && TAIL_INPUT_KEYS.some(k => (input as unknown as Record<string, unknown>)[k] !== undefined && (input as unknown as Record<string, unknown>)[k] !== null))
  if (tailInputPresent) {
    const tailAppId = await deps.getAppId()
    if (tailAppId) {
      const androidProg = await deps.loadAndroidProgress(tailAppId)
      const iosProg = await deps.loadProgress(tailAppId)
      const tailPlatform: Platform | null = androidProg?.completedSteps?.credentialsSaved
        ? 'android'
        : iosProg?.completedSteps?.credentialsSaved ? 'ios' : null
      const facts = await gatherFacts(deps)
      if (!tailPlatform) {
        // No tail in flight — a tail answer here is always stale/early.
        const corrective = await decideAdvance(facts, iosProg, undefined, deps)
        return { ...corrective, summary: `Tail answer fields (ciSecretAction / githubActionsSetup / exportEnvAction / packageManager / buildScript / buildScriptCustom / workflowFileAction) only apply to the post-build CI/workflow steps — none is active right now. Answer the current step instead.\n\n${corrective.summary}` }
      }
      const tailProgress = (tailPlatform === 'android' ? androidProg! : iosProg!) as TailEffectProgress & { completedSteps: Record<string, unknown> }
      const parked = getSession(tailAppId).tailParked
      const effectiveStep = mcpTailParkedStep(tailAppId, tailProgress as { completedSteps?: { credentialsSaved?: unknown } })
        ?? (tailPlatform === 'android' ? getAndroidResumeStep(androidProg) : getIosResumeStep(iosProg))
      const check = validateTailStepInput(effectiveStep, input as unknown as Record<string, unknown>, {
        ciSecretTargets: parked?.ciSecretTargets,
        availableScripts: parked?.availableScripts,
      })
      if (!check.ok) {
        // Corrective re-render: the park keeps the decide loop on the SAME
        // question; nothing was applied.
        const corrective = tailPlatform === 'android' ? await decideAndroid(facts, deps) : await decideIos(facts, deps)
        return { ...corrective, summary: `${check.message}\n\n${corrective.summary}` }
      }
      const applied = applyMcpTailAnswer(effectiveStep, input!, tailProgress, parked)
      if (applied.progress !== tailProgress) {
        // A pref was recorded — persist it through the SLIM whitelist writer
        // so the answer survives a restart (resume mid-tail).
        if (tailPlatform === 'android')
          await deps.androidEffectDeps.saveAndroidProgress(tailAppId, slimAndroidTailProgress(applied.progress as AndroidOnboardingProgress))
        else
          await deps.iosEffectDeps?.saveProgress?.(tailAppId, slimIosTailProgress(applied.progress as OnboardingProgress))
      }
      // NOTE: the park is intentionally NOT cleared here — the next interactive
      // render REPLACES it (setTailParked), carrying the non-secret inventories
      // (detected targets / scripts / repo label) forward exactly like the
      // TUI's React state, and the terminal clears the whole session.
      const freshFacts = await gatherFacts(deps)
      return tailPlatform === 'android'
        ? decideAndroid(freshFacts, deps, { tailNext: applied.next as AndroidOnboardingStep })
        : decideIos(freshFacts, deps, { tailNext: applied.next as OnboardingStep })
    }
  }

  // Detect sign-in proceed: plain continue (no android/ios/tail input, no platform choice) at google-sign-in.
  let signInProceed = false
  const isPlainContinue = !input || (!input.platform && !input.runBuild && !input.checkBuild && !androidInputPresent && !iosInputPresent && !tailInputPresent)
  if (isPlainContinue) {
    const spAppId = await deps.getAppId()
    if (spAppId) {
      const spProgress = await deps.loadAndroidProgress(spAppId)
      if (spProgress && getAndroidResumeStep(spProgress) === 'google-sign-in')
        signInProceed = true
    }
  }

  for (let i = 0; i < MAX_AUTO_STEPS; i++) {
    const facts = await gatherFacts(deps)
    const progress = facts.appId ? await deps.loadProgress(facts.appId) : null
    const result = await decideAdvance(facts, progress, input, deps)

    if (signInProceed && result.platform === 'android' && result.state === 'google-sign-in')
      return decideAndroid(facts, deps, { signInProceed: true })

    if (result.kind !== 'auto')
      return result
    const afterExec = await executeAuto(result, facts, deps)
    if (afterExec !== null)
      return afterExec
  }
  return {
    onboarding: 'capgo-builder', phase: 'preflight', state: 'auto-loop-guard', progress: 0, kind: 'error',
    summary: 'Onboarding stalled (too many automatic steps without progress). Please retry or run `capgo doctor`.',
    rules: ONBOARDING_RULES,
  }
}

export async function runStart(deps: EngineDeps): Promise<NextStepResult> {
  return drive(deps, undefined)
}

export async function runAdvance(deps: EngineDeps, input?: OnboardingInput): Promise<NextStepResult> {
  return drive(deps, input)
}

/**
 * Map an iOS resume step to its MCP state name: the TUI-only .p8 chain (and
 * the bootstrap 'welcome') collapses into the single 'ios-api-key' gate name;
 * every other engine step id is the state name verbatim — mirroring decideIos.
 */
function resolveIosStateName(step: OnboardingStep): string {
  return IOS_API_KEY_GATE_STEPS.has(step) ? 'ios-api-key' : step
}

/**
 * Read-only: determine the onboarding state the user is currently on, WITHOUT
 * running any side effect. Mirrors the branch selection of decideStart/
 * decideAndroid/decideIos (preflight → platform → resume step) but never
 * calls effects.
 */
export function resolveCurrentState(facts: PreflightFacts): string {
  if (!facts.capacitorProject || !facts.appId)
    return 'no-capacitor-project'
  if (!facts.authenticated)
    return 'login-required'
  if (!facts.appRegistered)
    return 'registering-app'
  const appId = facts.appId
  // Seed an empty android progress the way decideAndroid does so the resume step
  // resolves to 'keystore-method-select' (not 'welcome') for a fresh android flow.
  const androidProgress = facts.androidProgress
    ?? { platform: 'android' as const, appId, startedAt: new Date().toISOString(), completedSteps: {} }
  // An in-flight android credential flow (or a fresh android-only project) → resume step.
  if (facts.androidProgress)
    return getAndroidResumeStep(facts.androidProgress)
  if (facts.iosProgress)
    return resolveIosStateName(getIosResumeStep(facts.iosProgress))
  if (facts.platformsDetected.length === 1 && facts.platformsDetected[0] === 'android')
    return getAndroidResumeStep(androidProgress)
  if (facts.platformsDetected.length === 1 && facts.platformsDetected[0] === 'ios')
    return 'ios-api-key'
  return 'platform-select'
}

/**
 * Read-only "explain the current step" entry point backing the
 * capgo_builder_onboarding_explain tool. Gathers facts (read-only) and returns a
 * plain-language explanation string. Never advances the flow or runs effects.
 */
export async function explainOnboarding(deps: EngineDeps, input?: { state?: string }): Promise<string> {
  const facts = await gatherFacts(deps)
  const state = input?.state ?? resolveCurrentState(facts)
  return explainForState(state)
}
