// Appflow migration flow. Returns the neutral StepView (flow/contract.ts) directly
// and implements PlatformFlow so the engine drives it like ios/android. The flow
// is a CREDENTIAL SOURCE: it collects per-platform Capgo creds into progress, then
// hands off to the existing build/validate/CI tail. It NEVER generates signing
// creds (migrate-or-skip); gap-fill generation exists only for step-6 distribution.
//
// Driver contract (shared by the TUI ui/appflow-app.tsx AND the MCP engine
// decideAppflow): interactive steps (choice/info/human_gate) advance via
// applyInput() -> resumeStep(); ONLY 'auto' steps run runEffect(). So the
// interactive step graph (incl. step-6 gap-fill, step-7 validate, step-8 p8
// upgrade) is encoded in getAppflowResumeStep, and 'validate' is an AUTO step that
// runs the advisory checks and then transitions to the 'validate-results' info view.
//
// Build + finish (spec "Build + finish"): on `handoff-build` → 'build' the flow
// REUSES the shared onboarding tail (../tail/flow.ts) inline for the chosen
// platform — saving-credentials → ask-build → requesting-build → CI/CD secrets →
// build-complete — exactly as the iOS/Android drivers do. Both-platform
// migrations FIRST pick which platform to build (build-platform-pick), build it,
// then offer the second. 'skip' finishes with creds persisted (build later via
// `capgo build request`). The tail's effect/view/input steps are delegated to the
// shared module via runTailEffect / tailViewForStep / applyTailInput.
import type { PlatformFlow, StepView } from '../flow/contract'
import type { AppflowInput, AppflowProgress, AppflowStep } from './types'
import type { AppflowToken } from './auth'
import { isExpired, loginWithBrowser, refresh } from './auth'
import { createAppflowApi } from './api'
import type { TailInput, TailStep, TailStepCtx, TailStepView } from '../tail/flow.js'
import { applyTailInput, runTailEffect, tailViewForStep } from '../tail/flow.js'
import type { AppflowTailDepsOptions, AppflowTailProgress } from './tail.js'
import { toAppflowTailDeps } from './tail.js'

export interface AppflowEffectResult {
  progress: AppflowProgress
  next?: AppflowStep
  transient?: Record<string, unknown>
}

export interface AppflowValidationResult {
  id: 'sa' | 'keystore' | 'app-password' | 'p12'
  status: 'pass' | 'warn' | 'skipped'
  message: string
}

export interface AppflowEffectDeps {
  appId?: string
  log?: (s: string) => void
  loadToken?: () => AppflowToken | null
  saveToken?: (t: AppflowToken) => void
  openBrowser?: (url: string) => void
  // injected validators (reuse existing CLI code in production)
  validateServiceAccountJson?: (json: string, packageName?: string) => Promise<{ ok: boolean, reason?: string }>
  tryUnlockPrivateKey?: (keystoreB64: string, storePass: string, alias: string) => Promise<boolean>
  validateAppleAppPassword?: (user: string, pw: string) => Promise<{ valid: boolean, message?: string }>
  validateP12?: (p12B64: string, password: string) => Promise<boolean>
  carried?: Record<string, unknown>
  // Build/CI tail wiring (consumed only when the flow delegates a shared tail
  // step). The driver supplies the API key / gateway / journey + the build-output
  // and side-log sinks; the tail deps are built per-effect from these.
  tailOptions?: AppflowTailDepsOptions
}

const SUPPORT = 'support@capgo.app'

// ── shared tail step routing ──────────────────────────────────────────────────
//
// The shared tail step ids the appflow flow delegates to ../tail/flow.ts. EFFECT
// steps run their effect via runTailEffect; VIEW steps render via tailViewForStep;
// INPUT steps record state via applyTailInput. The id sets mirror the iOS engine's
// TAIL_EFFECT_STEPS / TAIL_VIEW_STEPS / TAIL_INPUT_STEPS.
const APPFLOW_TAIL_EFFECT_STEPS = new Set<TailStep>([
  'saving-credentials',
  'detecting-ci-secrets',
  'checking-ci-secrets',
  'uploading-ci-secrets',
  'exporting-env',
  'overwrite-and-export-env',
  'writing-workflow-file',
  'requesting-build',
])

const APPFLOW_TAIL_VIEW_STEPS = new Set<TailStep>([
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

const APPFLOW_TAIL_INPUT_STEPS = new Set<TailStep>([
  'ci-secrets-target-select',
  'ask-github-actions-setup',
  'ask-export-env',
  'pick-package-manager',
  'pick-build-script',
  'pick-build-script-custom',
])

export function isAppflowTailStep(step: AppflowStep): step is TailStep {
  return APPFLOW_TAIL_EFFECT_STEPS.has(step as TailStep) || APPFLOW_TAIL_VIEW_STEPS.has(step as TailStep)
}

/** The tail-facing progress: the migration's progress with a guaranteed appId. */
function toTailProgress(progress: AppflowProgress): AppflowTailProgress {
  return { ...progress, appId: progress.appId ?? '' }
}

/** Map a neutral TailStepView onto the appflow neutral StepView (1:1 fields). */
function mapTailViewToStepView(v: TailStepView): StepView {
  return {
    kind: v.kind,
    prompt: v.prompt ?? v.title ?? v.message ?? '',
    options: (v.options ?? []).map(o => ({ value: o.value, label: o.label ?? o.value, note: o.note })),
    collect: v.collect?.map(field => ({ field, desc: field })),
  }
}

/** Build the per-platform TailInput the shared reducer expects from a raw choice/text. */
function toTailInput(step: TailStep, input: AppflowInput): TailInput {
  switch (step) {
    case 'ci-secrets-target-select':
      // 'skip' clears the target; otherwise the engine re-resolves the target
      // object at checking-ci-secrets (the appflow flow keeps no target table),
      // so we record null here and let detection drive it. Mirrors the contract
      // where ci-secrets-target-select carries a CiSecretTarget | null.
      return { step, ciSecretTarget: null }
    case 'ask-github-actions-setup':
      return { step, value: (input.value as 'with-workflow' | 'secrets-only' | 'no') ?? 'no' }
    case 'ask-export-env':
      return input.value === 'yes'
        ? { step, value: 'yes', envExportTargetPath: input.text ?? '' }
        : { step, value: 'no' }
    case 'pick-package-manager':
      return { step, selectedPackageManager: (input.value as 'bun' | 'npm' | 'pnpm' | 'yarn') ?? 'npm' }
    case 'pick-build-script':
      return input.value === '__custom__'
        ? { step, value: '__custom__' }
        : { step, buildScriptChoice: { type: 'npm-script', name: input.value ?? '' } }
    case 'pick-build-script-custom':
      return { step, command: input.text ?? '' }
    default:
      // Navigation-only / spinner-gate steps fall through unchanged.
      return { step, value: input.value } as unknown as TailInput
  }
}

// ── pure helpers (unit-tested) ───────────────────────────────────────────────
export function autoSelect<T>(items: T[]): T | 'prompt' | null {
  if (!items || items.length === 0)
    return null
  if (items.length === 1)
    return items[0]
  return 'prompt'
}

const inScope = (scope: AppflowProgress['scope'], p: 'ios' | 'android'): boolean => scope === 'both' || scope === p

const hasCreds = (rec?: Record<string, string>): boolean => !!rec && Object.keys(rec).length > 0

// iOS distribution (upload destination) is present iff an app-specific password was imported.
function iosDistMissing(p: AppflowProgress): boolean {
  return inScope(p.scope, 'ios') && hasCreds(p.ios) && !p.ios!.FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD
}

// Android distribution (upload destination) is present iff a service-account JSON was imported.
function androidDistMissing(p: AppflowProgress): boolean {
  return inScope(p.scope, 'android') && hasCreds(p.android) && !p.android!.PLAY_CONFIG_JSON
}

// iOS imported an app-specific password -> eligible for the step-8 .p8 upgrade offer.
function iosHasAppPassword(p: AppflowProgress): boolean {
  return inScope(p.scope, 'ios') && !!p.ios?.FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD
}

export function decideAfterFetchSigning(progress: Pick<AppflowProgress, 'scope' | 'migratable'>): AppflowStep {
  const scope = progress.scope ?? 'both'
  const any = (inScope(scope, 'ios') && progress.migratable.ios) || (inScope(scope, 'android') && progress.migratable.android)
  return any ? 'fetch-distribution' : 'no-signing-submenu'
}

export function platformsToBuild(progress: Pick<AppflowProgress, 'scope' | 'ios' | 'android'>): ('ios' | 'android')[] {
  const scope = progress.scope ?? 'both'
  const out: ('ios' | 'android')[] = []
  if (inScope(scope, 'ios') && progress.ios && Object.keys(progress.ios).length > 0)
    out.push('ios')
  if (inScope(scope, 'android') && progress.android && Object.keys(progress.android).length > 0)
    out.push('android')
  return out
}

/** Platforms still awaiting an inline build (migrated, not yet built). */
export function platformsRemainingToBuild(progress: AppflowProgress): ('ios' | 'android')[] {
  const built = new Set(progress.builtPlatforms ?? [])
  return platformsToBuild(progress).filter(p => !built.has(p))
}

// Advisory, surfaced, NON-blocking. Failures -> 'warn'; thrown/absent -> 'skipped'.
export async function runValidations(progress: AppflowProgress, deps: AppflowEffectDeps = {}): Promise<AppflowValidationResult[]> {
  const out: AppflowValidationResult[] = []
  const a = progress.android ?? {}
  const i = progress.ios ?? {}

  if (a.PLAY_CONFIG_JSON) {
    try {
      const r = await deps.validateServiceAccountJson?.(a.PLAY_CONFIG_JSON)
      out.push(r === undefined
        ? { id: 'sa', status: 'skipped', message: 'Service account not checked.' }
        : r.ok
          ? { id: 'sa', status: 'pass', message: 'Service account can upload to Google Play.' }
          : { id: 'sa', status: 'warn', message: `Service account check failed: ${r.reason ?? 'unknown'}.` })
    }
    catch (e) {
      out.push({ id: 'sa', status: 'skipped', message: `Service account check skipped: ${e instanceof Error ? e.message : String(e)}.` })
    }
  }

  if (a.ANDROID_KEYSTORE_FILE) {
    try {
      const ok = await deps.tryUnlockPrivateKey?.(a.ANDROID_KEYSTORE_FILE, a.KEYSTORE_STORE_PASSWORD ?? '', a.KEYSTORE_KEY_ALIAS ?? '')
      out.push(ok === undefined
        ? { id: 'keystore', status: 'skipped', message: 'Keystore not checked.' }
        : ok
          ? { id: 'keystore', status: 'pass', message: 'Keystore unlocks locally with the imported password/alias.' }
          : { id: 'keystore', status: 'warn', message: 'Keystore did not unlock locally (password/alias mismatch?).' })
    }
    catch (e) {
      out.push({ id: 'keystore', status: 'skipped', message: `Keystore check skipped: ${e instanceof Error ? e.message : String(e)}.` })
    }
  }

  if (i.FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD) {
    try {
      const r = await deps.validateAppleAppPassword?.(i.FASTLANE_USER ?? '', i.FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD)
      out.push(r === undefined
        ? { id: 'app-password', status: 'skipped', message: 'App-specific password not checked.' }
        : r.valid
          ? { id: 'app-password', status: 'pass', message: 'App-specific password authenticated with Apple.' }
          : { id: 'app-password', status: 'warn', message: `App-specific password check failed: ${r.message ?? 'unknown'}.` })
    }
    catch (e) {
      out.push({ id: 'app-password', status: 'skipped', message: `App-specific password check skipped: ${e instanceof Error ? e.message : String(e)}.` })
    }
  }

  // iOS cert + provisioning profile are NOT verifiable remotely (do not attempt).
  // Optional LIGHT local check: confirm the imported .p12 opens with P12_PASSWORD.
  if (i.BUILD_CERTIFICATE_BASE64) {
    try {
      const ok = await deps.validateP12?.(i.BUILD_CERTIFICATE_BASE64, i.P12_PASSWORD ?? '')
      out.push(ok === undefined
        ? { id: 'p12', status: 'skipped', message: 'Signing certificate (.p12) not checked.' }
        : ok
          ? { id: 'p12', status: 'pass', message: 'Signing certificate (.p12) opens with the imported password.' }
          : { id: 'p12', status: 'warn', message: 'Signing certificate (.p12) did not open with the imported password.' })
    }
    catch (e) {
      out.push({ id: 'p12', status: 'skipped', message: `Certificate check skipped: ${e instanceof Error ? e.message : String(e)}.` })
    }
  }

  return out
}

// ── views ────────────────────────────────────────────────────────────────────
function noSigningPlatformLabel(progress: AppflowProgress): string {
  return progress.noSigningScope === 'ios' ? 'iOS' : progress.noSigningScope === 'android' ? 'Android' : 'this app'
}

export function appflowViewForStep(step: AppflowStep, progress: AppflowProgress, ctx: Record<string, unknown> = {}): StepView {
  // Shared tail steps render via the neutral tail view, mapped 1:1 onto StepView.
  if (isAppflowTailStep(step))
    return mapTailViewToStepView(tailViewForStep(step as TailStep, toTailProgress(progress), ctx as TailStepCtx))

  switch (step) {
    case 'explain':
      return {
        kind: 'human_gate',
        prompt:
          'Migrate from Ionic Appflow. We will sign you in to Appflow using the SAME secure browser '
          + 'login the Ionic CLI uses (OAuth + PKCE on a local loopback); only your session token is read '
          + `and it stays on this machine. If you hit ANY problem during the migration, email ${SUPPORT}.`,
      }
    case 'select-org':
      return { kind: 'choice', prompt: 'Which Appflow organization?', options: (ctx.options as StepView['options']) ?? [] }
    case 'select-app':
      return { kind: 'choice', prompt: 'Which Appflow app?', options: (ctx.options as StepView['options']) ?? [] }
    case 'select-ios-cert':
      return { kind: 'choice', prompt: 'Which iOS signing certificate to migrate?', options: (ctx.options as StepView['options']) ?? [] }
    case 'select-android-cert':
      return { kind: 'choice', prompt: 'Which Android signing certificate to migrate?', options: (ctx.options as StepView['options']) ?? [] }
    case 'no-signing-submenu': {
      const label = noSigningPlatformLabel(progress)
      const native = progress.noSigningScope === 'android' ? 'Android' : 'iOS'
      return {
        kind: 'choice',
        prompt: `${label} cannot be migrated - no signing configuration exists for this app in Appflow.`,
        options: [
          { value: 'email-support', label: 'I believe credentials exist - email support' },
          { value: 'skip', label: `I understand, do not migrate ${label}` },
          { value: 'abandon', label: `Abandon Appflow migration and start ${native} onboarding instead` },
          { value: 'go-back', label: 'Go back' },
        ],
      }
    }
    case 'ios-dist-gapfill':
      return {
        kind: 'choice',
        prompt: 'No iOS upload destination found in Appflow. Set up an App Store Connect API key (.p8)?',
        options: [
          { value: 'generate', label: 'Generate / provide a .p8 API key now' },
          { value: 'skip', label: 'Skip (set up upload later)' },
        ],
      }
    case 'android-dist-gapfill':
      return {
        kind: 'choice',
        prompt: 'No Android upload destination found in Appflow. Set up a Google Play service account?',
        options: [
          { value: 'generate', label: 'Generate / provide a service-account JSON now' },
          { value: 'skip', label: 'Skip (set up upload later)' },
        ],
      }
    case 'p8-upgrade-prompt':
      return {
        kind: 'choice',
        prompt:
          'You imported an app-specific password for iOS uploads. An App Store Connect API key (.p8) is the '
          + 'recommended, more capable, and more secure option. Convert now?',
        options: [
          { value: 'convert', label: 'Convert to a .p8 API key (recommended)' },
          { value: 'skip', label: 'Keep the app-specific password' },
        ],
      }
    case 'validate':
      // AUTO: runValidations runs in runEffect, then transitions to validate-results.
      return { kind: 'auto', prompt: 'Validating imported credentials…' }
    case 'validate-results': {
      const results = (ctx.results as AppflowValidationResult[]) ?? []
      return {
        kind: 'info',
        prompt: results.length
          ? `Validation results:\n${results.map(r => `${r.status === 'pass' ? 'OK' : r.status === 'warn' ? 'WARNING' : 'skipped'}: ${r.message}`).join('\n')}\nValidation never blocks - you can continue.`
          : 'No credentials to validate. Continuing.',
        options: [{ value: 'continue', label: 'Continue' }],
        context: { results },
      }
    }
    case 'handoff-build': {
      const targets = platformsToBuild(progress)
      return {
        kind: 'choice',
        prompt: `Migration complete. Build now (${targets.join(', ') || 'no platforms'}) or skip and build later?`,
        options: [
          { value: 'build', label: 'Build now' },
          { value: 'skip', label: 'Skip build (finish; build later with `build request`)' },
        ],
      }
    }
    case 'build-platform-pick': {
      // Both platforms migrated — ask which to build first (the other is offered
      // after the first build completes). Only the not-yet-built platforms appear.
      const remaining = platformsRemainingToBuild(progress)
      return {
        kind: 'choice',
        prompt: 'Which platform should we build first?',
        options: [
          ...remaining.map(p => ({ value: p, label: p === 'ios' ? 'iOS' : 'Android' })),
          { value: 'skip', label: 'Skip build (finish; build later with `build request`)' },
        ],
      }
    }
    case 'authenticating':
    case 'fetch-signing':
    case 'fetch-distribution':
      return { kind: 'auto', prompt: 'Working...' }
    case 'done':
      return { kind: 'done', prompt: 'Appflow migration complete.' }
    case 'error':
      return { kind: 'error', prompt: (ctx.error as string) ?? 'Migration error.' }
    default:
      return { kind: 'auto', prompt: 'Working...' }
  }
}

// ── input reducer ────────────────────────────────────────────────────────────
export function applyAppflowInput(step: AppflowStep, progress: AppflowProgress, input: AppflowInput): AppflowProgress {
  const completed = progress.completedSteps.includes(step) ? progress.completedSteps : [...progress.completedSteps, step]
  const base = { ...progress, completedSteps: completed }

  // Shared tail input steps delegate to the shared reducer (records setupMode /
  // ciSecretTarget / selectedPackageManager / buildScriptChoice / envExportTargetPath).
  if (APPFLOW_TAIL_INPUT_STEPS.has(step as TailStep)) {
    const tailProgress = applyTailInput(step as TailStep, toTailProgress(base), toTailInput(step as TailStep, input))
    return { ...base, ...tailProgress, completedSteps: completed }
  }

  switch (step) {
    case 'select-org':
      return { ...base, orgSlug: input.value }
    case 'select-app':
      return { ...base, appId: input.value, appSlug: input.text ?? input.value }
    case 'no-signing-submenu':
      return { ...base, ...(input.value === 'skip' && progress.noSigningScope && progress.noSigningScope !== 'all' ? { migratable: { ...progress.migratable, [progress.noSigningScope]: false } } : {}) }
    case 'ios-dist-gapfill':
      return { ...base, iosDistGapfill: input.value === 'generate' ? 'generate' : 'skip' }
    case 'android-dist-gapfill':
      return { ...base, androidDistGapfill: input.value === 'generate' ? 'generate' : 'skip' }
    case 'p8-upgrade-prompt':
      return { ...base, p8Upgrade: input.value === 'convert' ? 'convert' : 'skip' }
    case 'handoff-build':
      return { ...base, handoffChoice: input.value === 'build' ? 'build' : 'skip' }
    case 'build-platform-pick':
      // 'skip' ends the build hand-off; a platform value commits the next build.
      return input.value === 'skip'
        ? { ...base, handoffChoice: 'skip' }
        : { ...base, buildPlatform: input.value === 'android' ? 'android' : 'ios' }
    default:
      return base
  }
}

// ── resume ───────────────────────────────────────────────────────────────────
// Single source of truth for the INTERACTIVE step graph. Both drivers call this
// after applyInput to pick the next step. Step order mirrors the spec:
// auth -> org -> app -> signing -> distribution -> step-6 gap-fill -> step-7
// validate (auto) -> step-8 p8 upgrade -> handoff/build.
export function getAppflowResumeStep(progress: AppflowProgress | null): AppflowStep {
  if (!progress)
    return 'explain'
  const done = (s: AppflowStep) => progress.completedSteps.includes(s)
  if (!progress.token)
    return done('explain') ? 'authenticating' : 'explain'
  if (!progress.orgSlug)
    return 'select-org'
  if (!progress.appId)
    return 'select-app'
  if (!done('fetch-signing'))
    return 'fetch-signing'
  if (!done('fetch-distribution'))
    return 'fetch-distribution'
  // step-6 gap-fill: offer to set up a missing upload destination (per platform),
  // once each, before validation.
  if (iosDistMissing(progress) && progress.iosDistGapfill === undefined)
    return 'ios-dist-gapfill'
  if (androidDistMissing(progress) && progress.androidDistGapfill === undefined)
    return 'android-dist-gapfill'
  // step-7 validation (auto step; runs the advisory checks).
  if (!done('validate'))
    return 'validate'
  // step-8 iOS app-specific-password -> .p8 upgrade offer (once).
  if (iosHasAppPassword(progress) && progress.p8Upgrade === undefined)
    return 'p8-upgrade-prompt'
  // converge: the build hand-off choice (build now / skip).
  if (progress.handoffChoice === undefined)
    return 'handoff-build'
  // 'skip' finishes; the driver routes to done.
  if (progress.handoffChoice === 'skip')
    return 'done'
  // 'build': drive the shared tail for the chosen platform.
  return getAppflowBuildResumeStep(progress)
}

/**
 * Resume the inline build phase after the user chose 'build'. Picks the platform
 * to build (asking first when BOTH migrated and none/one is chosen), then enters
 * the shared tail at saving-credentials. After a platform's build completes
 * (recorded in builtPlatforms) it offers the next remaining platform, then done.
 */
export function getAppflowBuildResumeStep(progress: AppflowProgress): AppflowStep {
  const remaining = platformsRemainingToBuild(progress)
  if (remaining.length === 0)
    return 'done'
  // A platform is committed for the current build run.
  if (progress.buildPlatform && remaining.includes(progress.buildPlatform))
    return 'saving-credentials'
  // Single remaining platform → build it directly (no pick needed).
  if (remaining.length === 1)
    return 'saving-credentials'
  // 2+ remaining and none committed → ask which to build first.
  return 'build-platform-pick'
}

// ── shared-tail interactive transitions ──────────────────────────────────────
//
// The shared tail's CHOICE/INPUT steps transition by driver logic, NOT by the
// resume router (the bespoke iOS/Android drivers hard-code these; see android
// ui/app.tsx). This pure table replicates that transition map for the POST-BUILD
// tail the appflow flow drives, so the generic appflow renderer can advance the
// tail without a bespoke per-step handler. Returns the next tail step id.
export function nextTailStep(step: TailStep, value: string | undefined, progress: AppflowProgress): TailStep {
  switch (step) {
    case 'ci-secrets-setup':
      return value === 'retry' ? 'detecting-ci-secrets' : 'build-complete'
    case 'ci-secrets-target-select':
      // The appflow flow keeps no target table, so a chosen provider re-enters
      // detection (which re-resolves the target object), and skip finishes.
      return value === 'skip' || !value ? 'build-complete' : 'detecting-ci-secrets'
    case 'ask-ci-secrets':
      return value === 'yes' ? 'checking-ci-secrets' : 'build-complete'
    case 'ask-github-actions-setup':
      // with-workflow / secrets-only → push the secrets (checking-ci-secrets);
      // 'no' (declined) → offer the .env export instead.
      return value === 'no' ? 'ask-export-env' : 'checking-ci-secrets'
    case 'ask-export-env':
      return value === 'yes' ? 'exporting-env' : 'build-complete'
    case 'confirm-env-export-overwrite':
      return value === 'replace' ? 'overwrite-and-export-env' : 'build-complete'
    case 'pick-package-manager':
      return 'pick-build-script'
    case 'pick-build-script':
      return value === '__custom__' ? 'pick-build-script-custom' : 'preview-workflow-file'
    case 'pick-build-script-custom':
      return 'preview-workflow-file'
    case 'preview-workflow-file':
      return value === 'view' ? 'view-workflow-diff' : value === 'write' ? 'writing-workflow-file' : 'build-complete'
    case 'view-workflow-diff':
      return 'preview-workflow-file'
    case 'confirm-secrets-push':
      return value === 'confirm' ? 'uploading-ci-secrets' : 'build-complete'
    case 'confirm-ci-secret-overwrite':
      return value === 'replace' ? 'uploading-ci-secrets' : 'build-complete'
    case 'ci-secrets-failed':
      return value === 'retry' ? (progress.ciSecretTarget ? 'checking-ci-secrets' : 'detecting-ci-secrets') : 'build-complete'
    case 'ask-build':
      return value === 'yes' ? 'requesting-build' : 'build-complete'
    default:
      return 'build-complete'
  }
}

/**
 * Record the just-finished platform's inline tail run as complete (reached at
 * build-complete via any path — built, skipped, or failed) so a both-platform
 * migration can offer the next platform. Returns the next overall appflow step
 * (the second platform's tail entry, or 'done').
 */
export function markTailRunComplete(progress: AppflowProgress): { progress: AppflowProgress, next: AppflowStep } {
  const remaining = platformsRemainingToBuild(progress)
  const platform = progress.buildPlatform ?? remaining[0]
  const built = new Set(progress.builtPlatforms ?? [])
  if (platform)
    built.add(platform)
  const nextProgress: AppflowProgress = { ...progress, builtPlatforms: [...built], buildPlatform: undefined }
  return { progress: nextProgress, next: getAppflowBuildResumeStep(nextProgress) }
}

// ── effects ──────────────────────────────────────────────────────────────────
export async function runAppflowEffect(step: AppflowStep, progress: AppflowProgress, deps: AppflowEffectDeps): Promise<AppflowEffectResult> {
  const mark = (p: AppflowProgress, s: AppflowStep): AppflowProgress => ({ ...p, completedSteps: p.completedSteps.includes(s) ? p.completedSteps : [...p.completedSteps, s] })

  // Shared tail EFFECT steps: build the tail deps for the committed platform and
  // delegate to runTailEffect. The committed platform is buildPlatform, or the
  // single remaining platform when only one migrated.
  if (APPFLOW_TAIL_EFFECT_STEPS.has(step as TailStep)) {
    const remaining = platformsRemainingToBuild(progress)
    const platform = progress.buildPlatform ?? remaining[0] ?? 'ios'
    const tailDeps = toAppflowTailDeps(platform, {
      ...deps.tailOptions,
      carried: { ...(deps.tailOptions?.carried ?? {}), ...((deps.carried as AppflowTailDepsOptions['carried']) ?? {}) },
    })
    const result = await runTailEffect(step as TailStep, toTailProgress(progress), tailDeps)
    // Keep buildPlatform committed through the whole tail run — the build-complete
    // ADVANCE (markTailRunComplete) records the built platform and re-picks. Merge
    // the tail's returned progress (it threads ciSecretTarget / envExportTargetPath).
    const nextProgress: AppflowProgress = { ...progress, ...result.progress, buildPlatform: platform }
    return { progress: nextProgress, next: result.next as AppflowStep | undefined, transient: result.transient as Record<string, unknown> | undefined }
  }

  switch (step) {
    case 'authenticating': {
      let token = deps.loadToken?.() ?? progress.token ?? null
      if (token && isExpired(token))
        token = await refresh(token).catch(() => null)
      if (!token)
        token = await loginWithBrowser({ openBrowser: deps.openBrowser })
      deps.saveToken?.(token)
      return { progress: mark({ ...progress, token }, 'authenticating'), next: 'select-org' }
    }
    case 'fetch-signing': {
      const api = createAppflowApi(progress.token!.access_token, deps.log)
      const certs = await api.listCertificates(progress.appId!)
      const iosCerts = certs.filter((c: any) => c.credentials?.ios)
      const androidCerts = certs.filter((c: any) => c.credentials?.android)
      const migratable = { ios: inScope(progress.scope, 'ios') && iosCerts.length > 0, android: inScope(progress.scope, 'android') && androidCerts.length > 0 }
      let p: AppflowProgress = { ...progress, migratable }
      if (migratable.ios) {
        const sel = autoSelect(iosCerts)
        if (sel === 'prompt')
          return { progress: p, next: 'select-ios-cert', transient: { iosCerts } }
        if (sel)
          p = { ...p, ios: { ...p.ios, ...(await api.fetchIosSigning(progress.appId!, (sel as any).tag)) } }
      }
      if (migratable.android) {
        const sel = autoSelect(androidCerts)
        if (sel === 'prompt')
          return { progress: p, next: 'select-android-cert', transient: { androidCerts } }
        if (sel)
          p = { ...p, android: { ...p.android, ...(await api.fetchAndroidSigning(progress.appId!, (sel as any).tag)) } }
      }
      p = mark(p, 'fetch-signing')
      const next = decideAfterFetchSigning(p)
      return { progress: next === 'no-signing-submenu' ? { ...p, noSigningScope: progress.scope === 'both' ? 'all' : progress.scope } : p, next }
    }
    case 'fetch-distribution': {
      const api = createAppflowApi(progress.token!.access_token, deps.log)
      const dist = await api.listDistribution(progress.appId!)
      let p: AppflowProgress = { ...progress }
      // Import whatever distribution credential exists for each in-scope, migrated
      // platform. A MISSING destination does NOT block — it routes to the step-6
      // gap-fill via getAppflowResumeStep (do NOT early-return; the other platform
      // must still be processed).
      if (inScope(progress.scope, 'ios') && hasCreds(p.ios)) {
        const iosDist = dist.filter((d: any) => d.type === 'iTunes connect')
        const sel = autoSelect(iosDist)
        if (sel && sel !== 'prompt')
          p = { ...p, ios: { ...p.ios, ...(await api.fetchIosDistribution(progress.appId!, (sel as any).id)) } }
      }
      if (inScope(progress.scope, 'android') && hasCreds(p.android)) {
        const andDist = dist.filter((d: any) => d.type === 'google play')
        const sel = autoSelect(andDist)
        if (sel && sel !== 'prompt')
          p = { ...p, android: { ...p.android, ...(await api.fetchAndroidDistribution(progress.appId!, (sel as any).id)) } }
      }
      p = mark(p, 'fetch-distribution')
      return { progress: p, next: getAppflowResumeStep(p) }
    }
    case 'validate': {
      const results = await runValidations(progress, deps)
      return { progress: mark(progress, 'validate'), next: 'validate-results', transient: { results } }
    }
    default:
      return { progress }
  }
}

// ── PlatformFlow adapter ─────────────────────────────────────────────────────
export const appflowFlow: PlatformFlow<AppflowStep, AppflowProgress, AppflowInput> = {
  resumeStep: progress => getAppflowResumeStep(progress),
  viewForStep: (step, progress, ctx) => appflowViewForStep(step, progress, ctx),
  applyInput: (step, progress, input) => applyAppflowInput(step, progress, input),
  runEffect: (step, progress, deps) => runAppflowEffect(step, progress, deps as AppflowEffectDeps),
}
