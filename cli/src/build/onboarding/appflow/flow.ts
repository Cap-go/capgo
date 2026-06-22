// Appflow migration flow. Returns the neutral StepView (flow/contract.ts) directly
// and implements PlatformFlow so the engine drives it like ios/android. The flow
// is a CREDENTIAL SOURCE: it collects per-platform Capgo creds into progress, then
// hands off to the existing build/validate/CI tail. It NEVER generates signing
// creds (migrate-or-skip); gap-fill generation exists only for step-6 distribution.
import type { PlatformFlow, StepView } from '../flow/contract'
import type { AppflowInput, AppflowProgress, AppflowStep } from './types'
import type { AppflowToken } from './auth'
import { isExpired, loginWithBrowser, refresh } from './auth'
import { createAppflowApi } from './api'

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
  carried?: Record<string, unknown>
}

const SUPPORT = 'support@capgo.app'

// ── pure helpers (unit-tested) ───────────────────────────────────────────────
export function autoSelect<T>(items: T[]): T | 'prompt' | null {
  if (!items || items.length === 0)
    return null
  if (items.length === 1)
    return items[0]
  return 'prompt'
}

const inScope = (scope: AppflowProgress['scope'], p: 'ios' | 'android'): boolean => scope === 'both' || scope === p

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

  return out
}

// ── views ────────────────────────────────────────────────────────────────────
function noSigningPlatformLabel(progress: AppflowProgress): string {
  return progress.noSigningScope === 'ios' ? 'iOS' : progress.noSigningScope === 'android' ? 'Android' : 'this app'
}

export function appflowViewForStep(step: AppflowStep, progress: AppflowProgress, ctx: Record<string, unknown> = {}): StepView {
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
    case 'validate': {
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
  switch (step) {
    case 'select-org':
      return { ...base, orgSlug: input.value }
    case 'select-app':
      return { ...base, appId: input.value, appSlug: input.text ?? input.value }
    case 'no-signing-submenu':
      return { ...base, ...(input.value === 'skip' && progress.noSigningScope && progress.noSigningScope !== 'all' ? { migratable: { ...progress.migratable, [progress.noSigningScope]: false } } : {}) }
    default:
      return base
  }
}

// ── resume ───────────────────────────────────────────────────────────────────
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
  if (!done('validate'))
    return 'validate'
  return 'handoff-build'
}

// ── effects ──────────────────────────────────────────────────────────────────
export async function runAppflowEffect(step: AppflowStep, progress: AppflowProgress, deps: AppflowEffectDeps): Promise<AppflowEffectResult> {
  const mark = (p: AppflowProgress, s: AppflowStep): AppflowProgress => ({ ...p, completedSteps: p.completedSteps.includes(s) ? p.completedSteps : [...p.completedSteps, s] })
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
      if (inScope(progress.scope, 'ios') && p.ios) {
        const iosDist = dist.filter((d: any) => d.type === 'iTunes connect')
        const sel = autoSelect(iosDist)
        if (sel && sel !== 'prompt')
          p = { ...p, ios: { ...p.ios, ...(await api.fetchIosDistribution(progress.appId!, (sel as any).id)) } }
        else if (sel === null)
          return { progress: p, next: 'ios-dist-gapfill' }
      }
      if (inScope(progress.scope, 'android') && p.android) {
        const andDist = dist.filter((d: any) => d.type === 'google play')
        const sel = autoSelect(andDist)
        if (sel && sel !== 'prompt')
          p = { ...p, android: { ...p.android, ...(await api.fetchAndroidDistribution(progress.appId!, (sel as any).id)) } }
        else if (sel === null)
          return { progress: p, next: 'android-dist-gapfill' }
      }
      return { progress: mark(p, 'fetch-distribution'), next: 'validate' }
    }
    case 'validate': {
      const results = await runValidations(progress, deps)
      return { progress: mark(progress, 'validate'), next: 'handoff-build', transient: { results } }
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
