// src/build/onboarding/mcp/engine.ts
import type { AndroidOnboardingProgress } from '../android/types.js'
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
  keyId?: string
  issuerId?: string
  p8Path?: string
}

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

  // Resume an in-flight platform credential flow so credential-submission calls
  // that omit `platform` aren't bounced back to platform selection.
  const active = activePlatform(facts)
  if (active === 'android')
    return decideAndroid(facts)
  if (active === 'ios')
    return decideIos(facts)

  return decidePlatform(facts, progress)
}

/** Which platform's credential flow is already in progress (if any). */
function activePlatform(facts: PreflightFacts): Platform | null {
  const a = facts.androidProgress
  if (a && (Boolean(a.completedSteps?.keystoreReady) || Boolean(a.serviceAccountJsonPath)))
    return 'android'
  const i = facts.iosProgress
  if (i && (Boolean(i.keyId) || Boolean(i.p8Path) || Boolean(i.completedSteps?.apiKeyVerified)))
    return 'ios'
  return null
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
 * Route to the per-platform credential sub-flow. Android lands in this plan;
 * iOS credential setup lands in Plan 4.
 */
function platformChosen(facts: PreflightFacts, platform: Platform): NextStepResult {
  if (platform === 'android')
    return decideAndroid(facts)

  return decideIos(facts)
}

/**
 * iOS credential sub-flow decider (create-new). Pure — branches on the persisted
 * OnboardingProgress. The user supplies an App Store Connect API key (.p8 + IDs);
 * the finalize step verifies it and creates the certificate + provisioning profile.
 */
export function decideIos(facts: PreflightFacts): NextStepResult {
  const p = facts.iosProgress
  const done = p?.completedSteps ?? {}

  if (!p?.keyId || !p?.issuerId || !p?.p8Path) {
    return {
      onboarding: 'capgo-builder',
      phase: 'credentials',
      state: 'ios-api-key',
      platform: 'ios',
      progress: 25,
      kind: 'human_gate',
      summary: `Set up iOS signing for "${facts.appId}". I need an App Store Connect API key.`,
      human: {
        instruction: 'In App Store Connect → Users and Access → Integrations → App Store Connect API, create a key with App Manager access and download the .p8 (you can only download it once). Then give me the Key ID, the Issuer ID, and the path to the .p8 file. The .p8 stays on your machine — do not paste its contents here.',
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

  if (!done.profileCreated) {
    return {
      onboarding: 'capgo-builder',
      phase: 'credentials',
      state: 'ios-finalize',
      platform: 'ios',
      progress: 70,
      kind: 'auto',
      summary: 'Verifying your App Store Connect key, creating the distribution certificate + provisioning profile, and saving credentials…',
      context: { appId: facts.appId },
      rules: ONBOARDING_RULES,
    }
  }

  return decideBuildPhase(facts, 'ios')
}

/**
 * Android credential sub-flow decider. Pure — branches on the persisted
 * AndroidOnboardingProgress (reused from the existing wizard). This plan
 * implements the keystore step; later steps (Google sign-in, GCP service
 * account, Play invite, validate, save) extend this switch.
 */
export function decideAndroid(facts: PreflightFacts): NextStepResult {
  const done = facts.androidProgress?.completedSteps ?? {}

  if (!done.keystoreReady) {
    return {
      onboarding: 'capgo-builder',
      phase: 'credentials',
      state: 'android-keystore',
      platform: 'android',
      progress: 20,
      kind: 'auto',
      summary: `Generating an Android signing keystore for "${facts.appId}" (stored locally, never uploaded to Capgo)…`,
      context: { appId: facts.appId },
      rules: ONBOARDING_RULES,
    }
  }

  const p = facts.androidProgress

  // Provision via an existing Google Play service account (no OAuth): the user
  // supplies their service-account JSON; we validate it and save credentials.
  if (!p?.serviceAccountJsonPath) {
    return {
      onboarding: 'capgo-builder',
      phase: 'credentials',
      state: 'android-service-account',
      platform: 'android',
      progress: 45,
      kind: 'human_gate',
      summary: `Keystore ready for "${facts.appId}". Now connect Google Play with a service-account key.`,
      human: {
        instruction: 'In Google Cloud Console, create (or reuse) a service account that has access to your Google Play app, and download its key as JSON. Then give me the path to that .json file. The file stays on your machine — do not paste its contents here.',
      },
      collect: [{ field: 'serviceAccountJsonPath', desc: 'absolute path to the Google Play service-account .json file' }],
      next: {
        tool: NEXT_STEP_TOOL,
        with: { serviceAccountJsonPath: '<path>' },
        instruction: 'Ask the user for the service-account .json file path, then call next_step with serviceAccountJsonPath.',
        call: `${NEXT_STEP_TOOL}({ serviceAccountJsonPath: "/path/to/service-account.json" })`,
      },
      rules: ONBOARDING_RULES,
    }
  }

  if (!done.serviceAccountProvisioned) {
    return {
      onboarding: 'capgo-builder',
      phase: 'credentials',
      state: 'android-finalize',
      platform: 'android',
      progress: 70,
      kind: 'auto',
      summary: 'Validating the service account and saving your Android build credentials…',
      context: { appId: facts.appId },
      rules: ONBOARDING_RULES,
    }
  }

  return decideBuildPhase(facts, 'android')
}

/**
 * Shared build phase — once a platform's credentials are saved, offer to run
 * the first cloud build. The trigger happens via next_step({ runBuild }) (handled
 * in `drive`); this step just presents the choice.
 */
function decideBuildPhase(facts: PreflightFacts, platform: Platform): NextStepResult {
  return {
    onboarding: 'capgo-builder',
    phase: 'build',
    state: 'build-ready',
    platform,
    progress: 90,
    kind: 'choice',
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

/** Advance one step. Pure. `input.platform` resolves a platform-select choice. */
export function decideAdvance(
  facts: PreflightFacts,
  progress: OnboardingProgress | null,
  input?: OnboardingInput,
): NextStepResult {
  if (input?.platform === 'ios' || input?.platform === 'android') {
    if (!facts.authenticated)
      return decideStart(facts, progress)
    if (!facts.platformsDetected.includes(input.platform))
      return decideStart(facts, progress) // ignore a platform the project doesn't have
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
  loadAndroidProgress: (appId: string) => Promise<AndroidOnboardingProgress | null>
  generateAndroidKeystore: (appId: string) => Promise<void>
  setAndroidServiceAccountPath: (appId: string, path: string) => Promise<void>
  finalizeAndroidCredentials: (appId: string) => Promise<{ ok: true } | { ok: false, error: string }>
  requestFirstBuild: (appId: string, platform: Platform) => Promise<{ ok: true, jobId?: string, status?: string } | { ok: false, error: string }>
  setIosApiKey: (appId: string, keyId: string, issuerId: string, p8Path: string) => Promise<void>
  finalizeIosCredentials: (appId: string) => Promise<{ ok: true } | { ok: false, error: string }>
}

/** Gather preflight facts via the injected deps. */
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
  if (result.state === 'android-keystore' && facts.appId) {
    await deps.generateAndroidKeystore(facts.appId)
    return null
  }
  if (result.state === 'android-finalize' && facts.appId) {
    const fin = await deps.finalizeAndroidCredentials(facts.appId)
    if (fin.ok)
      return null
    return {
      onboarding: 'capgo-builder',
      phase: 'credentials',
      state: 'android-service-account-invalid',
      platform: 'android',
      progress: 45,
      kind: 'human_gate',
      summary: `That service-account JSON could not be validated: ${fin.error}`,
      human: {
        instruction: 'Provide the path to a valid Google Play service-account .json (with access to your app). The file stays on your machine — do not paste its contents here.',
      },
      collect: [{ field: 'serviceAccountJsonPath', desc: 'absolute path to a valid service-account .json file' }],
      next: {
        tool: NEXT_STEP_TOOL,
        with: { serviceAccountJsonPath: '<path>' },
        instruction: 'Ask the user for a corrected service-account .json path, then call next_step with serviceAccountJsonPath.',
        call: `${NEXT_STEP_TOOL}({ serviceAccountJsonPath: "/path/to/service-account.json" })`,
      },
      rules: ONBOARDING_RULES,
    }
  }
  if (result.state === 'ios-finalize' && facts.appId) {
    const fin = await deps.finalizeIosCredentials(facts.appId)
    if (fin.ok)
      return null
    return {
      onboarding: 'capgo-builder',
      phase: 'credentials',
      state: 'ios-credentials-failed',
      platform: 'ios',
      progress: 25,
      kind: 'human_gate',
      summary: `iOS signing setup failed: ${fin.error}`,
      human: {
        instruction: 'This often means the API key lacks access, the .p8 moved, or Apple\'s certificate limit was hit. Provide corrected Key ID / Issuer ID / .p8 path, then continue.',
      },
      collect: [
        { field: 'keyId', desc: 'the Key ID' },
        { field: 'issuerId', desc: 'the Issuer ID' },
        { field: 'p8Path', desc: 'absolute path to the .p8 file' },
      ],
      next: {
        tool: NEXT_STEP_TOOL,
        with: { keyId: '<keyId>', issuerId: '<issuerId>', p8Path: '<path>' },
        instruction: 'Collect corrected values from the user, then call next_step with keyId, issuerId, p8Path.',
        call: `${NEXT_STEP_TOOL}({ keyId: "ABC123", issuerId: "1a2b-...", p8Path: "/path/to/AuthKey.p8" })`,
      },
      rules: ONBOARDING_RULES,
    }
  }
  // Unknown auto step — surface it rather than silently looping.
  return result
}

/** Gather → decide → execute auto steps → repeat until a terminal directive. */
function buildResult(
  appId: string,
  platform: Platform,
  res: { ok: true, jobId?: string, status?: string } | { ok: false, error: string },
): NextStepResult {
  if (res.ok) {
    return {
      onboarding: 'capgo-builder',
      phase: 'done',
      state: 'build-requested',
      platform,
      progress: 100,
      kind: 'done',
      summary: `First cloud build requested for "${appId}" (${platform}) — compiling in the cloud (job ${res.jobId ?? 'pending'}, status: ${res.status ?? 'queued'}). Onboarding complete! 🎉`,
      context: { appId, platform, jobId: res.jobId, status: res.status },
      rules: ONBOARDING_RULES,
    }
  }
  return {
    onboarding: 'capgo-builder',
    phase: 'build',
    state: 'build-failed',
    platform,
    progress: 90,
    kind: 'error',
    summary: `Could not start the build: ${res.error}`,
    rules: ONBOARDING_RULES,
  }
}

async function drive(deps: EngineDeps, input?: OnboardingInput): Promise<NextStepResult> {
  // Build trigger is a terminal action (not a persisted step).
  if (input?.runBuild) {
    const buildAppId = await deps.getAppId()
    const buildPlatform = input.platform === 'ios' || input.platform === 'android' ? input.platform : undefined
    if (buildAppId && buildPlatform)
      return buildResult(buildAppId, buildPlatform, await deps.requestFirstBuild(buildAppId, buildPlatform))
  }
  // Explicit "skip the first build" → onboarding is complete.
  if (input?.runBuild === false) {
    const skipAppId = await deps.getAppId()
    const skipPlatform = input.platform === 'ios' || input.platform === 'android' ? input.platform : undefined
    if (skipAppId && skipPlatform) {
      return {
        onboarding: 'capgo-builder',
        phase: 'done',
        state: 'build-skipped',
        platform: skipPlatform,
        progress: 100,
        kind: 'done',
        summary: `Credentials for "${skipAppId}" (${skipPlatform}) are saved. You can start your first cloud build anytime.`,
        rules: ONBOARDING_RULES,
      }
    }
  }
  // Persist any provided inputs (side effects) before the decide loop.
  if (input?.serviceAccountJsonPath) {
    const inputAppId = await deps.getAppId()
    if (inputAppId)
      await deps.setAndroidServiceAccountPath(inputAppId, input.serviceAccountJsonPath)
  }
  if (input?.keyId && input?.issuerId && input?.p8Path) {
    const inputAppId = await deps.getAppId()
    if (inputAppId)
      await deps.setIosApiKey(inputAppId, input.keyId, input.issuerId, input.p8Path)
  }
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
export async function runAdvance(deps: EngineDeps, input?: OnboardingInput): Promise<NextStepResult> {
  return drive(deps, input)
}
