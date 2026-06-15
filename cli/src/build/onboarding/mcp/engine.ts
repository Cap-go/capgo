// src/build/onboarding/mcp/engine.ts
import type { AndroidOnboardingProgress, AndroidOnboardingStep } from '../android/types.js'
import type { AndroidEffectDeps, AndroidStepCtx } from '../android/flow.js'
import type { OnboardingProgress } from '../types.js'
import type { NextStepResult, Platform } from './contract.js'
import type { BuildOutputRecord } from '../../output-record.js'
import { buildAppIdConflictSuggestions } from '../../../init/app-conflict.js'
import { ONBOARDING_RULES } from './contract.js'
import { explainForState } from './explanations.js'
import { isSafeAppIdForCommand } from './app-id-validation.js'
import { ANDROID_STEP_PROGRESS } from '../android/types.js'
import { getAndroidResumeStep } from '../android/progress.js'
import { validateStepInput, validateStorePassword } from './step-input.js'
import { androidViewForStep, applyAndroidInput, applyGoogleSignIn, runAndroidEffect } from '../android/flow.js'
import { beginOAuthSession, clearOAuthSession, pollOAuthSession } from './oauth-session.js'

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
    return decideIos(facts)

  // Single android platform with no in-flight progress → auto-route to android.
  if (facts.platformsDetected.length === 1 && facts.platformsDetected[0] === 'android')
    return decideAndroid(facts, deps)

  return decidePlatform(facts, progress)
}

/** Which platform's credential flow is already in progress (if any). */
function activePlatform(facts: PreflightFacts): Platform | null {
  const a = facts.androidProgress
  if (a && (a.activePlatform === 'android' || Boolean(a.completedSteps?.keystoreReady) || Boolean(a.serviceAccountForkSeen)))
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

  if (platforms.length === 1) {
    // Single-platform (ios only): auto-route to ios. Single android is handled
    // via decideAndroid in the async path (activePlatform or platform selection).
    return decideIos(facts)
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

  if (!done.profileCreated) {
    return {
      onboarding: 'capgo-builder',
      phase: 'credentials',
      state: 'ios-finalize',
      platform: 'ios',
      progress: 70,
      kind: 'auto',
      summary: 'Verifying your App Store Connect key, creating the distribution certificate + provisioning profile, and saving credentials...',
      context: { appId: facts.appId },
      rules: ONBOARDING_RULES,
    }
  }

  return decideBuildPhase(facts, 'ios')
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
      return {
        ...base,
        kind: 'human_gate',
        summary: `Android setup: ${view.step}`,
        human: { instruction: 'Continue when ready.' },
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
  opts?: { signInProceed?: boolean },
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
  let forcedNextStep: AndroidOnboardingStep | undefined
  // Track whether we've already written the .p12 file this invocation so we only write once.
  let keystoreFileWritten = false

  for (let i = 0; i < MAX_AUTO_STEPS; i++) {
    const step = forcedNextStep ?? getAndroidResumeStep(progress)
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
      const r = await runAndroidEffect(step, progress, deps.androidEffectDeps)
      progress = r.progress
      const transient = r.transient ?? {}
      ctx = { ...ctx, ...transient }

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

export async function decideAdvance(
  facts: PreflightFacts,
  progress: OnboardingProgress | null,
  input: OnboardingInput | undefined,
  deps: EngineDeps,
): Promise<NextStepResult> {
  if (input?.platform === 'ios' || input?.platform === 'android') {
    if (!facts.authenticated)
      return decideStart(facts, progress, deps)
    if (!facts.platformsDetected.includes(input.platform))
      return decideStart(facts, progress, deps)
    if (!facts.appRegistered)
      return decideStart(facts, progress, deps)
    if (input.platform === 'android')
      return decideAndroid(facts, deps)
    return decideIos(facts)
  }
  // No platform supplied → resume the active flow if one exists, so a mid-flow
  // next_step that omits `platform` does not bounce back to platform-select.
  const active = activePlatform(facts)
  if (active === 'android')
    return decideAndroid(facts, deps)
  if (active === 'ios')
    return decideIos(facts)
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
  finalizeAndroidCredentials: (appId: string) => Promise<{ ok: true } | { ok: false, error: string }>
  readBuildRecord: (path: string) => Promise<BuildOutputRecord | null>
  buildRecordPath: (appId: string, platform: Platform) => string
  setIosApiKey: (appId: string, keyId: string, issuerId: string, p8Path: string) => Promise<void>
  finalizeIosCredentials: (appId: string) => Promise<{ ok: true } | { ok: false, error: string }>
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
  if (result.state === 'android-finalize' && facts.appId) {
    const fin = await deps.finalizeAndroidCredentials(facts.appId)
    if (fin.ok)
      return null
    return {
      onboarding: 'capgo-builder', phase: 'credentials', state: 'android-service-account-invalid', platform: 'android', progress: 45, kind: 'human_gate',
      summary: `That service-account JSON could not be validated: ${fin.error}`,
      human: { instruction: 'Provide the path to a valid Google Play service-account .json (with access to your app). The file stays on your machine do not paste its contents here.' },
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
      onboarding: 'capgo-builder', phase: 'credentials', state: 'ios-credentials-failed', platform: 'ios', progress: 25, kind: 'human_gate',
      summary: `iOS signing setup failed: ${fin.error}`,
      human: { instruction: "This often means the API key lacks access, the .p8 moved, or Apple's certificate limit was hit. Provide corrected Key ID / Issuer ID / .p8 path, then continue." },
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
      if (rec.status === 'success' || Boolean(rec.outputUrl))
        return buildDoneResult(checkAppId, checkPlatform, rec)
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

  const androidInputPresent = input && (
    input.serviceAccountMethod !== undefined
    || input.playDeveloperId !== undefined
    || input.gcpProjectId !== undefined
    || input.gcpProjectName !== undefined
    || input.androidPackage !== undefined
    || input.serviceAccountJsonPath !== undefined
    || input.saMethodChoice !== undefined
    || input.credentialsExistChoice !== undefined
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
  // three-field step and the bare-{} sign-in-proceed path never set
  // androidInputPresent, so they are unaffected.
  if (androidInputPresent) {
    const gateAppId = await deps.getAppId()
    if (gateAppId) {
      const gateProgress = await deps.loadAndroidProgress(gateAppId)
      const currentStep = getAndroidResumeStep(gateProgress)
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

  if (input?.keyId && input?.issuerId && input?.p8Path) {
    const inputAppId = await deps.getAppId()
    if (inputAppId)
      await deps.setIosApiKey(inputAppId, input.keyId, input.issuerId, input.p8Path)
  }

  // Detect sign-in proceed: plain continue (no android input, no platform choice) at google-sign-in.
  let signInProceed = false
  const isPlainContinue = !input || (!input.platform && !input.keyId && !input.runBuild && !input.checkBuild && !androidInputPresent)
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
 * Read-only: determine the onboarding state the user is currently on, WITHOUT
 * running any side effect. Mirrors the branch selection of decideStart/decideAndroid
 * (preflight → platform → android resume step) but never calls effects.
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
    return 'ios-api-key'
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
