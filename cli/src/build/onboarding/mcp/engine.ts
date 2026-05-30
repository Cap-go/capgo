// src/build/onboarding/mcp/engine.ts
import type { OnboardingProgress } from '../types.js'
import type { NextStepResult, Platform } from './contract.js'
import { buildAppIdConflictSuggestions } from '../../../init/app-conflict.js'
import { ONBOARDING_RULES } from './contract.js'

/** Facts gathered during preflight; the pure deciders branch only on these. */
export interface PreflightFacts {
  capacitorProject: boolean
  appId?: string
  platformsDetected: Platform[]
  authenticated: boolean
  appRegistered: boolean
}

const ROADMAP: string[] = [
  'Preflight — detect your project & account',
  'Register the app in Capgo',
  'Set up signing credentials',
  'Run your first cloud build',
]

const NEXT_STEP_TOOL = 'capgo_builder_onboarding_next_step'

/** Decide the first/again step for a fresh or resumed session. Pure. */
export function decideStart(facts: PreflightFacts, progress: OnboardingProgress | null): NextStepResult {
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
        instruction: 'Get an API key at app.capgo.io → Account → API keys, then run `npx @capgo/cli login` in your terminal so it is stored locally. Do not paste the key into this chat.',
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
      summary: `Registering "${facts.appId}" in Capgo Cloud…`,
      context: { appId: facts.appId },
      rules: ONBOARDING_RULES,
    }
  }

  return decidePlatform(facts, progress)
}

function decidePlatform(facts: PreflightFacts, _progress: OnboardingProgress | null): NextStepResult {
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

  if (platforms.length === 1)
    return platformChosen(facts, platforms[0])

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

/**
 * Plan 1 stops at the START of the credentials phase. The real per-platform
 * credential flow lands in Plans 3 (Android) and 4 (iOS).
 */
function platformChosen(facts: PreflightFacts, platform: Platform): NextStepResult {
  return {
    onboarding: 'capgo-builder',
    phase: 'credentials',
    state: 'credentials-not-implemented',
    platform,
    progress: 10,
    kind: 'info',
    summary: `Platform "${platform}" selected for "${facts.appId}". The credential setup flow lands in the next milestone.`,
    context: { appId: facts.appId, appRegistered: facts.appRegistered },
    rules: ONBOARDING_RULES,
  }
}

/** Advance one step. Pure. `input.platform` resolves a platform-select choice. */
export function decideAdvance(
  facts: PreflightFacts,
  progress: OnboardingProgress | null,
  input?: { platform?: string },
): NextStepResult {
  if (input?.platform === 'ios' || input?.platform === 'android') {
    if (!facts.authenticated)
      return decideStart(facts, progress)
    if (!facts.appRegistered)
      return decideStart(facts, progress) // register the app before credentials
    return platformChosen(facts, input.platform)
  }
  // No explicit input → re-orient (idempotent): re-run the start decision.
  return decideStart(facts, progress)
}

/** IO surface the orchestrators depend on. Injected so the flow is testable headlessly. */
export interface EngineDeps {
  cwd: string
  hasSavedKey: () => boolean
  getAppId: () => Promise<string | undefined>
  detectPlatforms: () => Promise<Platform[]>
  isAppRegistered: (appId: string) => Promise<boolean>
  loadProgress: (appId: string) => Promise<OnboardingProgress | null>
  registerApp: (appId: string) => Promise<{ ok: true } | { ok: false, alreadyExists: boolean, error: string }>
}

/** Gather preflight facts via the injected deps. */
export async function gatherFacts(deps: EngineDeps): Promise<PreflightFacts> {
  const appId = await deps.getAppId()
  const authenticated = deps.hasSavedKey()

  if (!appId)
    return { capacitorProject: false, appId: undefined, platformsDetected: [], authenticated, appRegistered: false }

  const platformsDetected = await deps.detectPlatforms()
  const appRegistered = authenticated ? await deps.isAppRegistered(appId) : false
  return { capacitorProject: true, appId, platformsDetected, authenticated, appRegistered }
}

const MAX_AUTO_STEPS = 8

function appConflictResult(appId: string): NextStepResult {
  return {
    onboarding: 'capgo-builder',
    phase: 'app',
    state: 'app-id-conflict',
    progress: 8,
    kind: 'human_gate',
    summary: `The app id "${appId}" already exists and is not in your account. You'll need a different app id.`,
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

/**
 * Perform an executable auto step's side effect. Returns a terminal directive
 * to stop on, or null to signal "executed; re-decide".
 */
async function executeAuto(
  result: NextStepResult,
  facts: PreflightFacts,
  deps: EngineDeps,
): Promise<NextStepResult | null> {
  if (result.state === 'registering-app' && facts.appId) {
    const reg = await deps.registerApp(facts.appId)
    if (reg.ok)
      return null
    if (reg.alreadyExists)
      return appConflictResult(facts.appId)
    return {
      onboarding: 'capgo-builder',
      phase: 'app',
      state: 'register-app-failed',
      progress: 8,
      kind: 'error',
      summary: `Could not register "${facts.appId}" in Capgo: ${reg.error}`,
      rules: ONBOARDING_RULES,
    }
  }
  // Unknown auto step — surface it rather than silently looping.
  return result
}

/** Gather → decide → execute auto steps → repeat until a terminal directive. */
async function drive(deps: EngineDeps, input?: { platform?: string }): Promise<NextStepResult> {
  for (let i = 0; i < MAX_AUTO_STEPS; i++) {
    const facts = await gatherFacts(deps)
    const progress = facts.appId ? await deps.loadProgress(facts.appId) : null
    const result = decideAdvance(facts, progress, input)
    if (result.kind !== 'auto')
      return result
    const afterExec = await executeAuto(result, facts, deps)
    if (afterExec !== null)
      return afterExec
  }
  return {
    onboarding: 'capgo-builder',
    phase: 'preflight',
    state: 'auto-loop-guard',
    progress: 0,
    kind: 'error',
    summary: 'Onboarding stalled (too many automatic steps without progress). Please retry or run `capgo doctor`.',
    rules: ONBOARDING_RULES,
  }
}

/** Orient/resume — runs the drive loop with no input. */
export async function runStart(deps: EngineDeps): Promise<NextStepResult> {
  return drive(deps, undefined)
}

/** Advance one step, carrying the user's choice/values. */
export async function runAdvance(deps: EngineDeps, input?: { platform?: string }): Promise<NextStepResult> {
  return drive(deps, input)
}
