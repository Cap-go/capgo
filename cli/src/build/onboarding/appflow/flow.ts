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

// Outcome of an injected credential generator. `ok` true => `creds` holds the
// Capgo cred fields to merge into the platform record (e.g. APPLE_KEY_* or
// PLAY_CONFIG_JSON). `ok` false => `message` explains why (surfaced, advisory).
export interface AppflowGenerateResult {
  ok: boolean
  creds?: Record<string, string>
  message?: string
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
  // injected credential generators (step-6 gap-fill / step-8 p8 upgrade). Each
  // DRIVES an existing standalone sub-flow (iOS asc-key helper / Android Google
  // Play service-account primitives) and returns the Capgo cred fields to merge.
  // Advisory: on a non-ok outcome the flow records the message and continues —
  // generation NEVER blocks the migration. `creds` is undefined unless ok.
  generateIosP8Key?: () => Promise<AppflowGenerateResult>
  generateAndroidServiceAccount?: (opts: { packageName?: string }) => Promise<AppflowGenerateResult>
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

// Minimal typed shapes for the Appflow GraphQL/REST list responses the flow
// inspects (tightens the prior `any` filters). Only the fields the flow reads.
export interface AppflowCert { tag?: string, name?: string, type?: string, credentials?: { ios?: unknown, android?: unknown } }
export interface AppflowDistCred { id?: number | string, type?: string, name?: string }

// Resolve which signing certificate to download:
//  - a previously stored tag (user already picked from select-*-cert) → use it
//  - exactly one cert → its tag (auto-select)
//  - 2+ certs and nothing stored → 'prompt' (show the picker, exactly once)
//  - none / no tag available → null (nothing to download)
function resolveCertTag(certs: AppflowCert[], storedTag: string | undefined): string | 'prompt' | null {
  if (storedTag) {
    const match = certs.find(c => c.tag === storedTag)
    return match?.tag ?? storedTag
  }
  const sel = autoSelect(certs)
  if (sel === 'prompt')
    return 'prompt'
  return sel?.tag ?? null
}

// Build the picker options for a cert list (value = the profile tag).
function certOptions(certs: AppflowCert[]): StepView['options'] {
  return certs
    .filter(c => !!c.tag)
    .map(c => ({ value: c.tag!, label: c.name ?? c.tag!, note: c.type }))
}

// Resolve which distribution credential id to download (same contract as certs,
// keyed by the credential id rather than a tag).
function resolveDistId(creds: AppflowDistCred[], storedId: string | undefined): string | 'prompt' | null {
  if (storedId) {
    const match = creds.find(c => String(c.id) === storedId)
    return match ? String(match.id) : storedId
  }
  const sel = autoSelect(creds)
  if (sel === 'prompt')
    return 'prompt'
  return sel?.id !== undefined ? String(sel.id) : null
}

function distOptions(creds: AppflowDistCred[]): StepView['options'] {
  return creds
    .filter(c => c.id !== undefined)
    .map(c => ({ value: String(c.id), label: c.name ?? `${c.type ?? 'credential'} ${c.id}`, note: c.type }))
}

const inScope = (scope: AppflowProgress['scope'], p: 'ios' | 'android'): boolean => scope === 'both' || scope === p

const hasCreds = (rec?: Record<string, string>): boolean => !!rec && Object.keys(rec).length > 0

// iOS distribution (upload destination) is present iff an app-specific password
// was imported OR an App Store Connect API key (.p8, APPLE_KEY_ID) is set — the
// latter is what the gap-fill / p8-upgrade 'generate' path produces.
function iosDistMissing(p: AppflowProgress): boolean {
  return inScope(p.scope, 'ios') && hasCreds(p.ios) && !p.ios!.FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD && !p.ios!.APPLE_KEY_ID
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
    case 'select-ios-dist':
      return { kind: 'choice', prompt: 'Which iOS upload (App Store) credential to migrate?', options: (ctx.options as StepView['options']) ?? [] }
    case 'select-android-dist':
      return { kind: 'choice', prompt: 'Which Android upload (Google Play) credential to migrate?', options: (ctx.options as StepView['options']) ?? [] }
    case 'no-signing-submenu': {
      const label = noSigningPlatformLabel(progress)
      const native = progress.noSigningScope === 'android' ? 'Android' : 'iOS'
      return {
        kind: 'choice',
        prompt: `${label} cannot be migrated - no signing configuration exists for this app in Appflow.`,
        options: [
          { value: 'email-support', label: `I believe credentials exist - email ${SUPPORT}` },
          { value: 'skip', label: `I understand, do not migrate ${label}` },
          { value: 'abandon', label: `Abandon Appflow migration and start ${native} onboarding instead` },
          { value: 'go-back', label: 'Go back (re-pick the Appflow app)' },
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
          // The end-to-end service-account "generate" orchestration is interactive
          // and not driven here, so present the HONEST option: finish it via the
          // dedicated Android setup, or skip. (No fake "generates now" success.)
          { value: 'generate', label: 'Set up a service account via `capgo build setup --android` (guided)' },
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
      const notes = progress.notes ?? []
      const resultLines = results.length
        ? `Validation results:\n${results.map(r => `${r.status === 'pass' ? 'OK' : r.status === 'warn' ? 'WARNING' : 'skipped'}: ${r.message}`).join('\n')}\nValidation never blocks - you can continue.`
        : 'No credentials to validate. Continuing.'
      // Surface any advisory notes accumulated by the auto generate steps (e.g. a
      // p8 / service-account setup that couldn't complete here) — otherwise the
      // feedback is lost when validate overwrites the transient ctx.
      const noteLines = notes.length ? `\n\nNotes:\n${notes.map(n => `- ${n}`).join('\n')}` : ''
      return {
        kind: 'info',
        prompt: `${resultLines}${noteLines}`,
        options: [{ value: 'continue', label: 'Continue' }],
        context: { results, notes },
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
    case 'ios-p8-generate':
      // AUTO: runAppflowEffect drives the shared asc-key .p8 generate/provide
      // sub-flow, merges APPLE_KEY_* into ios, then continues via the graph.
      return { kind: 'auto', prompt: 'Setting up an App Store Connect API key (.p8)…' }
    case 'android-sa-generate':
      // AUTO: runAppflowEffect drives the shared Google Play service-account
      // sub-flow, merges PLAY_CONFIG_JSON into android, then continues.
      return { kind: 'auto', prompt: 'Setting up a Google Play service account…' }
    case 'authenticating':
    case 'fetch-orgs':
    case 'fetch-apps':
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
    case 'select-ios-cert':
      // Store the chosen profile tag so fetch-signing downloads THIS cert on
      // re-entry instead of re-prompting (defeats the multi-cert livelock).
      return { ...base, iosCertTag: input.value }
    case 'select-android-cert':
      return { ...base, androidCertTag: input.value }
    case 'select-ios-dist':
      // Store the chosen distribution-credential id; fetch-distribution downloads
      // exactly that one on re-entry (no silent drop, no re-prompt loop).
      return { ...base, iosDistId: input.value }
    case 'select-android-dist':
      return { ...base, androidDistId: input.value }
    case 'no-signing-submenu':
      // 'skip' marks the affected platform non-migratable. 'go-back' rewinds to
      // the app picker (clears appId + the fetch-signing completion) so the user
      // can re-select. 'email-support'/'abandon' are acted on by the driver
      // (surface support / start native onboarding); state is left intact.
      if (input.value === 'go-back') {
        return {
          ...base,
          appId: undefined,
          appSlug: undefined,
          noSigningScope: undefined,
          completedSteps: completed.filter(s => s !== 'fetch-signing' && s !== 'select-app' && s !== 'fetch-apps'),
        }
      }
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
  // step 3: organization. fetch-orgs (auto) populates the picker / auto-selects a
  // single org. If it already ran (2+ orgs) and the user hasn't picked, prompt.
  if (!progress.orgSlug)
    return done('fetch-orgs') ? 'select-org' : 'fetch-orgs'
  // step 4: app. Same shape.
  if (!progress.appId)
    return done('fetch-apps') ? 'select-app' : 'fetch-apps'
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
  // gap-fill 'generate' chose to set up an upload destination NOW: drive the
  // shared generate sub-flow (auto effect), capture creds, then continue. Runs
  // at most once (done-guarded); a non-ok outcome records a note and proceeds.
  if (progress.iosDistGapfill === 'generate' && !done('ios-p8-generate'))
    return 'ios-p8-generate'
  if (progress.androidDistGapfill === 'generate' && !done('android-sa-generate'))
    return 'android-sa-generate'
  // step-7 validation (auto step; runs the advisory checks).
  if (!done('validate'))
    return 'validate'
  // step-8 iOS app-specific-password -> .p8 upgrade offer (once).
  if (iosHasAppPassword(progress) && progress.p8Upgrade === undefined)
    return 'p8-upgrade-prompt'
  // step-8 'convert' chose to upgrade the app-specific password to a .p8 API
  // key: drive the SAME shared asc-key generate sub-flow, capture APPLE_KEY_*.
  if (progress.p8Upgrade === 'convert' && !done('ios-p8-generate'))
    return 'ios-p8-generate'
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
      return { progress: mark({ ...progress, token }, 'authenticating'), next: 'fetch-orgs' }
    }
    case 'fetch-orgs': {
      // List the Appflow organizations. 0 → loud error (the API call THROWS on
      // failure, so reaching here with [] means the account genuinely has none).
      // 1 → auto-select and continue. 2+ → mark done + prompt with real options.
      const api = createAppflowApi(progress.token!.access_token, deps.log)
      const orgs = await api.listOrgs()
      const p = mark(progress, 'fetch-orgs')
      if (orgs.length === 0)
        throw new Error('No Appflow organizations are available on this account. Email ' + SUPPORT + ' if you expected one.')
      const sel = autoSelect(orgs)
      if (sel === 'prompt') {
        return { progress: p, next: 'select-org', transient: { options: orgs.map(o => ({ value: o.slug, label: o.name ?? o.slug })) } }
      }
      return { progress: { ...p, orgSlug: sel!.slug }, next: 'fetch-apps' }
    }
    case 'fetch-apps': {
      // List the apps in the chosen org. Same 0/1/2+ contract as fetch-orgs.
      const api = createAppflowApi(progress.token!.access_token, deps.log)
      const apps = await api.listApps(progress.orgSlug!)
      const p = mark(progress, 'fetch-apps')
      if (apps.length === 0)
        throw new Error('No Appflow apps are available in this organization. Email ' + SUPPORT + ' if you expected one.')
      const sel = autoSelect(apps)
      if (sel === 'prompt') {
        return { progress: p, next: 'select-app', transient: { options: apps.map(a => ({ value: a.id, label: a.name ?? a.slug ?? a.id, note: a.slug })) } }
      }
      return { progress: { ...p, appId: sel!.id, appSlug: sel!.slug ?? sel!.id }, next: 'fetch-signing' }
    }
    case 'fetch-signing': {
      const api = createAppflowApi(progress.token!.access_token, deps.log)
      const certs = await api.listCertificates(progress.appId!)
      const iosCerts = certs.filter((c: AppflowCert) => c.credentials?.ios)
      const androidCerts = certs.filter((c: AppflowCert) => c.credentials?.android)
      const migratable = { ios: inScope(progress.scope, 'ios') && iosCerts.length > 0, android: inScope(progress.scope, 'android') && androidCerts.length > 0 }
      // Mark fetch-signing done UP FRONT: re-entry (after the user picks a cert) must
      // NOT route back here and re-prompt. The select-* steps store the chosen tag;
      // we read it on re-entry and download THAT cert. (Defeats the livelock.)
      let p: AppflowProgress = mark({ ...progress, migratable }, 'fetch-signing')
      // Resolve the iOS signing cert: a stored tag (user already picked) wins; else
      // 1 cert auto-selects; 2+ certs with no stored pick → prompt (do NOT loop —
      // fetch-signing is already marked done, so the prompt is shown exactly once).
      if (migratable.ios) {
        const tag = resolveCertTag(iosCerts, progress.iosCertTag)
        if (tag === 'prompt')
          return { progress: p, next: 'select-ios-cert', transient: { options: certOptions(iosCerts) } }
        if (tag)
          p = { ...p, ios: { ...p.ios, ...(await api.fetchIosSigning(progress.appId!, tag)) } }
      }
      // Process Android REGARDLESS of the iOS outcome above (no early-return that
      // abandons the second platform on a scope:'both' app).
      if (migratable.android) {
        const tag = resolveCertTag(androidCerts, progress.androidCertTag)
        if (tag === 'prompt')
          return { progress: p, next: 'select-android-cert', transient: { options: certOptions(androidCerts) } }
        if (tag)
          p = { ...p, android: { ...p.android, ...(await api.fetchAndroidSigning(progress.appId!, tag)) } }
      }
      // On a BOTH-scope migration where exactly one platform has signing, the
      if (progress.scope === 'both' && (migratable.ios !== migratable.android)) {
        const dropped = migratable.ios ? 'Android' : 'iOS'
        const note = `No ${dropped} signing configuration was found in Appflow, so ${dropped} was not migrated. You can set it up later via \`capgo build init\` ${dropped === 'Android' ? '(Android)' : '(iOS)'} onboarding.`
        if (!(p.notes ?? []).includes(note))
          p = { ...p, notes: [...(p.notes ?? []), note] }
      }
      const next = decideAfterFetchSigning(p)
      return { progress: next === 'no-signing-submenu' ? { ...p, noSigningScope: progress.scope === 'both' ? 'all' : progress.scope } : p, next }
    }
    case 'fetch-distribution': {
      const api = createAppflowApi(progress.token!.access_token, deps.log)
      const dist = await api.listDistribution(progress.appId!)
      let p: AppflowProgress = { ...progress }
      // Import whatever distribution credential exists for each in-scope, migrated
      // platform. A MISSING destination does NOT block — it routes to the step-6
      // gap-fill via getAppflowResumeStep. A 2+ ambiguity is RESOLVED by the
      // select-* prompt (store id, re-enter) — not silently dropped. We mark
      // fetch-distribution done up front so the prompt round-trip cannot loop;
      // the stored id is consulted on re-entry. (Do NOT early-return abandoning
      // the second platform.)
      p = mark(p, 'fetch-distribution')
      if (inScope(progress.scope, 'ios') && hasCreds(p.ios)) {
        const iosDist = dist.filter((d: AppflowDistCred) => d.type === 'iTunes connect')
        const id = resolveDistId(iosDist, progress.iosDistId)
        if (id === 'prompt')
          return { progress: p, next: 'select-ios-dist', transient: { options: distOptions(iosDist) } }
        if (id !== null)
          p = { ...p, ios: { ...p.ios, ...(await api.fetchIosDistribution(progress.appId!, id)) } }
      }
      if (inScope(progress.scope, 'android') && hasCreds(p.android)) {
        const andDist = dist.filter((d: AppflowDistCred) => d.type === 'google play')
        const id = resolveDistId(andDist, progress.androidDistId)
        if (id === 'prompt')
          return { progress: p, next: 'select-android-dist', transient: { options: distOptions(andDist) } }
        if (id !== null)
          p = { ...p, android: { ...p.android, ...(await api.fetchAndroidDistribution(progress.appId!, id)) } }
      }
      return { progress: p, next: getAppflowResumeStep(p) }
    }
    case 'ios-p8-generate': {
      // Drive the existing standalone asc-key .p8 generate/provide sub-flow via
      // the injected generator. On success, merge the produced APPLE_KEY_* fields
      // into ios and drop any imported app-specific password (the .p8 supersedes
      // it — and clears the step-8 upgrade re-trigger). Advisory: a non-ok
      // outcome (or absent dep, e.g. non-macOS) records a note and continues.
      let p: AppflowProgress = { ...progress }
      let note: string | undefined
      try {
        const r = await deps.generateIosP8Key?.()
        if (r === undefined)
          note = 'App Store Connect API key setup is unavailable here — skipped (set up later).'
        else if (r.ok && r.creds) {
          const { FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD: _drop, ...keepIos } = { ...p.ios }
          p = { ...p, ios: { ...keepIos, ...r.creds } }
        }
        else
          note = `App Store Connect API key setup did not complete: ${r.message ?? 'unknown'}. You can set it up later.`
      }
      catch (e) {
        note = `App Store Connect API key setup skipped: ${e instanceof Error ? e.message : String(e)}.`
      }
      p = mark(p, 'ios-p8-generate')
      if (note)
        p = { ...p, notes: [...(p.notes ?? []), note] }
      return { progress: p, next: getAppflowResumeStep(p), transient: note ? { note } : undefined }
    }
    case 'android-sa-generate': {
      // Drive the existing standalone Google Play service-account sub-flow via
      // the injected generator. On success, merge PLAY_CONFIG_JSON into android.
      // Advisory: a non-ok outcome (or absent dep) records a note and continues.
      let p: AppflowProgress = { ...progress }
      let note: string | undefined
      try {
        const r = await deps.generateAndroidServiceAccount?.({ packageName: deps.appId })
        if (r === undefined)
          note = 'Google Play service-account setup is unavailable here — skipped (set up later).'
        else if (r.ok && r.creds)
          p = { ...p, android: { ...p.android, ...r.creds } }
        else
          note = `Google Play service-account setup did not complete: ${r.message ?? 'unknown'}. You can set it up later.`
      }
      catch (e) {
        note = `Google Play service-account setup skipped: ${e instanceof Error ? e.message : String(e)}.`
      }
      p = mark(p, 'android-sa-generate')
      if (note)
        p = { ...p, notes: [...(p.notes ?? []), note] }
      return { progress: p, next: getAppflowResumeStep(p), transient: note ? { note } : undefined }
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
