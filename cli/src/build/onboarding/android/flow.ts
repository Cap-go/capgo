// src/build/onboarding/android/flow.ts
//
// Headless, driver-agnostic Android onboarding core.
//
// Task 1: androidStepView — pure mapping from persisted progress to a
//         UI-framework-neutral step description.
//
// Task 2: applyAndroidInput / AndroidInput — pure state write for each
//         input/choice step. No IO.
//
// Task 3: runAndroidEffect / AndroidEffectDeps — LOCAL effects (keystore,
//         SA validation, saving credentials) with fully injected deps.
//
// Task 4: runAndroidEffect (continued) — CLOUD effects (OAuth, GCP, Play)
//         with fully injected deps.

import type { Buffer } from 'node:buffer'
import type { AndroidOnboardingProgress, AndroidOnboardingStep, KeystoreReady } from './types.js'
import type { KeystoreOptions, KeystoreResult, ListAliasesResult, ProbeKeyPasswordResult } from './keystore.js'
import type { ValidateOptions, ValidationResult } from './service-account-validation.js'
import type { GcpProject, GcpServiceAccount, GcpServiceAccountKey } from './gcp-api.js'
import type { GoogleOAuthTokens, GoogleUserInfo, PendingOAuthSession, RunOAuthFlowOptions } from './oauth-google.js'
// ── Post-save "tail" helper types (CI-secrets → env-export → workflow-file →
//    build-request). Imported as types only; the engine never imports the
//    concrete helpers — the driver injects them via the optional deps below so
//    the core stays IO-free and the MCP bridge can supply its own bindings.
import type { BuildCredentials } from '../../../schemas/build.js'
import type { BuildLogger, BuildRequestOptions, BuildRequestResult } from '../../request.js'
import type { AsyncCommandRunner, CiSecretDiscovery, CiSecretEntry, CiSecretSetupAdvice, CiSecretTarget, CommandRunner } from '../ci-secrets.js'
import type { EnvExportOpts, EnvExportResult } from '../env-export.js'
import type { BuildScriptChoice, GeneratedWorkflow, PackageManager, WorkflowGeneratorOpts } from '../workflow-generator.js'
import type { WorkflowWriteOptions, WorkflowWriteResult } from '../workflow-writer.js'
import { homedir } from 'node:os'
import { join } from 'node:path'

// ─── applyGoogleSignIn ────────────────────────────────────────────────────────

/**
 * Pure helper: given persisted progress, validated OAuth tokens and the user's
 * profile, return a NEW progress object (immutable spread) with:
 *   - `_oauthRefreshToken` set to `tokens.refreshToken`
 *   - `completedSteps.googleSignInComplete` set to `{ email, googleSubject, scope }`
 *
 * This is the single canonical place where Google sign-in state is written to
 * progress — shared by the Ink core effect (`google-sign-in-running`) and the
 * MCP bridge so both produce identical progress objects.
 */
export function applyGoogleSignIn(
  progress: AndroidOnboardingProgress,
  tokens: GoogleOAuthTokens,
  info: GoogleUserInfo,
): AndroidOnboardingProgress {
  return {
    ...progress,
    _oauthRefreshToken: tokens.refreshToken,
    completedSteps: {
      ...progress.completedSteps,
      googleSignInComplete: {
        email: info.email,
        googleSubject: info.sub,
        scope: tokens.scope,
      },
    },
  }
}
import { getAndroidResumeStep, hasAnyOAuthProgress } from './progress.js'
import { extractDeveloperId } from './play-api.js'
import { generateProjectId, sanitizeGcpProjectDisplayName, ANDROIDPUBLISHER_API, DEFAULT_SERVICE_ACCOUNT_ID, DEFAULT_SERVICE_ACCOUNT_DISPLAY_NAME, DEFAULT_SERVICE_ACCOUNT_DESCRIPTION } from './gcp-api.js'
import { generateRandomPassword } from './keystore.js'
import { MissingScopesError } from './oauth-google.js'
import { CAPGO_SA_DEVELOPER_PERMISSIONS, CAPGO_SA_APP_PERMISSIONS } from './play-api.js'
import { getCiSecretTargetLabel } from '../ci-secrets.js'
import { buildScriptPickerOptions } from '../workflow-ui-helpers.js'
import { WORKFLOW_PATH } from '../workflow-generator.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AndroidStepKind = 'auto' | 'input' | 'choice' | 'done' | 'error'

export interface AndroidStepOption {
  value: string
  label?: string
  note?: string
}

export interface AndroidStepView {
  step: AndroidOnboardingStep
  kind: AndroidStepKind
  title?: string
  prompt?: string        // 'input' steps
  collect?: string[]     // field(s) an 'input' step gathers
  options?: AndroidStepOption[]  // 'choice' steps
  message?: string       // 'done' | 'error'
}

export interface AndroidStepCtx {
  appId: string
  detectedPackageIds?: string[]
  gcpProjects?: { projectId: string, name: string, projectNumber?: string }[]
  detectedAliases?: string[]
  saValidation?: { ok: false, kind: string, message: string } | { ok: true }
  /**
   * Task 3 — keystore-existing-key-password prompt boundary.
   * Set to true in AndroidEffectResult.transient when the auto-probe could not
   * resolve the key password and the driver should show the manual input.
   * After the user submits, applyAndroidInput records keystoreKeyPassword and
   * re-running the effect finds it set and completes the phase.
   */
  needsKeyPasswordPrompt?: boolean
  /**
   * Task 4 — fresh access token returned from google-sign-in-running so the
   * driver can seed its token cache and avoid an immediate refresh on the next
   * step. If the driver ignores it, deps.getAccessToken() will mint one —
   * behaviorally identical.
   */
  accessToken?: string
  /**
   * keystore-existing-detecting-alias wrong-password signal.
   * Set to true in AndroidEffectResult.transient when listKeystoreAliases returns
   * { ok: false, reason: 'wrong-password' }. The driver (app.tsx) maps this to
   * the original UX: setError + setRetryStep('keystore-existing-store-password')
   * + setStep('error') WITHOUT calling handleError (no retryCount bump).
   */
  wrongPassword?: boolean

  // ── Post-save "tail" transient (Phase 1 engine tail) ─────────────────────
  // Runtime data the tail effects surface to the driver but that is NOT
  // persisted to progress.json. The Ink TUI holds the same values in useState
  // (ciSecretEntries / ciSecretTargets / ciSecretRepoLabel / ciSecretExistingKeys
  // / ciSecretUploadSummary / envExportPath / workflowWrittenPath / buildUrl /
  // buildOutput). Every field is OPTIONAL so existing transient producers keep
  // type-checking unchanged.
  /** CI-secret entries built at saving-credentials (key/value/masked). */
  ciSecretEntries?: CiSecretEntry[]
  /**
   * Full saved-credential map written at saving-credentials (the 5 build-cred
   * fields, NO CAPGO_TOKEN). The Ink TUI holds the same in its `savedCredentials`
   * React state and the env-export effects write it verbatim. Transient only —
   * never persisted to progress.json (it carries the raw keystore/SA secrets).
   */
  savedCredentials?: Record<string, string>
  /** CI-secret destinations discovered at detecting-ci-secrets. */
  ciSecretTargets?: CiSecretTarget[]
  /** Per-destination setup advice surfaced when no target is reachable. */
  ciSecretSetupAdvice?: CiSecretSetupAdvice[]
  /** Resolved owner/repo (GitHub) the CLI will push secrets to. */
  ciSecretRepoLabel?: string | null
  /** Which secret keys already exist on the remote (checking-ci-secrets). */
  ciSecretExistingKeys?: string[]
  /** Human summary of the upload (uploading-ci-secrets). */
  ciSecretUploadSummary?: string
  /** Absolute path of the written .env file (exporting-env). */
  envExportPath?: string
  /** Absolute path of the written workflow file (writing-workflow-file). */
  workflowFilePath?: string
  /** The queued build URL (requesting-build). */
  buildUrl?: string
  /** Streamed build-request log lines (requesting-build). */
  buildOutput?: string[]
  /** Captured AI-analysis job id surfaced on a failed build (requesting-build). */
  aiJobId?: string

  // ── Workflow-builder sub-flow ctx (pick-package-manager / pick-build-script) ──
  // Optional runtime data the workflow-builder views surface. Every field is
  // OPTIONAL so a driver that only passes { appId } still gets a usable view
  // (the static option tables defined below already cover the menus).
  /** Detected package manager from the project's lockfile (pick-package-manager). */
  detectedPackageManager?: string
  /** All scripts from package.json (pick-build-script picker). */
  availableScripts?: Record<string, string>
  /** Project-type recommendation surfaced at the top of pick-build-script. */
  recommendedScript?: string | null
  /** Default `.env` export path shown at ask-export-env (defaultExportPath). */
  defaultEnvExportPath?: string
}

// ─── KIND_TABLE ───────────────────────────────────────────────────────────────
//
// Maps every AndroidOnboardingStep to its base kind. Steps outside the core
// provisioning machine (bootstrap, post-save tail) still need a sensible
// mapping so the Record is exhaustive and tsgo is happy.

export const KIND_TABLE: Record<AndroidOnboardingStep, AndroidStepKind> = {
  // ── Bootstrap (stays in Ink, not in the progress machine) ──
  'welcome': 'auto',
  // TUI-only states (main's ink TUI; the MCP engine never returns these) — present
  // only to satisfy the exhaustive Record<AndroidOnboardingStep, …>.
  'resume-prompt': 'auto',
  'ai-analysis-prompt': 'auto',
  'ai-analysis-running': 'auto',
  'ai-analysis-result': 'auto',
  'ai-analysis-result-scroll': 'auto',
  'credentials-exist': 'choice',
  'backing-up': 'auto',
  'no-platform': 'error',

  // ── Phase 1 — Keystore ──
  'keystore-method-select': 'choice',
  'keystore-explainer': 'choice',
  'keystore-existing-path': 'choice',   // chooser (picker vs manual) + manual input
  'keystore-existing-picker': 'auto',
  'keystore-existing-store-password': 'input',
  'keystore-existing-detecting-alias': 'auto',
  'keystore-existing-alias-select': 'choice',
  'keystore-existing-alias': 'input',
  'keystore-existing-key-password': 'input',
  'keystore-new-alias': 'input',
  'keystore-new-password-method': 'choice',
  'keystore-new-store-password': 'input',
  'keystore-new-key-password': 'input',
  'keystore-new-cn': 'input',
  'keystore-generating': 'auto',

  // ── Phase 2 — Service account method fork ──
  'service-account-method-select': 'choice',

  // ── Phase 2a — Import existing SA JSON ──
  'sa-json-existing-path': 'choice',    // chooser (picker vs manual) + manual input
  'sa-json-existing-picker': 'auto',
  'sa-json-validating': 'auto',
  'sa-json-validation-failed': 'choice',

  // ── Phase 2b — Google sign-in ──
  'google-sign-in': 'choice',
  'google-sign-in-running': 'auto',

  // ── Phase 3 — Play developer account ──
  'play-developer-id-input': 'choice',  // actions (open / tutorial / manual)

  // ── Phase 4 — GCP project ──
  'gcp-projects-loading': 'auto',
  'gcp-projects-select': 'choice',
  'gcp-project-create-name': 'input',

  // ── Phase 4.5 — Android package ──
  'android-package-select': 'auto',     // auto pre-loads; then choice/input

  // ── Phase 5 — Provisioning ──
  'gcp-setup-running': 'auto',

  // ── Phase 6 — Save & Build (post-save tail stays in Ink) ──
  'saving-credentials': 'auto',
  'detecting-ci-secrets': 'auto',
  'ci-secrets-setup': 'auto',
  'ci-secrets-target-select': 'choice',
  'ask-ci-secrets': 'choice',
  'checking-ci-secrets': 'auto',
  'confirm-ci-secret-overwrite': 'choice',
  'uploading-ci-secrets': 'auto',
  'ci-secrets-failed': 'error',
  'ask-github-actions-setup': 'choice',
  'confirm-secrets-push': 'choice',
  'ask-export-env': 'choice',
  'exporting-env': 'auto',
  'confirm-env-export-overwrite': 'choice',
  'overwrite-and-export-env': 'auto',
  'pick-package-manager': 'choice',
  'pick-build-script': 'choice',
  'pick-build-script-custom': 'input',
  'preview-workflow-file': 'choice',
  'view-workflow-diff': 'choice',
  'writing-workflow-file': 'auto',
  'ask-build': 'choice',
  'requesting-build': 'auto',
  'build-complete': 'done',
  'error': 'error',
}

// ─── Static option tables ─────────────────────────────────────────────────────
//
// Faithful to the options shown in app.tsx. Navigation-only / sub-mode options
// (like 'learn', 'back') are included so the headless layer has the full menu.

const OPTIONS_KEYSTORE_METHOD: AndroidStepOption[] = [
  { value: 'existing', label: 'Yes, I have one' },
  { value: 'generate', label: 'No, create one for me' },
  { value: 'learn', label: 'What is a keystore?' },
]

// Data-safety gate shown when saved android credentials already exist for the
// app. Mirrors main's CredentialsExistStep (android-shared.tsx): backup the
// existing credentials.json first, or stop. 'backup' → backing-up effect →
// keystore-method-select; 'cancel' → halt onboarding (main's exitOnboarding()).
const OPTIONS_CREDENTIALS_EXIST: AndroidStepOption[] = [
  { value: 'backup', label: 'Start fresh (backup existing credentials first)' },
  { value: 'cancel', label: 'Exit onboarding' },
]

const OPTIONS_KEYSTORE_EXPLAINER: AndroidStepOption[] = [
  { value: 'back', label: 'Back' },
]

const OPTIONS_KEYSTORE_EXISTING_PATH: AndroidStepOption[] = [
  { value: 'picker', label: 'Open file picker' },
  { value: 'manual', label: 'Type the path' },
]

const OPTIONS_KEYSTORE_NEW_PASSWORD_METHOD: AndroidStepOption[] = [
  { value: 'random', label: 'Generate a random password (recommended)' },
  { value: 'manual', label: "I'll type my own password" },
]

const OPTIONS_SERVICE_ACCOUNT_METHOD: AndroidStepOption[] = [
  { value: 'generate', label: 'Set it up for me (recommended) — I sign in with Google once and Capgo configures Play access automatically' },
  { value: 'existing', label: 'I already have a Google Play service-account JSON file to use' },
]

const OPTIONS_SA_JSON_EXISTING_PATH: AndroidStepOption[] = [
  { value: 'picker', label: 'Open file picker' },
  { value: 'manual', label: 'Type the path' },
]

const OPTIONS_SA_JSON_VALIDATION_FAILED: AndroidStepOption[] = [
  { value: 'retry', label: 'Try a different service account JSON file' },
  { value: 'save-anyway', label: 'Save anyway (skip validation)' },
  { value: 'oauth', label: 'Set one up for me via Google instead' },
]

const OPTIONS_GOOGLE_SIGN_IN: AndroidStepOption[] = [
  { value: 'go', label: 'Continue to Google sign-in' },
  { value: 'learn', label: 'Learn why the onboarding via Google is secure' },
  { value: 'exit', label: "Exit (I'll do it later)" },
]

const OPTIONS_PLAY_DEVELOPER_ID: AndroidStepOption[] = [
  { value: 'open', label: 'Open Play Console in browser' },
  { value: 'tutorial', label: 'Show me how to find the developer ID' },
  { value: 'manual', label: "I'll type it now" },
]

const OPTIONS_GCP_PROJECT_NEW: AndroidStepOption = {
  value: '__new__',
  label: 'Create a new project',
}

// ─── Post-save "tail" option tables ───────────────────────────────────────────
//
// Mirror the <Select> options rendered in the Phase 6 tail of android/ui/app.tsx
// (CI-secrets → env-export → workflow-file → build-request). Labels are copied
// verbatim from the TUI so a driver renders the exact same menu. ci-secrets-
// target-select and pick-build-script are built dynamically below because their
// options depend on runtime data (detected targets / package.json scripts).

// ci-secrets-setup (android-ci.tsx CiSecretsSetupStep): retry / skip.
const OPTIONS_CI_SECRETS_SETUP: AndroidStepOption[] = [
  { value: 'retry', label: 'I installed and logged in, check again' },
  { value: 'skip', label: 'Skip upload' },
]

// confirm-ci-secret-overwrite (android-ci.tsx ConfirmCiSecretOverwriteStep).
const OPTIONS_CONFIRM_CI_SECRET_OVERWRITE: AndroidStepOption[] = [
  { value: 'replace', label: 'Replace existing env vars' },
  { value: 'skip', label: 'Skip upload' },
]

// ci-secrets-failed (android-ci.tsx CiSecretsFailedStep): retry / continue.
const OPTIONS_CI_SECRETS_FAILED: AndroidStepOption[] = [
  { value: 'retry', label: 'Try upload again' },
  { value: 'continue', label: 'Continue without upload' },
]

// ask-github-actions-setup (app.tsx ~2988): the 3-way GitHub Actions choice.
const OPTIONS_ASK_GITHUB_ACTIONS_SETUP: AndroidStepOption[] = [
  { value: 'with-workflow', label: '🚀  Yes — set the secrets AND create a workflow file' },
  { value: 'secrets-only', label: '🔒  Yes — set ONLY the secrets' },
  { value: 'no', label: '❌  No' },
]

// confirm-env-export-overwrite (app.tsx ~3054): replace / skip.
const OPTIONS_CONFIRM_ENV_EXPORT_OVERWRITE: AndroidStepOption[] = [
  { value: 'replace', label: '✏️   Replace it' },
  { value: 'skip', label: '🛑  Skip — keep the existing file' },
]

// pick-package-manager (app.tsx ~3080): the four supported managers.
const OPTIONS_PICK_PACKAGE_MANAGER: AndroidStepOption[] = [
  { value: 'bun', label: '📦  bun' },
  { value: 'npm', label: '📦  npm' },
  { value: 'pnpm', label: '📦  pnpm' },
  { value: 'yarn', label: '📦  yarn' },
]

// preview-workflow-file (app.tsx ~3174): write / view diff / cancel.
const OPTIONS_PREVIEW_WORKFLOW_FILE: AndroidStepOption[] = [
  { value: 'write', label: '✏️   Write file' },
  { value: 'view', label: '👀  Show proposed file diff' },
  { value: 'cancel', label: '❌  Do not write file' },
]

// view-workflow-diff (app.tsx FullscreenDiffViewer onExit → back to preview).
const OPTIONS_VIEW_WORKFLOW_DIFF: AndroidStepOption[] = [
  { value: 'close', label: 'Close diff' },
]

// ask-build (android-ci.tsx AskBuildStep): request a build now or not.
const OPTIONS_ASK_BUILD: AndroidStepOption[] = [
  { value: 'yes', label: '🚀  Yes, request a build' },
  { value: 'no', label: '⏭   Not now' },
]

// pick-build-script fallback options — the two escape hatches that are always
// present in buildScriptPickerOptions (custom command + skip). Used when the
// driver has not yet supplied ctx.availableScripts.
const OPTIONS_PICK_BUILD_SCRIPT_FALLBACK: AndroidStepOption[] = [
  { value: '__custom__', label: 'Type a custom command…' },
  { value: '__skip__', label: 'Skip build step (my app is raw HTML)' },
]

// ─── androidViewForStep ───────────────────────────────────────────────────────

/**
 * Pure function: given an explicit step name, persisted progress (or null),
 * and the current runtime context, return a UI-framework-neutral description
 * of the step.
 *
 * This is the primary entry-point for drivers that already know the step
 * (e.g. the MCP bridge). `androidStepView` is a thin wrapper that resolves
 * the step from progress first.
 *
 * Dynamic kind for `android-package-select`:
 *   - ctx.detectedPackageIds === undefined  → 'auto'  (preload not yet done)
 *   - ctx.detectedPackageIds.length > 0     → 'choice' (options = the ids)
 *   - ctx.detectedPackageIds.length === 0   → 'input'  (user must type it)
 *
 * All other steps use KIND_TABLE[step] unchanged.
 *
 * No I/O; no mutation of progress.
 */
export function androidViewForStep(
  step: AndroidOnboardingStep,
  progress: AndroidOnboardingProgress | null,
  ctx: AndroidStepCtx,
): AndroidStepView {
  // Dynamic kind for android-package-select; all others fall through to KIND_TABLE.
  const kind: AndroidStepView['kind'] = step === 'android-package-select'
    ? (ctx.detectedPackageIds === undefined
        ? 'auto'
        : ctx.detectedPackageIds.length > 0 ? 'choice' : 'input')
    : KIND_TABLE[step]

  const base: AndroidStepView = { step, kind }

  switch (step) {
    // ── Bootstrap ──
    case 'no-platform':
      return { ...base, message: 'No Android platform found. Run `npx cap add android` first.' }

    // ── Data-safety gate (saved android credentials already exist) ──
    // Mirrors main's CredentialsExistStep: a backup-or-cancel choice. The
    // `backing-up` step is an auto effect (the credentials.json → dated copy),
    // so it carries only kind (no options/prompt).
    case 'credentials-exist':
      return { ...base, options: OPTIONS_CREDENTIALS_EXIST }

    // ── Phase 1 — Keystore ──
    case 'keystore-method-select':
      return { ...base, options: OPTIONS_KEYSTORE_METHOD }

    case 'keystore-explainer':
      return { ...base, options: OPTIONS_KEYSTORE_EXPLAINER }

    case 'keystore-existing-path':
      return { ...base, options: OPTIONS_KEYSTORE_EXISTING_PATH }

    case 'keystore-existing-store-password':
      return { ...base, prompt: 'Keystore store password', collect: ['keystoreStorePassword'] }

    case 'keystore-existing-alias-select': {
      const aliases = ctx.detectedAliases ?? []
      return {
        ...base,
        options: aliases.map(a => ({ value: a, label: a })),
      }
    }

    case 'keystore-existing-alias':
      return { ...base, prompt: 'Keystore alias', collect: ['keystoreAlias'] }

    case 'keystore-existing-key-password':
      return { ...base, prompt: 'Keystore key password', collect: ['keystoreKeyPassword'] }

    case 'keystore-new-alias':
      return { ...base, prompt: 'Key alias (e.g. release)', collect: ['keystoreAlias'] }

    case 'keystore-new-password-method':
      return { ...base, options: OPTIONS_KEYSTORE_NEW_PASSWORD_METHOD }

    case 'keystore-new-store-password':
      return { ...base, prompt: 'Store password (min 6 chars)', collect: ['keystoreStorePassword'] }

    case 'keystore-new-key-password':
      return { ...base, prompt: 'Key password', collect: ['keystoreKeyPassword'] }

    case 'keystore-new-cn':
      return { ...base, prompt: 'Common name (e.g. your app ID)', collect: ['keystoreCommonName'] }

    // ── Phase 2 — Service account fork ──
    case 'service-account-method-select':
      return { ...base, options: OPTIONS_SERVICE_ACCOUNT_METHOD }

    // ── Phase 2a — Import SA JSON ──
    case 'sa-json-existing-path':
      return { ...base, options: OPTIONS_SA_JSON_EXISTING_PATH }

    case 'sa-json-validation-failed': {
      const message = ctx.saValidation && !ctx.saValidation.ok
        ? ctx.saValidation.message
        : undefined
      return { ...base, options: OPTIONS_SA_JSON_VALIDATION_FAILED, message }
    }

    // ── Phase 2b — Google sign-in ──
    case 'google-sign-in':
      return { ...base, options: OPTIONS_GOOGLE_SIGN_IN }

    // ── Phase 3 — Play developer account ──
    case 'play-developer-id-input':
      return { ...base, options: OPTIONS_PLAY_DEVELOPER_ID }

    // ── Phase 4 — GCP project ──
    case 'gcp-projects-select': {
      const projectOptions: AndroidStepOption[] = (ctx.gcpProjects ?? []).map(p => ({
        value: p.projectId,
        label: p.name,
        note: p.projectNumber,
      }))
      return { ...base, options: [...projectOptions, OPTIONS_GCP_PROJECT_NEW] }
    }

    case 'gcp-project-create-name':
      return { ...base, prompt: 'New GCP project display name', collect: ['pendingNewProjectDisplayName'] }

    // ── Phase 4.5 — Android package ──
    // kind is already set dynamically above; only add options when choice.
    case 'android-package-select': {
      if (kind === 'choice' && ctx.detectedPackageIds && ctx.detectedPackageIds.length > 0) {
        const packageOptions: AndroidStepOption[] = ctx.detectedPackageIds.map(id => ({
          value: id,
          label: id,
        }))
        return { ...base, options: packageOptions }
      }
      return base
    }

    // ── Phase 6 — Post-save "tail": CI-secrets → env-export → workflow-file ──
    // Each case mirrors the matching <Select>/prompt in android/ui/app.tsx so a
    // driver renders the same menu. Dynamic option lists (target picker, build-
    // script picker) read OPTIONAL ctx; when the ctx is absent the static
    // fallback options keep the view usable.

    // ci-secrets-setup — git-hosting CLI not ready; retry or skip the upload.
    case 'ci-secrets-setup':
      return { ...base, title: 'Set up your git hosting CLI to upload env vars', options: OPTIONS_CI_SECRETS_SETUP }

    // ci-secrets-target-select — one row per detected destination + a Skip row.
    case 'ci-secrets-target-select': {
      const targetOptions: AndroidStepOption[] = (ctx.ciSecretTargets ?? []).map(target => ({
        value: target.provider,
        label: target.provider === 'github' ? 'GitHub Actions repository secrets' : 'GitLab CI/CD variables',
      }))
      return {
        ...base,
        prompt: 'Where should Capgo upload the build env vars?',
        options: [...targetOptions, { value: 'skip', label: 'Skip' }],
      }
    }

    // ask-ci-secrets — confirm the upload to the chosen target (GitLab path).
    case 'ask-ci-secrets': {
      const entryCount = ctx.ciSecretEntries?.length ?? 0
      const targetLabel = getCiSecretTargetLabel(progress?.ciSecretTarget ?? null)
      const cli = progress?.ciSecretTarget?.cli || 'CLI'
      return {
        ...base,
        prompt: `Upload ${entryCount} build env var${entryCount === 1 ? '' : 's'} to ${targetLabel}?`,
        options: [
          { value: 'yes', label: `Upload with ${cli}` },
          { value: 'no', label: 'Skip' },
        ],
      }
    }

    // confirm-ci-secret-overwrite — some keys already exist; replace or skip.
    case 'confirm-ci-secret-overwrite':
      return { ...base, prompt: 'These env vars already exist and will be replaced:', options: OPTIONS_CONFIRM_CI_SECRET_OVERWRITE }

    // ci-secrets-failed — the upload threw; retry or continue (credentials are saved).
    case 'ci-secrets-failed':
      return { ...base, message: 'Could not upload env vars.', options: OPTIONS_CI_SECRETS_FAILED }

    // ask-github-actions-setup — the 3-way GitHub Actions choice.
    case 'ask-github-actions-setup':
      return { ...base, prompt: 'Set up GitHub Actions for you?', options: OPTIONS_ASK_GITHUB_ACTIONS_SETUP }

    // confirm-secrets-push — last gate before pushing to the repo.
    case 'confirm-secrets-push': {
      const repo = ctx.ciSecretRepoLabel ?? 'the repository'
      return {
        ...base,
        prompt: `Confirm before pushing secrets to ${repo}`,
        options: [
          { value: 'confirm', label: `Yes, push to ${repo}` },
          { value: 'cancel', label: 'Cancel — don\'t push anything' },
        ],
      }
    }

    // ask-export-env — export the credentials as a .env file instead.
    case 'ask-export-env': {
      const fileName = (ctx.defaultEnvExportPath ?? '').split('/').slice(-1)[0]
      const yesLabel = fileName ? `📝  Yes — write ${fileName}` : '📝  Yes — write the .env file'
      return {
        ...base,
        prompt: 'Export the credentials as a .env file instead?',
        options: [
          { value: 'yes', label: yesLabel },
          { value: 'no', label: '❌  No, exit without exporting' },
        ],
      }
    }

    // confirm-env-export-overwrite — the .env already exists; replace or skip.
    case 'confirm-env-export-overwrite': {
      const path = progress?.envExportTargetPath ?? ctx.defaultEnvExportPath ?? 'the file'
      return { ...base, prompt: `${path} already exists. Replace it with a fresh export, or skip?`, options: OPTIONS_CONFIRM_ENV_EXPORT_OVERWRITE }
    }

    // pick-package-manager — drives install + build steps in the workflow.
    case 'pick-package-manager': {
      const detected = ctx.detectedPackageManager
      const options: AndroidStepOption[] = OPTIONS_PICK_PACKAGE_MANAGER.map(opt =>
        detected && opt.value === detected
          ? { ...opt, label: `${opt.label}  (recommended — matches your lockfile)` }
          : opt,
      )
      return { ...base, prompt: 'Which package manager does this project use?', options }
    }

    // pick-build-script — pick the script that builds the web assets.
    case 'pick-build-script': {
      const options = ctx.availableScripts
        ? buildScriptPickerOptions(ctx.availableScripts, ctx.recommendedScript ?? null)
            .map(o => ({ value: o.value, label: o.label }))
        : OPTIONS_PICK_BUILD_SCRIPT_FALLBACK
      return { ...base, prompt: 'Which script builds your web assets?', options }
    }

    // pick-build-script-custom — free-text custom build command.
    case 'pick-build-script-custom':
      return { ...base, prompt: 'Custom build command', collect: ['buildScriptCustomCommand'] }

    // preview-workflow-file — write / view diff / cancel.
    case 'preview-workflow-file':
      return { ...base, prompt: `What should we do with ${WORKFLOW_PATH}?`, options: OPTIONS_PREVIEW_WORKFLOW_FILE }

    // view-workflow-diff — fullscreen diff takeover; only action is to close.
    case 'view-workflow-diff':
      return { ...base, title: 'Proposed workflow diff', options: OPTIONS_VIEW_WORKFLOW_DIFF }

    // ask-build — final prompt: request a build now or finish.
    case 'ask-build':
      return { ...base, prompt: 'Request a build now?', options: OPTIONS_ASK_BUILD }

    // ── Done ──
    case 'build-complete':
      return { ...base, message: 'Build complete.' }

    // ── Error ──
    case 'error':
      return { ...base, message: 'An error occurred. Check the details above.' }

    // All other steps (auto spinners, post-save tail) return kind only.
    default:
      return base
  }
}

// ─── androidStepView ──────────────────────────────────────────────────────────

/**
 * Pure function: given persisted progress (or null for a fresh run) and the
 * current runtime context, return a UI-framework-neutral description of the
 * step the user is on.
 *
 * Thin wrapper around `androidViewForStep` that resolves the step from
 * progress first. Drivers that already know the step should call
 * `androidViewForStep` directly.
 *
 * No I/O; no mutation of progress.
 */
export function androidStepView(
  progress: AndroidOnboardingProgress | null,
  ctx: AndroidStepCtx,
): AndroidStepView {
  const step = progress ? getAndroidResumeStep(progress) : 'keystore-method-select'
  return androidViewForStep(step, progress, ctx)
}

// ─── RELEASE_ALIAS_DEFAULT ────────────────────────────────────────────────────
// Mirrors the constant in app.tsx so both use the same default.
const RELEASE_ALIAS_DEFAULT = 'release'

// ─── AndroidInput ─────────────────────────────────────────────────────────────
//
// Discriminated union — one variant per input/choice step that records state.
// Navigation-only choices (e.g. 'learn', 'back', 'picker', 'manual' sub-mode)
// are included so the headless layer has the full vocabulary, but they return
// progress unchanged in applyAndroidInput.

export type AndroidInput =
  // Phase 0 — Data-safety gate (saved android credentials already exist).
  // 'backup' → mark gate for backing-up; 'cancel' → halt onboarding.
  | { step: 'credentials-exist'; value: 'backup' | 'cancel' }

  // Phase 1 — Keystore method
  | { step: 'keystore-method-select'; value: 'existing' | 'generate' | 'learn' }

  // Phase 1 — Existing keystore path (manual text input; file-picker is handled
  // by runAndroidEffect as Ink-only TTY IO)
  | { step: 'keystore-existing-path'; path: string }

  // Phase 1 — Existing keystore store password
  | { step: 'keystore-existing-store-password'; password: string }

  // Phase 1 — Existing keystore alias select (multi-alias chooser)
  | { step: 'keystore-existing-alias-select'; alias: string }

  // Phase 1 — Existing keystore alias manual entry
  | { step: 'keystore-existing-alias'; alias: string }

  // Phase 1 — Existing keystore key password (prompt sub-mode).
  // NOTE: IO boundary — applyAndroidInput records keystoreKeyPassword only.
  // Reading the p12, computing _keystoreBase64, and writing keystoreReady +
  // serviceAccountForkSeen is IO handled by runAndroidEffect (Task 3).
  | { step: 'keystore-existing-key-password'; password: string }

  // Phase 1 — New keystore alias
  | { step: 'keystore-new-alias'; alias: string }

  // Phase 1 — New keystore password method
  // random: generates pw, writes keystoreStorePassword + keystoreKeyPassword;
  // manual: navigation-only (progress unchanged; component transitions to store-pw screen)
  | { step: 'keystore-new-password-method'; value: 'random' | 'manual' }

  // Phase 1 — New keystore store password (manual path)
  | { step: 'keystore-new-store-password'; password: string }

  // Phase 1 — New keystore key password (manual path; empty → store pw)
  | { step: 'keystore-new-key-password'; password: string }

  // Phase 1 — New keystore common name (empty → appId)
  | { step: 'keystore-new-cn'; cn: string }

  // Phase 2 — Service account method
  | { step: 'service-account-method-select'; value: 'generate' | 'existing' }

  // Phase 2a — SA JSON path (manual; file-picker is Ink-only)
  | { step: 'sa-json-existing-path'; path: string }

  // Phase 2a — SA JSON validation failed recovery.
  // 'save-anyway' IO boundary: the caller provides serviceAccountKeyBase64
  // (bytes already read by the driver) for the pure state write.
  | { step: 'sa-json-validation-failed'; value: 'retry' | 'oauth' }
  | { step: 'sa-json-validation-failed'; value: 'save-anyway'; serviceAccountKeyBase64: string }

  // Phase 3 — Play developer account ID (raw URL or numeric id)
  | { step: 'play-developer-id-input'; rawDeveloperIdOrUrl: string }

  // Phase 4 — GCP project select (existing)
  | { step: 'gcp-projects-select'; gcpProject: { projectId: string; name: string; projectNumber?: string } }

  // Phase 4 — GCP project create name (empty falls back to sanitized `Capgo ${appId}`)
  | { step: 'gcp-project-create-name'; displayName: string }

  // Phase 4.5 — Android package select.
  // serviceAccountMethod is required so the pure function can route correctly
  // (progress.serviceAccountMethod may already be set but is also passed
  // explicitly here to keep the function self-contained).
  | { step: 'android-package-select'; packageName: string; source: 'gradle' | 'capacitor-config' | 'user-input'; serviceAccountMethod: 'generate' | 'existing' }

  // ── Phase 6 — Post-save "tail" inputs ───────────────────────────────────────
  // One variant per tail choice/input step that records state on TailProgress.
  // Navigation-only / spinner-gate choices (the 'retry'/'skip'/'view'/'close'
  // routing values) carry no persisted field — applyAndroidInput returns
  // progress unchanged for them; the driver owns the visual transition.

  // ci-secrets-setup — retry the detection or skip the upload (navigation-only).
  | { step: 'ci-secrets-setup'; value: 'retry' | 'skip' }

  // ci-secrets-target-select — records the chosen destination (or skip).
  | { step: 'ci-secrets-target-select'; ciSecretTarget: CiSecretTarget | null }

  // ask-ci-secrets — confirm/skip the GitLab upload (navigation-only).
  | { step: 'ask-ci-secrets'; value: 'yes' | 'no' }

  // confirm-ci-secret-overwrite — replace existing or skip (navigation-only).
  | { step: 'confirm-ci-secret-overwrite'; value: 'replace' | 'skip' }

  // ci-secrets-failed — retry the upload or continue (navigation-only).
  | { step: 'ci-secrets-failed'; value: 'retry' | 'continue' }

  // ask-github-actions-setup — records the 3-way GitHub Actions setup mode.
  | { step: 'ask-github-actions-setup'; value: 'with-workflow' | 'secrets-only' | 'declined' }

  // confirm-secrets-push — confirm/cancel the push (navigation-only).
  | { step: 'confirm-secrets-push'; value: 'confirm' | 'cancel' }

  // ask-export-env — 'yes' records the resolved export path; 'no' exits.
  | { step: 'ask-export-env'; value: 'no' }
  | { step: 'ask-export-env'; value: 'yes'; envExportTargetPath: string }

  // confirm-env-export-overwrite — replace/skip (navigation-only).
  | { step: 'confirm-env-export-overwrite'; value: 'replace' | 'skip' }

  // pick-package-manager — records the chosen package manager.
  | { step: 'pick-package-manager'; selectedPackageManager: PackageManager }

  // pick-build-script — records the build-script choice; '__custom__' routes to
  // the custom-command input (navigation-only) and '__skip__' records a skip.
  | { step: 'pick-build-script'; value: '__custom__' }
  | { step: 'pick-build-script'; buildScriptChoice: BuildScriptChoice }

  // pick-build-script-custom — records the free-text custom command.
  | { step: 'pick-build-script-custom'; command: string }

  // preview-workflow-file — write / view diff / cancel (navigation-only).
  | { step: 'preview-workflow-file'; value: 'write' | 'view' | 'cancel' }

  // view-workflow-diff — close the diff (navigation-only).
  | { step: 'view-workflow-diff'; value: 'close' }

  // ask-build — request a build now or finish (navigation-only).
  | { step: 'ask-build'; value: 'yes' | 'no' }

// ─── applyAndroidInput ────────────────────────────────────────────────────────
//
// Pure function: given the current step, persisted progress, and user input,
// return a NEW progress object (spread — never mutate). Replicates each
// `persistAndStep` updater from app.tsx EXACTLY.
//
// Navigation-only inputs (e.g. 'learn', 'manual' sub-mode switch) return
// progress unchanged; the Ink component handles the visual transition.

export function applyAndroidInput(
  step: AndroidOnboardingStep,
  progress: AndroidOnboardingProgress,
  input: AndroidInput,
): AndroidOnboardingProgress {
  switch (step) {
    // ── credentials-exist ─────────────────────────────────────────────────────
    // Data-safety gate. app.tsx routes 'backup' → setStep('backing-up') and
    // 'exit' → exitOnboarding(). The stateless engine encodes that choice in
    // `_credentialsExistGate`: 'backup' parks the resume step on `backing-up`
    // (the copy effect runs next); 'cancel' halts onboarding.
    case 'credentials-exist': {
      const i = input as Extract<AndroidInput, { step: 'credentials-exist' }>
      if (i.value === 'backup')
        return { ...progress, _credentialsExistGate: 'backup' }
      return { ...progress, _credentialsExistGate: 'cancel' }
    }

    // ── keystore-method-select ────────────────────────────────────────────────
    // app.tsx:1900, 1904
    case 'keystore-method-select': {
      const i = input as Extract<AndroidInput, { step: 'keystore-method-select' }>
      if (i.value === 'existing') {
        return { ...progress, keystoreMethod: 'existing' }
      }
      if (i.value === 'generate') {
        return { ...progress, keystoreMethod: 'generate' }
      }
      // 'learn' → navigation-only; progress unchanged
      return progress
    }

    // ── keystore-existing-path ────────────────────────────────────────────────
    // app.tsx:1971
    case 'keystore-existing-path': {
      const i = input as Extract<AndroidInput, { step: 'keystore-existing-path' }>
      return { ...progress, keystoreExistingPath: i.path }
    }

    // ── keystore-existing-store-password ──────────────────────────────────────
    // app.tsx:2001
    case 'keystore-existing-store-password': {
      const i = input as Extract<AndroidInput, { step: 'keystore-existing-store-password' }>
      return { ...progress, keystoreStorePassword: i.password }
    }

    // ── keystore-existing-alias-select ────────────────────────────────────────
    // app.tsx:2020
    case 'keystore-existing-alias-select': {
      const i = input as Extract<AndroidInput, { step: 'keystore-existing-alias-select' }>
      return { ...progress, keystoreAlias: i.alias }
    }

    // ── keystore-existing-alias ───────────────────────────────────────────────
    // app.tsx:2038 — trim/RELEASE_ALIAS_DEFAULT
    case 'keystore-existing-alias': {
      const i = input as Extract<AndroidInput, { step: 'keystore-existing-alias' }>
      const alias = i.alias.trim() || RELEASE_ALIAS_DEFAULT
      return { ...progress, keystoreAlias: alias }
    }

    // ── keystore-existing-key-password ────────────────────────────────────────
    // app.tsx:2073–2078 (IO boundary — only the pure state write here)
    // Records keystoreKeyPassword; the p12 read + _keystoreBase64 + keystoreReady
    // + serviceAccountForkSeen writes are IO handled by runAndroidEffect (Task 3).
    case 'keystore-existing-key-password': {
      const i = input as Extract<AndroidInput, { step: 'keystore-existing-key-password' }>
      const keyPw = i.password || progress.keystoreStorePassword || ''
      return { ...progress, keystoreKeyPassword: keyPw }
    }

    // ── keystore-new-alias ────────────────────────────────────────────────────
    // app.tsx:2112 — trim/RELEASE_ALIAS_DEFAULT
    case 'keystore-new-alias': {
      const i = input as Extract<AndroidInput, { step: 'keystore-new-alias' }>
      const alias = i.alias.trim() || RELEASE_ALIAS_DEFAULT
      return { ...progress, keystoreAlias: alias }
    }

    // ── keystore-new-password-method ──────────────────────────────────────────
    // app.tsx:2129–2134 (random) / 2137 (manual → navigation-only)
    case 'keystore-new-password-method': {
      const i = input as Extract<AndroidInput, { step: 'keystore-new-password-method' }>
      if (i.value === 'random') {
        const pw = generateRandomPassword()
        return { ...progress, keystoreStorePassword: pw, keystoreKeyPassword: pw, keystorePasswordGenerated: true }
      }
      // 'manual' → the user will type the password. The TUI tracks this in
      // component state; the stateless MCP persists a marker so the next call
      // resumes onto the dedicated keystore-new-store-password step.
      return { ...progress, keystorePasswordManual: true }
    }

    // ── keystore-new-store-password ───────────────────────────────────────────
    // app.tsx:2161
    case 'keystore-new-store-password': {
      const i = input as Extract<AndroidInput, { step: 'keystore-new-store-password' }>
      return { ...progress, keystoreStorePassword: i.password }
    }

    // ── keystore-new-key-password ─────────────────────────────────────────────
    // app.tsx:2176–2179 — empty falls back to keystoreStorePassword
    case 'keystore-new-key-password': {
      const i = input as Extract<AndroidInput, { step: 'keystore-new-key-password' }>
      const keyPw = i.password || progress.keystoreStorePassword || ''
      return { ...progress, keystoreKeyPassword: keyPw }
    }

    // ── keystore-new-cn ───────────────────────────────────────────────────────
    // app.tsx:2197 — trim/appId
    case 'keystore-new-cn': {
      const i = input as Extract<AndroidInput, { step: 'keystore-new-cn' }>
      const cn = i.cn.trim() || progress.appId
      return { ...progress, keystoreCommonName: cn }
    }

    // ── service-account-method-select ─────────────────────────────────────────
    // app.tsx:2234–2243
    case 'service-account-method-select': {
      const i = input as Extract<AndroidInput, { step: 'service-account-method-select' }>
      return { ...progress, serviceAccountMethod: i.value }
    }

    // ── sa-json-existing-path ─────────────────────────────────────────────────
    // app.tsx:2304–2307
    case 'sa-json-existing-path': {
      const i = input as Extract<AndroidInput, { step: 'sa-json-existing-path' }>
      return { ...progress, serviceAccountJsonPath: i.path }
    }

    // ── sa-json-validation-failed ─────────────────────────────────────────────
    // app.tsx:2365–2401
    case 'sa-json-validation-failed': {
      const i = input as Extract<AndroidInput, { step: 'sa-json-validation-failed' }>
      if (i.value === 'retry') {
        // Clear the saved path so the picker chooser shows fresh (app.tsx:2366)
        return { ...progress, serviceAccountJsonPath: undefined }
      }
      if (i.value === 'save-anyway') {
        // IO boundary: caller provides serviceAccountKeyBase64 from file read.
        // app.tsx:2382–2383: sets _serviceAccountKeyBase64 + serviceAccountValidationSkipped
        return {
          ...progress,
          _serviceAccountKeyBase64: i.serviceAccountKeyBase64,
          serviceAccountValidationSkipped: true,
        }
      }
      // 'oauth' → fall back to OAuth provisioning path (app.tsx:2398–2400)
      return { ...progress, serviceAccountMethod: 'generate' }
    }

    // ── play-developer-id-input ───────────────────────────────────────────────
    // app.tsx:2555–2563
    case 'play-developer-id-input': {
      const i = input as Extract<AndroidInput, { step: 'play-developer-id-input' }>
      const developerId = extractDeveloperId(i.rawDeveloperIdOrUrl)
      if (!developerId) {
        // Invalid input — return progress unchanged; caller should surface error
        return progress
      }
      const choice = { developerId }
      return {
        ...progress,
        completedSteps: { ...progress.completedSteps, playAccountChosen: choice },
      }
    }

    // ── gcp-projects-select ───────────────────────────────────────────────────
    // app.tsx:2607–2612 (existing project pick)
    // '__new__' is a navigation-only value handled by the component (→ create-name screen)
    case 'gcp-projects-select': {
      const i = input as Extract<AndroidInput, { step: 'gcp-projects-select' }>
      const choice = {
        projectId: i.gcpProject.projectId,
        projectNumber: i.gcpProject.projectNumber,
        displayName: i.gcpProject.name,
        createdByOnboarding: false as const,
      }
      return {
        ...progress,
        completedSteps: { ...progress.completedSteps, gcpProjectChosen: choice },
      }
    }

    // ── gcp-project-create-name ───────────────────────────────────────────────
    // app.tsx:2640–2647
    case 'gcp-project-create-name': {
      const i = input as Extract<AndroidInput, { step: 'gcp-project-create-name' }>
      const displayName = sanitizeGcpProjectDisplayName(
        i.displayName.trim() || `Capgo ${progress.appId}`,
      )
      const projectId = generateProjectId(progress.appId)
      const choice = {
        projectId,
        displayName,
        createdByOnboarding: true as const,
      }
      return {
        ...progress,
        pendingNewProjectId: projectId,
        pendingNewProjectDisplayName: displayName,
        completedSteps: { ...progress.completedSteps, gcpProjectChosen: choice },
      }
    }

    // ── android-package-select ────────────────────────────────────────────────
    // app.tsx:2694–2701 (gradle picker) / 2727–2734 (manual input)
    // The next step depends on serviceAccountMethod (passed in input since
    // progress.serviceAccountMethod is the canonical source but the caller
    // also has it in local React state — both should be in sync).
    case 'android-package-select': {
      const i = input as Extract<AndroidInput, { step: 'android-package-select' }>
      const choice = {
        packageName: i.packageName,
        source: i.source,
      }
      return {
        ...progress,
        completedSteps: { ...progress.completedSteps, androidPackageChosen: choice },
      }
    }

    // ── Phase 6 — Post-save "tail" reducers ────────────────────────────────────
    // Write the matching TailProgress field for each tail choice/input step,
    // mirroring the `setX(...)` setState call the TUI fires in android/ui/app.tsx.
    // Navigation-only / spinner-gate values (retry/skip/view/close/confirm/cancel
    // and the yes/no build gate) carry no persisted field and fall through to the
    // `default` below unchanged — exactly like the existing 'learn'/'manual' cases.

    // ── ci-secrets-target-select ──────────────────────────────────────────────
    // app.tsx ~2945: setCiSecretTarget(target) — records the chosen destination
    // (null when the user picked "Skip").
    case 'ci-secrets-target-select': {
      const i = input as Extract<AndroidInput, { step: 'ci-secrets-target-select' }>
      return { ...progress, ciSecretTarget: i.ciSecretTarget }
    }

    // ── ask-github-actions-setup ──────────────────────────────────────────────
    // app.tsx ~2996/3000: setSetupMode('declined' | 'with-workflow' | 'secrets-only').
    case 'ask-github-actions-setup': {
      const i = input as Extract<AndroidInput, { step: 'ask-github-actions-setup' }>
      return { ...progress, setupMode: i.value }
    }

    // ── ask-export-env ────────────────────────────────────────────────────────
    // app.tsx ~3029: setEnvExportTargetPath(defaultExportPath(...)) on 'yes';
    // 'no' exits without recording a path (falls through unchanged).
    case 'ask-export-env': {
      const i = input as Extract<AndroidInput, { step: 'ask-export-env' }>
      if (i.value === 'yes')
        return { ...progress, envExportTargetPath: i.envExportTargetPath }
      return progress
    }

    // ── pick-package-manager ──────────────────────────────────────────────────
    // app.tsx ~3088: setSelectedPackageManager(value).
    case 'pick-package-manager': {
      const i = input as Extract<AndroidInput, { step: 'pick-package-manager' }>
      return { ...progress, selectedPackageManager: i.selectedPackageManager }
    }

    // ── pick-build-script ─────────────────────────────────────────────────────
    // app.tsx ~3111/3119: setBuildScriptChoice({ type: 'skip' | 'npm-script' }).
    // '__custom__' routes to the custom-command input (navigation-only) and so
    // falls through unchanged.
    case 'pick-build-script': {
      const i = input as Extract<AndroidInput, { step: 'pick-build-script' }>
      if ('buildScriptChoice' in i)
        return { ...progress, buildScriptChoice: i.buildScriptChoice }
      return progress
    }

    // ── pick-build-script-custom ──────────────────────────────────────────────
    // app.tsx ~3149: setBuildScriptChoice({ type: 'custom', command }). Mirrors
    // the TUI's trim + non-empty guard (empty → progress unchanged).
    case 'pick-build-script-custom': {
      const i = input as Extract<AndroidInput, { step: 'pick-build-script-custom' }>
      const command = i.command.trim()
      if (!command)
        return progress
      return { ...progress, buildScriptChoice: { type: 'custom', command } }
    }

    default:
      return progress
  }
}

// ─── AndroidEffectDeps ────────────────────────────────────────────────────────
//
// Full interface for the WHOLE effect surface (Task 3 LOCAL + Task 4 CLOUD).
// Task 3 only uses a subset — the cloud deps (getAccessToken, runOAuthFlow, …)
// are unused here and are wired up when Task 4 implements their branches.
// Defining the complete interface now means Task 4 reuses it unchanged.

export interface AndroidEffectDeps {
  // ── Keystore operations ──────────────────────────────────────────────────
  generateKeystore: (opts: KeystoreOptions) => KeystoreResult
  listKeystoreAliases: (bytes: Uint8Array, password: string) => ListAliasesResult
  tryUnlockPrivateKey: (bytes: Uint8Array, password: string) => ProbeKeyPasswordResult

  // ── Service account validation ───────────────────────────────────────────
  validateServiceAccountJson: (opts: ValidateOptions) => Promise<ValidationResult>

  // ── Build credentials persistence ────────────────────────────────────────
  updateSavedCredentials: (
    appId: string,
    platform: 'ios' | 'android',
    credentials: Record<string, string>,
  ) => Promise<void>
  loadSavedCredentials: (appId: string) => Promise<unknown>

  // ── Onboarding progress persistence ─────────────────────────────────────
  saveAndroidProgress: (appId: string, progress: AndroidOnboardingProgress) => Promise<void>
  loadAndroidProgress: (appId: string) => Promise<AndroidOnboardingProgress | null>
  deleteAndroidProgress: (appId: string) => Promise<void>

  // ── File system (injected so effects can be tested without real FS) ──────
  readFile: (path: string) => Promise<Buffer>
  copyFile: (src: string, dest: string) => Promise<void>

  // ── OAuth (Task 4) ───────────────────────────────────────────────────────
  /**
   * Run the full browser OAuth flow. The driver pre-binds OAuth client config
   * (clientId, clientSecret, scopes) so the core never sees credentials —
   * config/scope policy lives in the driver.
   *
   * Signature mirrors RunOAuthFlowOptions from oauth-google.ts (minus
   * timeoutMs/signal which the driver controls internally).
   */
  runOAuthFlow: (callbacks: Pick<RunOAuthFlowOptions, 'onAuthUrl' | 'onStatus'>) => Promise<GoogleOAuthTokens>

  /**
   * Non-blocking OAuth starter (MCP fire-and-poll). Opens the browser and
   * starts the loopback listener, then returns a PendingOAuthSession immediately
   * without waiting for sign-in to complete. The MCP bridge uses this to
   * avoid blocking a single tool call on the full OAuth round-trip.
   *
   * Optional — only provided by the MCP driver. The Ink driver uses the
   * blocking `runOAuthFlow` instead and does not need this dep.
   *
   * The driver pre-binds OAuth client config (clientId, clientSecret, scopes).
   */
  startOAuthFlow?: (callbacks?: Pick<RunOAuthFlowOptions, 'onAuthUrl' | 'onStatus'>) => Promise<PendingOAuthSession>

  /** Fetch the signed-in user's profile (email, sub). */
  fetchUserInfo: (accessToken: string) => Promise<GoogleUserInfo>

  /**
   * Mint a fresh access token from the stored refresh token. Called before
   * each cloud step that needs one. The driver owns the token cache and
   * handles expiry.
   */
  getAccessToken: () => Promise<string>

  /**
   * Revoke a Google OAuth refresh token. Best-effort — the core swallows
   * failures (non-fatal; the token expires on its own).
   */
  revokeToken: (refreshToken: string) => Promise<void>

  // ── GCP Cloud Resource Manager / Service Usage / IAM (Task 4) ────────────
  /**
   * List GCP projects the user has access to.
   * Mirrors gcp-api.ts: listProjects(accessToken).
   */
  listProjects: (accessToken: string) => Promise<GcpProject[]>

  /**
   * Create a GCP project and wait for the operation to finish.
   * Mirrors gcp-api.ts: createProject(accessToken, projectId, displayName).
   */
  createProject: (accessToken: string, projectId: string, displayName: string) => Promise<GcpProject>

  /**
   * Enable an API on a project (idempotent).
   * Mirrors gcp-api.ts: enableService(accessToken, projectId, serviceName).
   */
  enableService: (accessToken: string, projectId: string, serviceName: string) => Promise<void>

  /**
   * Find or create the Capgo service account in a project.
   * Mirrors gcp-api.ts: ensureServiceAccount(args).
   */
  ensureServiceAccount: (args: {
    accessToken: string
    projectId: string
    accountId: string
    displayName?: string
    description?: string
  }) => Promise<{ account: GcpServiceAccount; created: boolean }>

  /**
   * Create a JSON key for a service account.
   * Mirrors gcp-api.ts: createServiceAccountKey(args).
   */
  createServiceAccountKey: (args: {
    accessToken: string
    projectId: string
    serviceAccountEmail: string
  }) => Promise<GcpServiceAccountKey>

  // ── Google Play Developer API (Task 4) ────────────────────────────────────
  /**
   * Invite the service account into the Play Console developer account.
   * Mirrors play-api.ts: inviteServiceAccount(args).
   */
  inviteServiceAccount: (args: {
    accessToken: string
    developerId: string
    serviceAccountEmail: string
    developerAccountPermissions?: readonly string[]
    grants?: ReadonlyArray<{ packageName: string; permissions: readonly string[] }>
  }) => Promise<void>

  // ── Android project detection (Task 4) ───────────────────────────────────
  /**
   * Find applicationId values in the Android Gradle build files.
   * The driver pre-binds `androidDir` so this dep is argless from the core's
   * perspective. The driver calls findAndroidApplicationIds(androidDir) under
   * the hood.
   */
  findAndroidApplicationIds: () => Promise<string[]>

  // ── Post-save "tail" helpers (Phase 1 engine tail) ───────────────────────
  // The CI-secrets → env-export → workflow-file → build-request sub-flow that
  // runs after credentials are saved. Every field is OPTIONAL and ADDITIVE: the
  // driver injects the concrete helper (pre-binding any cwd/runner/config it
  // owns) so the core stays IO-free. Signatures mirror the matching helper
  // modules verbatim so a driver can pass the real function unchanged. Cases
  // that consume these are wired in later tasks (A3/A4) — A2 only widens the
  // surface; existing call sites and the MCP bridge keep type-checking because
  // none of these are required.

  /**
   * Build the CI-secret entries (key/value/masked) from the saved credentials.
   * Mirrors ci-secrets.ts: createCiSecretEntries(credentials, apiKey?).
   */
  createCiSecretEntries?: (credentials: Partial<BuildCredentials>, apiKey?: string) => CiSecretEntry[]

  /**
   * Detect which CI-secret destinations (GitHub/GitLab) are reachable.
   * Mirrors ci-secrets.ts: detectCiSecretTargets(runner?). The driver pre-binds
   * the command runner, so the core calls this with no args.
   */
  detectCiSecretTargets?: (runner?: CommandRunner) => CiSecretDiscovery

  /**
   * Resolve the concrete `owner/repo` (GitHub) or `group/project` (GitLab) the
   * CLI will target, so the user can confirm before any secret is overwritten.
   * Mirrors ci-secrets.ts: getCiSecretRepoLabelAsync(target, runner?).
   */
  getCiSecretRepoLabelAsync?: (target: CiSecretTarget, runner?: AsyncCommandRunner) => Promise<string | null>

  /**
   * List which of `keys` already exist as secrets/variables on the remote.
   * Mirrors ci-secrets.ts: listExistingCiSecretKeysAsync(target, keys, runner?).
   */
  listExistingCiSecretKeysAsync?: (target: CiSecretTarget, keys: string[], runner?: AsyncCommandRunner) => Promise<string[]>

  /**
   * Push the CI-secret entries to the target, reporting per-key progress.
   * Mirrors ci-secrets.ts: uploadCiSecretsAsync(target, entries, existingKeys?, runner?, onProgress?).
   */
  uploadCiSecretsAsync?: (
    target: CiSecretTarget,
    entries: CiSecretEntry[],
    existingKeys?: string[],
    runner?: AsyncCommandRunner,
    onProgress?: (current: number, total: number, keyName: string) => void,
  ) => Promise<void>

  /**
   * Write the credentials to a local 0o600 `.env` file (no git operation).
   * Mirrors env-export.ts: exportCredentialsToEnv(opts).
   */
  exportCredentialsToEnv?: (opts: EnvExportOpts) => EnvExportResult

  /**
   * Resolve the default `.env` export path for an app + platform (pure).
   * Mirrors env-export.ts: defaultExportPath(appId, platform).
   */
  defaultExportPath?: (appId: string, platform: 'ios' | 'android') => string

  /**
   * Generate the GitHub Actions workflow YAML (pure).
   * Mirrors workflow-generator.ts: generateWorkflow(opts).
   */
  generateWorkflow?: (opts: WorkflowGeneratorOpts) => GeneratedWorkflow

  /**
   * Generate + write the workflow file to `.github/workflows/capgo-build.yml`.
   * Mirrors workflow-writer.ts: writeWorkflowFile(opts, writeOptions?).
   */
  writeWorkflowFile?: (opts: WorkflowGeneratorOpts, writeOptions?: WorkflowWriteOptions) => WorkflowWriteResult

  /**
   * Fire the actual `capgo build request`. The driver pre-binds the logger /
   * silent flag it owns; the core supplies appId + options.
   * Mirrors request.ts: requestBuildInternal(appId, options, silent?, logger?).
   */
  requestBuildInternal?: (appId: string, options: BuildRequestOptions, silent?: boolean, logger?: BuildLogger) => Promise<BuildRequestResult>

  /**
   * DRIVER-HELD transient tail state, threaded back into each post-save tail
   * effect. The Ink TUI resolves these ONCE (at `saving-credentials`) and keeps
   * them in React state (`savedCredentials` / `ciSecretEntries` /
   * `ciSecretExistingKeys`); a headless driver mirrors that by capturing the
   * matching `AndroidEffectResult.transient` from each effect and passing it
   * back here on the NEXT effect. The engine NEVER persists these to
   * progress.json — they are secrets/credentials/entries that must stay in
   * memory only. When a field is absent (e.g. a crash-recovery resume where the
   * driver lost its in-memory state) the effect falls back to a SINGLE lossy
   * re-derivation from progress (rebuildTailCredentials / createCiSecretEntries)
   * rather than resolving the Capgo API key a second time.
   */
  carried?: {
    /** Full saved credentials map written at saving-credentials (5 fields, no CAPGO_TOKEN). */
    savedCredentials?: Record<string, string>
    /** CI-secret entries resolved ONCE at saving-credentials (creds + Capgo API key → CAPGO_TOKEN). */
    ciSecretEntries?: CiSecretEntry[]
    /** Which secret keys already exist on the remote, resolved at checking-ci-secrets. */
    ciSecretExistingKeys?: string[]
  }

  // ── Callbacks (optional — callers that don't need streaming can omit) ────
  onStatus?: (message: string) => void
  onLog?: (message: string, color?: string) => void
  onAuthUrl?: (url: string) => void
  signal?: AbortSignal
}

// ─── AndroidStepCtx (extend with needsKeyPasswordPrompt) ─────────────────────
// Already exported above; this documents the Task 3 addition.
// AndroidStepCtx.needsKeyPasswordPrompt?: boolean — returned in transient when
// keystore-existing-key-password could not auto-resolve the key password so the
// driver shows the manual input prompt.
// (The field is declared inside AndroidStepCtx above; re-export not needed.)

// ─── AndroidEffectResult ─────────────────────────────────────────────────────

export interface AndroidEffectResult {
  /** Updated progress after the effect ran (matches what was persisted). */
  progress: AndroidOnboardingProgress
  /** Explicit next step when not derivable from progress alone (★ transitions). */
  next?: AndroidOnboardingStep
  /** Transient runtime data that lives in the driver but is NOT persisted. */
  transient?: Partial<AndroidStepCtx>
}

// ─── Tail credential threading (parity with the Ink TUI) ─────────────────────
//
// The post-save tail steps (checking-ci-secrets / uploading-ci-secrets /
// exporting-env / writing-workflow-file) need the same CI-secret entries +
// saved credentials the Ink TUI holds in `ciSecretEntries` / `savedCredentials`
// React state, resolved ONCE at `saving-credentials` (where the Capgo API key
// is folded into the entries so CAPGO_TOKEN rides along). A headless driver
// mirrors that by threading those values back through `deps.carried.*` on each
// subsequent effect — so the engine REUSES them rather than re-resolving the
// API key (which it cannot see) a second time. The `rebuildTailCredentials`
// fallback below is a SINGLE lossy re-derivation used only when the driver's
// carried state is absent (e.g. a crash-recovery resume that lost the
// in-memory React/driver state); it omits CAPGO_TOKEN, matching the worst-case
// the TUI would hit on the same path.
function rebuildTailCredentials(progress: AndroidOnboardingProgress): Record<string, string> {
  const keystoreBase64 = progress._keystoreBase64
  const serviceAccountKeyBase64 = progress._serviceAccountKeyBase64
  const keystoreStorePassword = progress.keystoreStorePassword
  const keystoreAlias = progress.keystoreAlias
  if (!keystoreBase64 || !serviceAccountKeyBase64 || !keystoreStorePassword || !keystoreAlias)
    return {}
  return {
    ANDROID_KEYSTORE_FILE: keystoreBase64,
    KEYSTORE_KEY_ALIAS: keystoreAlias,
    KEYSTORE_STORE_PASSWORD: keystoreStorePassword,
    KEYSTORE_KEY_PASSWORD: progress.keystoreKeyPassword || keystoreStorePassword,
    PLAY_CONFIG_JSON: serviceAccountKeyBase64,
  }
}

/**
 * The full saved-credential map for the env-export effects. Prefers the
 * driver's carried copy (the exact map `saving-credentials` wrote, mirroring
 * the TUI's `savedCredentials` state) so the exported .env carries the full
 * field set; falls back to a single lossy rebuild from progress only when the
 * driver did not thread it through.
 */
function tailSavedCredentials(progress: AndroidOnboardingProgress, deps: AndroidEffectDeps): Record<string, string> {
  const carried = deps.carried?.savedCredentials
  if (carried && Object.keys(carried).length > 0)
    return carried
  return rebuildTailCredentials(progress)
}

/**
 * The CI-secret entries for the upload / workflow effects. Prefers the driver's
 * carried entries (resolved ONCE at `saving-credentials` with the Capgo API key
 * folded in) so we never re-derive — and never re-resolve the API key. Falls
 * back to a single re-derivation from progress only when the driver did not
 * thread them through (entries then omit CAPGO_TOKEN). Returns [] when neither
 * the carried entries nor the `createCiSecretEntries` helper + rebuildable
 * credentials are available (e.g. a post-delete resume).
 */
function tailCiSecretEntries(progress: AndroidOnboardingProgress, deps: AndroidEffectDeps): CiSecretEntry[] {
  const carried = deps.carried?.ciSecretEntries
  if (carried)
    return carried
  if (!deps.createCiSecretEntries)
    return []
  const credentials = rebuildTailCredentials(progress)
  if (Object.keys(credentials).length === 0)
    return []
  return deps.createCiSecretEntries(credentials)
}

// ─── runAndroidEffect ─────────────────────────────────────────────────────────
//
// Dispatches to the right effect handler for auto steps that do IO.
// Throws `Error('Unhandled effect step: ${step}')` for steps not yet
// implemented in this task — the driver catches and surfaces the error.
//
// Persistence contract: the effect calls `deps.saveAndroidProgress` at the
// SAME points app.tsx's `persist()` calls fire (crash-recovery parity), AND
// returns the final progress in AndroidEffectResult.progress. The driver may
// also call saveAndroidProgress for steps where the effect's transient result
// implies a state change but the effect intentionally withholds (e.g.
// keystore-existing-detecting-alias persists alias; detecting fails → no persist).

export async function runAndroidEffect(
  step: AndroidOnboardingStep,
  progress: AndroidOnboardingProgress,
  deps: AndroidEffectDeps,
): Promise<AndroidEffectResult> {
  switch (step) {
    // ── backing-up ────────────────────────────────────────────────────────
    // app.tsx:1017–1035. Copy the existing ~/.capgo-credentials/credentials.json
    // to a timestamped sibling before the keystore phase overwrites it, then
    // advance to keystore-method-select. A missing source file is non-fatal
    // (yellow warning) — the gate's promise was "backup first", not "must exist".
    // The gate transitions to 'done' so resume falls through to keystore.
    case 'backing-up': {
      const credPath = join(homedir(), '.capgo-credentials', 'credentials.json')
      const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const backupPath = join(homedir(), '.capgo-credentials', `credentials-${date}.copy.json`)
      try {
        await deps.copyFile(credPath, backupPath)
        deps.onLog?.(`✔ Backup saved · ${backupPath}`)
      }
      catch {
        deps.onLog?.('⚠ Could not backup credentials (file may not exist yet)', 'yellow')
      }
      const nextProgress: AndroidOnboardingProgress = { ...progress, _credentialsExistGate: 'done' }
      await deps.saveAndroidProgress(progress.appId, nextProgress)
      return { progress: nextProgress, next: 'keystore-method-select' }
    }

    // ── keystore-existing-detecting-alias ─────────────────────────────────
    // app.tsx:903–942
    case 'keystore-existing-detecting-alias': {
      const bytes = await deps.readFile(progress.keystoreExistingPath!)
      const listed = deps.listKeystoreAliases(bytes, progress.keystoreStorePassword!)

      if (listed.ok && listed.aliases.length === 1) {
        const alias = listed.aliases[0]
        const nextProgress: AndroidOnboardingProgress = { ...progress, keystoreAlias: alias }
        await deps.saveAndroidProgress(progress.appId, nextProgress)
        deps.onLog?.(`✔ Detected alias · ${alias}`)
        return { progress: nextProgress, next: 'keystore-existing-key-password' }
      }

      if (listed.ok && listed.aliases.length > 1) {
        // Do NOT persist alias — user must choose from transient detectedAliases
        return {
          progress,
          next: 'keystore-existing-alias-select',
          transient: { detectedAliases: listed.aliases },
        }
      }

      if (!listed.ok && listed.reason === 'wrong-password') {
        // Do NOT throw — the driver owns the error UX for this case.
        // Return a transient signal so the driver can reproduce the original behavior:
        //   setError('Store password was rejected...')
        //   setRetryStep('keystore-existing-store-password')
        //   setStep('error')
        // without calling handleError (which would bump retryCount).
        return { progress, next: 'keystore-existing-store-password', transient: { wrongPassword: true } }
      }

      // unsupported-format (JKS etc.) or 0 aliases → ask manually
      // (app.tsx:931–935: unsupported→log+alias, ok+0→log+alias)
      if (!listed.ok && listed.reason === 'unsupported-format')
        deps.onLog?.('ℹ Couldn\'t auto-detect alias (JKS format or similar) — enter it manually.', 'yellow')
      else if (listed.ok)
        deps.onLog?.('ℹ Couldn\'t auto-detect alias from the keystore — enter it manually.', 'yellow')
      return { progress, next: 'keystore-existing-alias' }
    }

    // ── keystore-existing-key-password ────────────────────────────────────
    // app.tsx:951–1037 (auto probe) + 2058–2095 (prompt onSubmit completion)
    //
    // Unified handler: the effect is called twice on the prompt path —
    //   1st call: probe fails → returns { next: 'keystore-existing-key-password',
    //             transient: { needsKeyPasswordPrompt: true } } — driver shows prompt.
    //   2nd call: after applyAndroidInput has recorded keystoreKeyPassword,
    //             probe resolves from progress → continues to completion.
    case 'keystore-existing-key-password': {
      let resolvedKeyPw: string | null = null
      let resolution: 'progress' | 'probed-same' | null = null

      // Path 1: progress already has keystoreKeyPassword (from resume or prompt submission)
      if (progress.keystoreKeyPassword) {
        resolvedKeyPw = progress.keystoreKeyPassword
        resolution = 'progress'
      }
      // Path 2: attempt PKCS#12 probe with the store password
      else if (progress.keystoreStorePassword && progress.keystoreExistingPath) {
        try {
          const bytes = await deps.readFile(progress.keystoreExistingPath)
          const result = deps.tryUnlockPrivateKey(bytes, progress.keystoreStorePassword)
          if (result.ok) {
            resolvedKeyPw = progress.keystoreStorePassword
            resolution = 'probed-same'
          }
        }
        catch {
          // readFile failed — fall through to prompt
        }
      }

      if (!resolvedKeyPw) {
        // Prompt path: tell the driver to show the key-password input
        return {
          progress,
          next: 'keystore-existing-key-password',
          transient: { needsKeyPasswordPrompt: true },
        }
      }

      // Auto-resolved — complete the keystore phase (app.tsx:994–1031)
      if (resolution === 'probed-same')
        deps.onLog?.('ℹ Key password matches store password — using the same value')
      const keyPw = resolvedKeyPw
      deps.onLog?.('✔ Key password set')
      const bytes = await deps.readFile(progress.keystoreExistingPath!)
      const base64 = bytes.toString('base64')
      const ready: KeystoreReady = {
        keystorePath: progress.keystoreExistingPath!,
        alias: progress.keystoreAlias || RELEASE_ALIAS_DEFAULT,
        isGenerated: false,
      }
      const nextProgress: AndroidOnboardingProgress = {
        ...progress,
        keystoreKeyPassword: keyPw,
        _keystoreBase64: base64,
        serviceAccountForkSeen: true,
        completedSteps: { ...progress.completedSteps, keystoreReady: ready },
      }
      await deps.saveAndroidProgress(progress.appId, nextProgress)
      deps.onLog?.(`✔ Keystore loaded — ${progress.keystoreExistingPath!}`)

      // Smart-route: load fresh progress to check for prior OAuth progress.
      // app.tsx:1024–1031
      const fresh = await deps.loadAndroidProgress(progress.appId)
      const hasOAuthProgress = fresh ? hasAnyOAuthProgress(fresh) : false
      let nextStep: AndroidOnboardingStep
      if (hasOAuthProgress || fresh?.serviceAccountMethod !== undefined) {
        nextStep = fresh ? getAndroidResumeStep(fresh) : 'service-account-method-select'
      }
      else {
        nextStep = 'service-account-method-select'
      }

      return { progress: nextProgress, next: nextStep }
    }

    // ── keystore-generating ───────────────────────────────────────────────
    // app.tsx:1040–1093
    case 'keystore-generating': {
      const storePw = progress.keystoreStorePassword!
      const keyPw = progress.keystoreKeyPassword || storePw
      const cn = progress.keystoreCommonName || progress.appId
      const result = deps.generateKeystore({
        alias: progress.keystoreAlias || RELEASE_ALIAS_DEFAULT,
        storePassword: storePw,
        keyPassword: keyPw,
        dname: { commonName: cn, organizationName: 'Capgo' },
      })

      const defaultPath = `android/app/${result.alias}.p12`
      const ready: KeystoreReady = {
        keystorePath: defaultPath,
        alias: result.alias,
        isGenerated: true,
      }

      const nextProgress: AndroidOnboardingProgress = {
        ...progress,
        keystoreMethod: 'generate',
        keystoreAlias: result.alias,
        keystoreStorePassword: storePw,
        keystoreKeyPassword: keyPw,
        keystoreCommonName: cn,
        _keystoreBase64: result.p12Base64,
        serviceAccountForkSeen: true,
        completedSteps: { ...progress.completedSteps, keystoreReady: ready },
      }

      await deps.saveAndroidProgress(progress.appId, nextProgress)
      deps.onLog?.(`✔ Keystore generated — alias: ${result.alias}, valid until ${result.notAfter.getFullYear()}`)

      // After fresh keystore generation in this run, always land on the
      // new method-select fork — no prior SA choice exists yet.
      // app.tsx:1086
      return { progress: nextProgress, next: 'service-account-method-select' }
    }

    // ── sa-json-validating ────────────────────────────────────────────────
    // app.tsx:835–901
    case 'sa-json-validating': {
      const jsonBytes = await deps.readFile(progress.serviceAccountJsonPath!)
      const packageName = progress.completedSteps.androidPackageChosen!.packageName

      const result = await deps.validateServiceAccountJson({
        jsonBytes,
        packageName,
        signal: deps.signal,
      })

      if (result.ok) {
        const base64 = jsonBytes.toString('base64')
        const nextProgress: AndroidOnboardingProgress = {
          ...progress,
          _serviceAccountKeyBase64: base64,
          // Clear any stale "skipped" flag from a previous attempt (app.tsx:869)
          serviceAccountValidationSkipped: false,
        }
        await deps.saveAndroidProgress(progress.appId, nextProgress)
        deps.onLog?.(`✔ Service account verified — ${result.serviceAccountEmail}`)
        return { progress: nextProgress, next: 'saving-credentials' }
      }

      // Failure — do NOT persist the key (app.tsx never persists on failure)
      // shape-error: surface as a banner log (app.tsx:893)
      if (result.kind === 'shape-error')
        deps.onLog?.(`✖ ${result.message}`, 'red')
      return {
        progress,
        next: 'sa-json-validation-failed',
        transient: { saValidation: result },
      }
    }

    // ── saving-credentials ────────────────────────────────────────────────
    // app.tsx:1345–1399 + doSaveCredentials:703–723
    case 'saving-credentials': {
      // Self-heal: re-validate progress before attempting the save.
      // app.tsx:1353–1363
      const fresh = await deps.loadAndroidProgress(progress.appId)
      if (fresh) {
        const expectedStep = getAndroidResumeStep(fresh)
        if (expectedStep !== 'saving-credentials') {
          return { progress, next: expectedStep }
        }
      }

      // doSaveCredentials guards — app.tsx:704–709
      const keystoreBase64 = progress._keystoreBase64
      if (!keystoreBase64)
        throw new Error('keystore not ready')
      const serviceAccountKeyBase64 = progress._serviceAccountKeyBase64
      if (!serviceAccountKeyBase64)
        throw new Error('service-account key not provisioned')
      const keystoreStorePassword = progress.keystoreStorePassword
      const keystoreAlias = progress.keystoreAlias
      if (!keystoreStorePassword || !keystoreAlias)
        throw new Error('keystore inputs missing')

      const credentials: Record<string, string> = {
        ANDROID_KEYSTORE_FILE: keystoreBase64,
        KEYSTORE_KEY_ALIAS: keystoreAlias,
        KEYSTORE_STORE_PASSWORD: keystoreStorePassword,
        KEYSTORE_KEY_PASSWORD: progress.keystoreKeyPassword || keystoreStorePassword,
        PLAY_CONFIG_JSON: serviceAccountKeyBase64,
      }

      await deps.updateSavedCredentials(progress.appId, 'android', credentials)
      await deps.deleteAndroidProgress(progress.appId)
      deps.onLog?.('✔ Credentials saved')

      // Random-password backup hint — emitted only here (post-save) so the
      // claim "stored in credentials.json" is true (app.tsx:1343–1349). The TUI
      // gates this on its `randomPasswordGenerated` React state; the stateless
      // engine reads the persisted `keystorePasswordGenerated` marker progress
      // carries for the same situation. On a crash-recovery resume where that
      // marker is absent the hint is skipped — same acceptable trade-off the TUI
      // makes when its in-memory flag was wiped.
      if (progress.keystorePasswordGenerated)
        deps.onLog?.('  ℹ Your auto-generated keystore password is now in ~/.capgo-credentials/credentials.json — back up that file.', 'yellow')

      // Stash the CI-secret entries + raw credentials for the post-build
      // sub-flow. We do NOT push to GitHub/GitLab here — the wizard offers that
      // only AFTER a successful first build, so users never end up with orphan
      // secrets in a repo whose build was never proven to work (app.tsx:1350–
      // 1367 doSaveCredentials). The driver pre-binds the Capgo API key into
      // createCiSecretEntries (so CAPGO_TOKEN is included for the generated
      // workflow); the core supplies the credentials it just wrote.
      //
      // Both values ride in transient — the Ink TUI holds the same in useState
      // (ciSecretEntries / savedCredentials). They are resolved ONCE here; later
      // tail effects REUSE them via deps.carried.* rather than rebuilding (which
      // would re-resolve the API key AND risk landing secrets on disk).
      const entries = deps.createCiSecretEntries?.(credentials) ?? []

      // 'ask-build' is the Ink driver's post-save entry point.
      // The MCP bridge (Plan B) maps this to 'done'.
      return { progress, next: 'ask-build', transient: { ciSecretEntries: entries, savedCredentials: credentials } }
    }

    // ── google-sign-in-running ────────────────────────────────────────────
    // app.tsx:1095–1166
    //
    // The driver pre-binds OAuth client config + scopes into deps.runOAuthFlow,
    // keeping config/scope policy in the driver and out of the core.
    case 'google-sign-in-running': {
      let tokens: GoogleOAuthTokens
      try {
        tokens = await deps.runOAuthFlow({
          onAuthUrl: deps.onAuthUrl,
          onStatus: deps.onStatus,
        })
      }
      catch (err) {
        // User deselected one or more scopes on the consent screen.
        // Treat this as a recoverable input error: route back to the pre-consent
        // screen so the user can try again. Do NOT burn a retry strike.
        if (err instanceof MissingScopesError) {
          deps.onLog?.('✖ Sign-in did not grant all required permissions.', 'red')
          for (const scope of err.missing)
            deps.onLog?.(`  • Missing: ${scope}`, 'yellow')
          deps.onLog?.('Please retry sign-in and leave every requested permission checked.', 'yellow')
          return { progress, next: 'google-sign-in' }
        }
        throw err
      }

      if (!tokens.refreshToken) {
        throw new Error('Google did not return a refresh token — try again.')
      }

      const info = await deps.fetchUserInfo(tokens.accessToken)

      const nextProgress = applyGoogleSignIn(progress, tokens, info)

      await deps.saveAndroidProgress(progress.appId, nextProgress)
      deps.onLog?.(`✔ Signed in as ${info.email}`)

      // Return the fresh access token in transient so the driver can seed its
      // token cache and avoid an immediate refresh on the next GCP call.
      // If the driver ignores it, deps.getAccessToken() will mint one —
      // behaviorally identical.
      return {
        progress: nextProgress,
        next: 'play-developer-id-input',
        transient: { accessToken: tokens.accessToken },
      }
    }

    // ── gcp-projects-loading ──────────────────────────────────────────────
    // app.tsx:1183–1198
    //
    // Pure load: fetch GCP projects, return in transient, do NOT persist.
    case 'gcp-projects-loading': {
      const tok = await deps.getAccessToken()
      const projects = await deps.listProjects(tok)
      return {
        progress,
        next: 'gcp-projects-select',
        transient: {
          gcpProjects: projects.map(p => ({
            projectId: p.projectId,
            name: p.name,
            projectNumber: p.projectNumber,
          })),
        },
      }
    }

    // ── android-package-select (pre-load) ─────────────────────────────────
    // app.tsx:1173–1181
    //
    // Pure load: detect Gradle applicationIds, return in transient.
    // Stays on android-package-select so the driver re-renders as a choice
    // once detectedPackageIds is populated. Do NOT persist here.
    case 'android-package-select': {
      const ids = await deps.findAndroidApplicationIds()
      return {
        progress,
        next: 'android-package-select',
        transient: { detectedPackageIds: ids },
      }
    }

    // ── gcp-setup-running ─────────────────────────────────────────────────
    // app.tsx:1200–1342
    //
    // The full GCP + Play provisioning chain. Persists incrementally after
    // each major step for crash-recovery parity with app.tsx.
    case 'gcp-setup-running': {
      const tok = await deps.getAccessToken()

      // Use a mutable local reference so incremental persistence can build on
      // the latest persisted state (mirrors app.tsx's local `projectChoice`
      // mutation + `persist()` calls).
      let currentProgress: AndroidOnboardingProgress = progress

      // Read gcpProjectChosen from progress — may be updated locally below
      // (incremental persistence after project creation).
      let projectChoice = currentProgress.completedSteps.gcpProjectChosen

      // Step A: create project if the user chose "new" and it hasn't been
      // created yet (crash-resume: if projectNumber is already set, skip).
      if (projectChoice && projectChoice.createdByOnboarding && !projectChoice.projectNumber) {
        deps.onStatus?.(`Creating GCP project ${projectChoice.projectId}...`)
        const created = await deps.createProject(tok, projectChoice.projectId, projectChoice.displayName)
        projectChoice = { ...projectChoice, projectNumber: created.projectNumber }
        currentProgress = {
          ...currentProgress,
          completedSteps: { ...currentProgress.completedSteps, gcpProjectChosen: projectChoice },
        }
        await deps.saveAndroidProgress(currentProgress.appId, currentProgress)
        deps.onStatus?.(`✔ Project created (number ${created.projectNumber})`)
      }

      if (!projectChoice) {
        throw new Error('No GCP project selected')
      }

      const projectId = projectChoice.projectId

      // Step B: enable Android Publisher API (idempotent).
      deps.onStatus?.(`Enabling ${ANDROIDPUBLISHER_API}...`)
      await deps.enableService(tok, projectId, ANDROIDPUBLISHER_API)
      deps.onStatus?.('✔ API enabled')

      // Step C: create or find the capgo-native-build service account.
      deps.onStatus?.(`Ensuring service account "${DEFAULT_SERVICE_ACCOUNT_ID}"...`)
      const { account: sa, created: saCreated } = await deps.ensureServiceAccount({
        accessToken: tok,
        projectId,
        accountId: DEFAULT_SERVICE_ACCOUNT_ID,
        displayName: DEFAULT_SERVICE_ACCOUNT_DISPLAY_NAME,
        description: DEFAULT_SERVICE_ACCOUNT_DESCRIPTION,
      })
      const saProv = {
        email: sa.email,
        projectId,
        uniqueId: sa.uniqueId,
      }
      deps.onStatus?.(saCreated ? `✔ Service account created — ${sa.email}` : `✔ Service account exists — ${sa.email}`)

      // Step D: create a fresh JSON key for the SA.
      // Persist after this step so the key is safe even if later steps fail.
      deps.onStatus?.('Creating service-account JSON key...')
      const key = await deps.createServiceAccountKey({
        accessToken: tok,
        projectId,
        serviceAccountEmail: sa.email,
      })
      currentProgress = {
        ...currentProgress,
        _serviceAccountKeyBase64: key.privateKeyDataBase64,
        completedSteps: { ...currentProgress.completedSteps, serviceAccountProvisioned: saProv },
      }
      await deps.saveAndroidProgress(currentProgress.appId, currentProgress)
      deps.onStatus?.('✔ Key created')

      // Step E: invite the SA into the Play Developer account.
      const playAccountChoice = currentProgress.completedSteps.playAccountChosen
      if (!playAccountChoice) {
        throw new Error('No Play Developer account chosen')
      }
      const androidPackageChoice = currentProgress.completedSteps.androidPackageChosen
      deps.onStatus?.(`Inviting ${sa.email} to Play Console...`)
      try {
        if (!androidPackageChoice) {
          throw new Error('No Android package selected for the Play invite')
        }
        await deps.inviteServiceAccount({
          accessToken: tok,
          developerId: playAccountChoice.developerId,
          serviceAccountEmail: sa.email,
          developerAccountPermissions: CAPGO_SA_DEVELOPER_PERMISSIONS,
          grants: [{
            packageName: androidPackageChoice.packageName,
            permissions: CAPGO_SA_APP_PERMISSIONS,
          }],
        })
      }
      catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // Treat "already exists" style failures as success — the SA is already
        // a user on this developer account from a prior run.
        if (!/already|exists|duplicate/i.test(msg)) {
          throw err
        }
        deps.onStatus?.('ℹ Service account was already invited — continuing')
      }

      const invite = {
        developerId: playAccountChoice.developerId,
        serviceAccountEmail: sa.email,
      }
      currentProgress = {
        ...currentProgress,
        completedSteps: { ...currentProgress.completedSteps, playInviteProvisioned: invite },
      }
      await deps.saveAndroidProgress(currentProgress.appId, currentProgress)
      deps.onStatus?.('✔ Play Console invite confirmed')

      // Step F: revoke the OAuth refresh token now that provisioning succeeded.
      // From this point forward Capgo uses the service account JSON key.
      // Failure is non-fatal: the token expires within ~1 hour regardless.
      if (currentProgress._oauthRefreshToken) {
        deps.onStatus?.('Revoking OAuth token (we don\'t need it anymore)...')
        try {
          await deps.revokeToken(currentProgress._oauthRefreshToken)
          deps.onStatus?.('✔ OAuth token revoked')
        }
        catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          deps.onStatus?.(`⚠ Revoke request failed (${msg}) — token will expire on its own`)
        }
      }

      deps.onLog?.('✔ Google Cloud + Play setup complete')
      return { progress: currentProgress, next: 'saving-credentials' }
    }

    // ── detecting-ci-secrets ──────────────────────────────────────────────
    // app.tsx:1377–1412
    //
    // Discover which CI-secret destinations (GitHub/GitLab) are reachable, then
    // route on the result. A single GitHub target persists `ciSecretTarget` and
    // continues into the GitHub Actions setup prompt; a single GitLab target
    // uses the legacy 2-option flow; multiple targets ask the user to pick.
    case 'detecting-ci-secrets': {
      const discovery = deps.detectCiSecretTargets!()

      // Surface the discovered targets + per-destination setup advice on EVERY
      // return path. The TUI sets both unconditionally before branching
      // (app.tsx:1383–1384 setCiSecretTargets / setCiSecretSetupAdvice), so a
      // headless driver can render the same "how to enable a destination"
      // guidance regardless of which branch we take below. This is transient
      // only — never persisted to progress.
      const discoveryTransient = { ciSecretTargets: discovery.targets, ciSecretSetupAdvice: discovery.setup }

      if (discovery.targets.length === 0) {
        if (discovery.setup.length > 0)
          return { progress, next: 'ci-secrets-setup', transient: discoveryTransient }
        for (const note of discovery.notes)
          deps.onLog?.(`ℹ ${note}`, 'yellow')
        return { progress, next: 'build-complete', transient: discoveryTransient }
      }

      if (discovery.targets.length === 1) {
        const target = discovery.targets[0]
        // Persist the chosen destination — the TUI sets this via setCiSecretTarget
        // and the later checking/uploading steps read it back.
        const nextProgress: AndroidOnboardingProgress = { ...progress, ciSecretTarget: target }
        await deps.saveAndroidProgress(progress.appId, nextProgress)
        // GitHub → 3-option workflow flow; GitLab → legacy 2-option flow.
        const next = target.provider === 'github' ? 'ask-github-actions-setup' : 'ask-ci-secrets'
        return { progress: nextProgress, next, transient: discoveryTransient }
      }

      return { progress, next: 'ci-secrets-target-select', transient: discoveryTransient }
    }

    // ── checking-ci-secrets ───────────────────────────────────────────────
    // app.tsx:1414–1456
    //
    // Resolve the concrete repo/group label (GitHub only) and list which secret
    // keys already exist on the remote so the user can confirm before any
    // overwrite. GitHub routes to the confirm-secrets-push gate unconditionally;
    // GitLab routes to the overwrite confirmation only when keys already exist.
    case 'checking-ci-secrets': {
      const target = progress.ciSecretTarget
      if (!target)
        throw new Error('No git hosting target selected.')

      let repoLabel: string | null = null
      if (target.provider === 'github') {
        repoLabel = await deps.getCiSecretRepoLabelAsync!(target)
        if (!repoLabel)
          return { progress, next: 'ci-secrets-failed', transient: { ciSecretRepoLabel: null } }
      }

      const entries = tailCiSecretEntries(progress, deps)
      const existing = await deps.listExistingCiSecretKeysAsync!(target, entries.map(entry => entry.key))

      if (target.provider === 'github')
        return { progress, next: 'confirm-secrets-push', transient: { ciSecretRepoLabel: repoLabel, ciSecretExistingKeys: existing, ciSecretEntries: entries } }

      const next = existing.length > 0 ? 'confirm-ci-secret-overwrite' : 'uploading-ci-secrets'
      return { progress, next, transient: { ciSecretExistingKeys: existing, ciSecretEntries: entries } }
    }

    // ── uploading-ci-secrets ──────────────────────────────────────────────
    // app.tsx:1458–1508
    //
    // Push the entries to the target, then branch on the GitHub Actions setup
    // choice made earlier: 'with-workflow' continues into the workflow-builder
    // sub-flow (pick-package-manager); every other mode (secrets-only / GitLab
    // 'undecided') finishes at build-complete.
    case 'uploading-ci-secrets': {
      const target = progress.ciSecretTarget
      if (!target)
        throw new Error('No git hosting target selected.')

      const entries = tailCiSecretEntries(progress, deps)
      // The existing-key list lives in the driver's transient (set at
      // checking-ci-secrets and threaded back via deps.carried) — it is NEVER
      // persisted to progress. Pass it as the 4th arg exactly as the TUI does
      // (app.tsx:1463–1466 uploadCiSecretsAsync(..., ciSecretExistingKeys)) so
      // an already-existing secret is treated as an UPDATE rather than a
      // create. When the driver did not thread it (crash-recovery resume), it
      // stays undefined — uploadCiSecretsAsync then treats every key as a write,
      // matching the TUI when the user accepted the overwrite prompt.
      await deps.uploadCiSecretsAsync!(target, entries, deps.carried?.ciSecretExistingKeys)

      const summary = `Uploaded ${entries.length} env var${entries.length === 1 ? '' : 's'} to ${target.label}`
      deps.onLog?.(`✔ ${summary}`)

      if (progress.setupMode === 'with-workflow')
        return { progress, next: 'pick-package-manager', transient: { ciSecretUploadSummary: summary } }
      return { progress, next: 'build-complete', transient: { ciSecretUploadSummary: summary } }
    }

    // ── exporting-env ─────────────────────────────────────────────────────
    // app.tsx:1592–1625
    //
    // Write the saved credentials to a local 0o600 `.env` file. An existing
    // target file (without overwrite) routes to the overwrite confirmation,
    // persisting the resolved path so overwrite-and-export-env can reuse it.
    // Empty / written outcomes both finish at build-complete.
    case 'exporting-env': {
      const targetPath = progress.envExportTargetPath || deps.defaultExportPath!(progress.appId, 'android')
      const result = deps.exportCredentialsToEnv!({
        appId: progress.appId,
        platform: 'android',
        credentials: tailSavedCredentials(progress, deps),
        targetPath,
      })

      if (result.kind === 'empty')
        return { progress, next: 'build-complete' }

      if (result.kind === 'exists') {
        const nextProgress: AndroidOnboardingProgress = { ...progress, envExportTargetPath: result.path }
        await deps.saveAndroidProgress(progress.appId, nextProgress)
        return { progress: nextProgress, next: 'confirm-env-export-overwrite' }
      }

      deps.onLog?.(`✔ Exported ${result.fieldCount} field${result.fieldCount === 1 ? '' : 's'} → ${result.path}`)
      return { progress, next: 'build-complete', transient: { envExportPath: result.path } }
    }

    // ── overwrite-and-export-env ──────────────────────────────────────────
    // app.tsx:1627–1652
    //
    // Re-export with overwrite=true to the path the user just confirmed, then
    // finish at build-complete.
    case 'overwrite-and-export-env': {
      const result = deps.exportCredentialsToEnv!({
        appId: progress.appId,
        platform: 'android',
        credentials: tailSavedCredentials(progress, deps),
        targetPath: progress.envExportTargetPath,
        overwrite: true,
      })

      if (result.kind === 'written') {
        deps.onLog?.(`✔ Overwrote ${result.path} with ${result.fieldCount} field${result.fieldCount === 1 ? '' : 's'}`)
        return { progress, next: 'build-complete', transient: { envExportPath: result.path } }
      }
      return { progress, next: 'build-complete' }
    }

    // ── writing-workflow-file ─────────────────────────────────────────────
    // app.tsx:1553–1590
    //
    // Generate + write `.github/workflows/capgo-build.yml` (overwrite=true —
    // the preview/diff confirmation already happened). The build script choice
    // must be on progress (recorded at pick-build-script). Finishes at
    // build-complete.
    case 'writing-workflow-file': {
      const buildScript = progress.buildScriptChoice
      if (!buildScript)
        throw new Error('Internal error: no build script choice recorded.')

      const entries = tailCiSecretEntries(progress, deps)
      const result = deps.writeWorkflowFile!(
        {
          appId: progress.appId,
          defaultPlatform: 'android',
          packageManager: progress.selectedPackageManager ?? 'npm',
          buildScript,
          secretKeys: entries.map(entry => entry.key),
        },
        { overwrite: true },
      )

      if (result.kind === 'written') {
        deps.onLog?.(`✔ Wrote ${result.absolutePath}`)
        return { progress, next: 'build-complete', transient: { workflowFilePath: result.absolutePath } }
      }
      return { progress, next: 'build-complete' }
    }

    // ── requesting-build ──────────────────────────────────────────────────
    // app.tsx:1654–1741
    //
    // Fire the real `capgo build request`. The driver pre-binds the logger +
    // silent flag + the resolved Capgo API key into deps.requestBuildInternal
    // (it owns apikey resolution — CLI flag → findSavedKeySilent), so the core
    // passes a minimal options object and never sees the key. `apikey: ''` is a
    // type-satisfying placeholder the driver's binding overrides. Routing:
    //   success + entries pending → detecting-ci-secrets (offer CI push)
    //   success + no entries      → build-complete
    //   failure + ai analysis     → ai-analysis-prompt (TUI-only sub-flow)
    //   failure (no analysis)     → build-complete
    case 'requesting-build': {
      const result = await deps.requestBuildInternal!(
        progress.appId,
        { apikey: '', platform: 'android', aiAnalysisMode: 'caller-handled' },
      )

      if (result.success) {
        const url = `https://capgo.app/app/${progress.appId}/builds`
        deps.onLog?.(`✔ Build queued — ${url}`)
        // Only offer to push CI secrets AFTER a build has been queued. If we
        // never had any credentials to push (entries empty), skip to exit.
        const entries = tailCiSecretEntries(progress, deps)
        if (entries.length > 0)
          return { progress, next: 'detecting-ci-secrets', transient: { buildUrl: url, ciSecretEntries: entries } }
        return { progress, next: 'build-complete', transient: { buildUrl: url } }
      }

      deps.onLog?.(`⚠ ${result.error || 'unknown error'}`, 'yellow')
      // Offer AI-assisted diagnosis when logs were captured. The TUI owns the
      // ai-analysis-* sub-flow (no AI-calling-AI in the headless engine); the
      // engine only routes there and surfaces the job id in transient.
      if (result.aiAnalysis?.ready && result.aiAnalysis.jobId)
        return { progress, next: 'ai-analysis-prompt', transient: { aiJobId: result.aiAnalysis.jobId } }
      return { progress, next: 'build-complete' }
    }

    // ── Not yet implemented (bootstrap / post-save tail / native-picker) ──
    default:
      throw new Error(`Unhandled effect step: ${step}`)
  }
}
