// src/build/onboarding/tail/flow.ts
//
// Platform-NEUTRAL post-save "tail" of onboarding — the CI-secrets → env-export
// → workflow-file → build-request sub-flow that runs identically on BOTH the iOS
// (`OnboardingProgress`) and Android (`AndroidOnboardingProgress`) tracks once
// credentials have been saved.
//
// This module is the single home for the tail's routing, branch conditions,
// helper calls, transient threading and the keystore-password backup hint. It
// was extracted VERBATIM from `android/flow.ts` (runAndroidEffect /
// androidViewForStep / applyAndroidInput tail cases) so the two platforms cannot
// drift. The android engine delegates to it and adapts the neutral view for its
// own TUI; a future iOS engine can reuse it unchanged.
//
// Platform-specific bits are parameterised via `TailEffectDeps`, NOT hardcoded:
//   - `platform` ('ios' | 'android') tags the saved-credential store, the
//     env-export filename and the build request / generated workflow.
//   - `buildSavedCredentials(progress)` builds the platform credential SHAPE
//     (e.g. ANDROID_KEYSTORE_FILE… on android) and throws on missing inputs.
//   - `rebuildTailCredentials(progress)` is the lossy fallback used when the
//     driver did not thread the saved-credential map through `carried`.
//   - `resumeStep(progress)` is the platform's resume resolver, used by the
//     `saving-credentials` self-heal guard.
//
// The core stays IO-free: every concrete helper (createCiSecretEntries,
// detectCiSecretTargets, …, requestBuildInternal) is injected by the driver.

import type { BuildCredentials } from '../../../schemas/build.js'
import type { BuildLogger, BuildRequestOptions, BuildRequestResult } from '../../request.js'
import type { AsyncCommandRunner, CiSecretDiscovery, CiSecretEntry, CiSecretSetupAdvice, CiSecretTarget, CommandRunner } from '../ci-secrets.js'
import type { EnvExportOpts, EnvExportResult } from '../env-export.js'
import type { BuildScriptChoice, GeneratedWorkflow, PackageManager, WorkflowGeneratorOpts } from '../workflow-generator.js'
import type { WorkflowWriteOptions, WorkflowWriteResult } from '../workflow-writer.js'
import { getCiSecretTargetLabel } from '../ci-secrets.js'
import { buildScriptPickerOptions } from '../workflow-ui-helpers.js'
import { WORKFLOW_PATH } from '../workflow-generator.js'

// ─── Shared tail step ids ─────────────────────────────────────────────────────
//
// The exact post-save tail steps shared by `OnboardingStep` (iOS) and
// `AndroidOnboardingStep`. AI-analysis-* is intentionally EXCLUDED (TUI-only —
// no AI-calling-AI in the headless engine). `requesting-build` may route to
// `ai-analysis-prompt`; that id is part of the broader step type each platform
// owns, so the neutral effect returns it as a `next` string the driver routes.

export type TailStep
  = | 'saving-credentials'
    | 'detecting-ci-secrets'
    | 'ci-secrets-setup'
    | 'ci-secrets-target-select'
    | 'ask-ci-secrets'
    | 'checking-ci-secrets'
    | 'confirm-ci-secret-overwrite'
    | 'uploading-ci-secrets'
    | 'ci-secrets-failed'
    | 'ask-github-actions-setup'
    | 'confirm-secrets-push'
    | 'ask-export-env'
    | 'exporting-env'
    | 'confirm-env-export-overwrite'
    | 'overwrite-and-export-env'
    | 'pick-package-manager'
    | 'pick-build-script'
    | 'pick-build-script-custom'
    | 'preview-workflow-file'
    | 'view-workflow-diff'
    | 'writing-workflow-file'
    | 'ask-build'
    | 'requesting-build'
    | 'build-complete'

// ─── Neutral view ─────────────────────────────────────────────────────────────
//
// Mirrors `AndroidStepView` (step/kind/title/prompt/collect/options/message) so
// the android engine can adapt it 1:1 to `AndroidStepView`. `step` is typed as a
// string so a platform engine can echo its own (wider) step id back.

export type TailStepKind = 'auto' | 'input' | 'choice' | 'done' | 'error'

export interface TailStepOption {
  value: string
  label?: string
  note?: string
}

export interface TailStepView {
  step: string
  kind: TailStepKind
  title?: string
  prompt?: string
  collect?: string[]
  options?: TailStepOption[]
  message?: string
}

/**
 * Runtime context for the tail views — the OPTIONAL transient data a driver
 * surfaces from a prior effect. Mirrors the tail subset of `AndroidStepCtx` so
 * the android engine can pass its ctx straight through.
 */
export interface TailStepCtx {
  ciSecretEntries?: CiSecretEntry[]
  ciSecretTargets?: CiSecretTarget[]
  ciSecretSetupAdvice?: CiSecretSetupAdvice[]
  ciSecretRepoLabel?: string | null
  detectedPackageManager?: string
  availableScripts?: Record<string, string>
  recommendedScript?: string | null
  defaultEnvExportPath?: string
}

// ─── Neutral progress shape ───────────────────────────────────────────────────
//
// The structural subset of progress the tail reads. Both `OnboardingProgress`
// and `AndroidOnboardingProgress` satisfy it (every field is present-or-optional
// on both). `keystorePasswordGenerated` is android-only; it stays optional here
// so the verbatim backup-hint branch keeps working on android and is simply
// never set on iOS.

export interface TailEffectProgress {
  appId: string
  setupMode?: 'undecided' | 'with-workflow' | 'secrets-only' | 'declined'
  ciSecretTarget?: CiSecretTarget | null
  selectedPackageManager?: PackageManager | null
  buildScriptChoice?: BuildScriptChoice | null
  envExportTargetPath?: string
  /** Android-only marker that gates the random-password backup hint. */
  keystorePasswordGenerated?: boolean
}

// ─── Tail effect deps ─────────────────────────────────────────────────────────
//
// The injected pure helpers + carried transient + callbacks + the platform tag
// and the platform-specific credential resolvers. Every helper is OPTIONAL and
// `!`-asserted at its single call site exactly as the android engine did, so the
// surface stays additive and a driver can inject only what the path it drives
// needs.

export interface TailEffectDeps<P extends TailEffectProgress = TailEffectProgress> {
  /** Tags the saved-cred store, env-export filename and build/workflow platform. */
  platform: 'ios' | 'android'

  /**
   * Build the platform credential SHAPE written at `saving-credentials` (e.g.
   * ANDROID_KEYSTORE_FILE… on android). Throws on missing inputs — same guards
   * the android engine used inline.
   */
  buildSavedCredentials: (progress: P) => Record<string, string>

  /**
   * Lossy fallback used when the driver did not thread the saved-credential map
   * through `carried` (crash-recovery resume). Returns {} when not rebuildable.
   */
  rebuildTailCredentials: (progress: P) => Record<string, string>

  /**
   * The platform's resume resolver — used by the `saving-credentials` self-heal
   * guard to detect a progress that should resume elsewhere.
   */
  resumeStep: (progress: P) => string

  // ── persistence ──────────────────────────────────────────────────────────
  updateSavedCredentials: (appId: string, platform: 'ios' | 'android', credentials: Record<string, string>) => Promise<void>
  loadProgress: (appId: string) => Promise<P | null>
  saveProgress: (appId: string, progress: P) => Promise<void>
  deleteProgress: (appId: string) => Promise<void>

  // ── tail helpers (mirror the matching helper modules verbatim) ────────────
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

  // ── streaming / build-request injection (requesting-build) ─────────────────
  //
  // All OPTIONAL — the iOS consumer (which won't provide them yet) degrades
  // gracefully, so the headless build-request path stays behaviour-matched only
  // when the driver wires them up.

  /**
   * The streaming BuildLogger the TUI threads into requestBuildInternal (the 4th
   * arg). On android it streams every line into `setBuildOutput`; the engine just
   * forwards it. When absent, requestBuildInternal is called without a logger.
   */
  logger?: BuildLogger

  /**
   * Resolves the Capgo API key the build request should use, mirroring the
   * android tail's CLI-flag-over-saved precedence (`apikey ?? findSavedKeySilent()`).
   * Returns undefined when no key is resolvable — in which case requesting-build
   * skips the build attempt and finishes at build-complete (the android no-key UX).
   * When this dep is ABSENT the engine falls back to the legacy empty-string apikey
   * so existing callers/tests that never resolved a key keep working.
   */
  resolveApikey?: () => string | undefined

  /**
   * Per-key upload progress, forwarded as the 5th arg of uploadCiSecretsAsync.
   * The android tail feeds this into `setCiSecretUploadProgress`. No-op when absent.
   */
  onCiSecretUploadProgress?: (current: number, total: number, keyName: string) => void

  /**
   * The 2-phase checking-ci-secrets status text ('Resolving GitHub repository…'
   * then 'Checking existing env vars in <repo>…'). The android tail feeds this into
   * `setCiSecretCheckPhase`. Also surfaced via `onStatus`. No-op when absent.
   */
  onCiSecretCheckPhase?: (phase: string) => void

  // ── workflow-builder script preload (uploading-ci-secrets, with-workflow) ──
  //
  // The android tail preloads the package.json scripts + recommended build script
  // BEFORE routing to pick-package-manager so pick-build-script has options. All
  // OPTIONAL — when absent the preload is skipped and pick-build-script falls back
  // to its escape-hatch list.

  /** Reads the project's package.json scripts map. */
  getPackageScripts?: () => Record<string, string>
  /** Detects the web-framework project type (best-effort; may resolve null). */
  findProjectType?: (options?: { quiet?: boolean }) => Promise<string | null>
  /** Maps a detected project type to its recommended build script name. */
  findBuildCommandForProjectType?: (projectType: string) => Promise<string | null>

  /**
   * Workflow-file telemetry hook (e.g. 'workflow-file-written'). The android tail
   * calls `trackWorkflowEvent`. No-op when absent.
   */
  trackWorkflowEvent?: (event: string, options?: { decision?: string }) => void

  /**
   * DRIVER-HELD transient tail state, threaded back into each effect. The TUI
   * resolves these ONCE (at `saving-credentials`) and keeps them in React state;
   * a headless driver mirrors that by capturing `TailEffectResult.transient` and
   * passing it back here on the NEXT effect. NEVER persisted to progress.json.
   */
  carried?: {
    savedCredentials?: Record<string, string>
    ciSecretEntries?: CiSecretEntry[]
    ciSecretExistingKeys?: string[]
  }

  onStatus?: (message: string) => void
  onLog?: (message: string, color?: string) => void
  signal?: AbortSignal
}

// ─── Tail effect result ───────────────────────────────────────────────────────

export interface TailEffectResult<P extends TailEffectProgress = TailEffectProgress> {
  /** Updated progress after the effect ran (matches what was persisted). */
  progress: P
  /** Explicit next step (a platform step id — string so each platform widens it). */
  next?: string
  /** Transient runtime data that lives in the driver but is NOT persisted. */
  transient?: TailTransient
}

/** The tail subset of a platform's transient ctx. Every field is optional. */
export interface TailTransient {
  ciSecretEntries?: CiSecretEntry[]
  savedCredentials?: Record<string, string>
  ciSecretTargets?: CiSecretTarget[]
  ciSecretSetupAdvice?: CiSecretSetupAdvice[]
  ciSecretRepoLabel?: string | null
  ciSecretExistingKeys?: string[]
  ciSecretUploadSummary?: string
  envExportPath?: string
  workflowFilePath?: string
  buildUrl?: string
  buildOutput?: string[]
  aiJobId?: string
  /** Workflow-builder script preload (resolved at uploading-ci-secrets, with-workflow). */
  availableScripts?: Record<string, string>
  recommendedScript?: string | null
  /** Set when env-export found nothing to write or threw — routed to build-complete, never thrown. */
  envExportError?: string
}

// ─── Tail input ───────────────────────────────────────────────────────────────
//
// Discriminated union — one variant per tail choice/input step that records
// state on the progress. Navigation-only / spinner-gate values carry no field
// and fall through unchanged in `applyTailInput`.

export type TailInput =
  | { step: 'ci-secrets-setup'; value: 'retry' | 'skip' }
  | { step: 'ci-secrets-target-select'; ciSecretTarget: CiSecretTarget | null }
  | { step: 'ask-ci-secrets'; value: 'yes' | 'no' }
  | { step: 'confirm-ci-secret-overwrite'; value: 'replace' | 'skip' }
  | { step: 'ci-secrets-failed'; value: 'retry' | 'continue' }
  | { step: 'ask-github-actions-setup'; value: 'with-workflow' | 'secrets-only' | 'declined' }
  | { step: 'confirm-secrets-push'; value: 'confirm' | 'cancel' }
  | { step: 'ask-export-env'; value: 'no' }
  | { step: 'ask-export-env'; value: 'yes'; envExportTargetPath: string }
  | { step: 'confirm-env-export-overwrite'; value: 'replace' | 'skip' }
  | { step: 'pick-package-manager'; selectedPackageManager: PackageManager }
  | { step: 'pick-build-script'; value: '__custom__' }
  | { step: 'pick-build-script'; buildScriptChoice: BuildScriptChoice }
  | { step: 'pick-build-script-custom'; command: string }
  | { step: 'preview-workflow-file'; value: 'write' | 'view' | 'cancel' }
  | { step: 'view-workflow-diff'; value: 'close' }
  | { step: 'ask-build'; value: 'yes' | 'no' }

// ─── Static option tables ─────────────────────────────────────────────────────
//
// Copied verbatim from `android/flow.ts` — labels match the TUI <Select>s.

const OPTIONS_CI_SECRETS_SETUP: TailStepOption[] = [
  { value: 'retry', label: 'I installed and logged in, check again' },
  { value: 'skip', label: 'Skip upload' },
]

const OPTIONS_CONFIRM_CI_SECRET_OVERWRITE: TailStepOption[] = [
  { value: 'replace', label: 'Replace existing env vars' },
  { value: 'skip', label: 'Skip upload' },
]

const OPTIONS_CI_SECRETS_FAILED: TailStepOption[] = [
  { value: 'retry', label: 'Try upload again' },
  { value: 'continue', label: 'Continue without upload' },
]

const OPTIONS_ASK_GITHUB_ACTIONS_SETUP: TailStepOption[] = [
  { value: 'with-workflow', label: '🚀  Yes — set the secrets AND create a workflow file' },
  { value: 'secrets-only', label: '🔒  Yes — set ONLY the secrets' },
  { value: 'no', label: '❌  No' },
]

const OPTIONS_CONFIRM_ENV_EXPORT_OVERWRITE: TailStepOption[] = [
  { value: 'replace', label: '✏️   Replace it' },
  { value: 'skip', label: '🛑  Skip — keep the existing file' },
]

const OPTIONS_PICK_PACKAGE_MANAGER: TailStepOption[] = [
  { value: 'bun', label: '📦  bun' },
  { value: 'npm', label: '📦  npm' },
  { value: 'pnpm', label: '📦  pnpm' },
  { value: 'yarn', label: '📦  yarn' },
]

const OPTIONS_PREVIEW_WORKFLOW_FILE: TailStepOption[] = [
  { value: 'write', label: '✏️   Write file' },
  { value: 'view', label: '👀  Show proposed file diff' },
  { value: 'cancel', label: '❌  Do not write file' },
]

const OPTIONS_VIEW_WORKFLOW_DIFF: TailStepOption[] = [
  { value: 'close', label: 'Close diff' },
]

const OPTIONS_ASK_BUILD: TailStepOption[] = [
  { value: 'yes', label: '🚀  Yes, request a build' },
  { value: 'no', label: '⏭   Not now' },
]

const OPTIONS_PICK_BUILD_SCRIPT_FALLBACK: TailStepOption[] = [
  { value: '__custom__', label: 'Type a custom command…' },
  { value: '__skip__', label: 'Skip build step (my app is raw HTML)' },
]

// KIND for each tail step — copied verbatim from android KIND_TABLE.
const TAIL_KIND: Record<TailStep, TailStepKind> = {
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
}

// ─── tailViewForStep ──────────────────────────────────────────────────────────

/**
 * Pure: a UI-framework-neutral description of a tail step. Mirrors the matching
 * <Select>/prompt the TUI renders. Moved verbatim from `androidViewForStep`'s
 * tail cases — the android engine adapts the returned view to `AndroidStepView`.
 */
export function tailViewForStep(
  step: TailStep,
  progress: TailEffectProgress | null,
  ctx: TailStepCtx,
): TailStepView {
  const base: TailStepView = { step, kind: TAIL_KIND[step] }

  switch (step) {
    // ci-secrets-setup — git-hosting CLI not ready; retry or skip the upload.
    case 'ci-secrets-setup':
      return { ...base, title: 'Set up your git hosting CLI to upload env vars', options: OPTIONS_CI_SECRETS_SETUP }

    // ci-secrets-target-select — one row per detected destination + a Skip row.
    case 'ci-secrets-target-select': {
      const targetOptions: TailStepOption[] = (ctx.ciSecretTargets ?? []).map(target => ({
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
      const options: TailStepOption[] = OPTIONS_PICK_PACKAGE_MANAGER.map(opt =>
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

    // All other tail steps (auto spinners) return kind only.
    default:
      return base
  }
}

// ─── applyTailInput ───────────────────────────────────────────────────────────

/**
 * Pure state write for each tail choice/input step — returns a NEW progress
 * object (spread — never mutate). Navigation-only / spinner-gate inputs return
 * progress unchanged. Moved verbatim from `applyAndroidInput`'s tail reducers.
 */
export function applyTailInput<P extends TailEffectProgress>(
  step: TailStep,
  progress: P,
  input: TailInput,
): P {
  switch (step) {
    // ── ci-secrets-target-select ──────────────────────────────────────────────
    case 'ci-secrets-target-select': {
      const i = input as Extract<TailInput, { step: 'ci-secrets-target-select' }>
      return { ...progress, ciSecretTarget: i.ciSecretTarget }
    }

    // ── ask-github-actions-setup ──────────────────────────────────────────────
    case 'ask-github-actions-setup': {
      const i = input as Extract<TailInput, { step: 'ask-github-actions-setup' }>
      return { ...progress, setupMode: i.value }
    }

    // ── ask-export-env ────────────────────────────────────────────────────────
    case 'ask-export-env': {
      const i = input as Extract<TailInput, { step: 'ask-export-env' }>
      if (i.value === 'yes')
        return { ...progress, envExportTargetPath: i.envExportTargetPath }
      return progress
    }

    // ── pick-package-manager ──────────────────────────────────────────────────
    case 'pick-package-manager': {
      const i = input as Extract<TailInput, { step: 'pick-package-manager' }>
      return { ...progress, selectedPackageManager: i.selectedPackageManager }
    }

    // ── pick-build-script ─────────────────────────────────────────────────────
    case 'pick-build-script': {
      const i = input as Extract<TailInput, { step: 'pick-build-script' }>
      if ('buildScriptChoice' in i)
        return { ...progress, buildScriptChoice: i.buildScriptChoice }
      return progress
    }

    // ── pick-build-script-custom ──────────────────────────────────────────────
    case 'pick-build-script-custom': {
      const i = input as Extract<TailInput, { step: 'pick-build-script-custom' }>
      const command = i.command.trim()
      if (!command)
        return progress
      return { ...progress, buildScriptChoice: { type: 'custom', command } }
    }

    default:
      return progress
  }
}

// ─── Tail credential threading (parity with the TUI) ──────────────────────────
//
// Moved verbatim from `tailSavedCredentials` / `tailCiSecretEntries` — the only
// change is that the lossy `rebuildTailCredentials` fallback is now injected via
// deps (platform owns its credential SHAPE) instead of being android-hardcoded.

/**
 * The full saved-credential map for the env-export effects. Prefers the driver's
 * carried copy (the exact map `saving-credentials` wrote) so the exported .env
 * carries the full field set; falls back to the platform's lossy rebuild only
 * when the driver did not thread it through.
 */
function tailSavedCredentials<P extends TailEffectProgress>(progress: P, deps: TailEffectDeps<P>): Record<string, string> {
  const carried = deps.carried?.savedCredentials
  if (carried && Object.keys(carried).length > 0)
    return carried
  return deps.rebuildTailCredentials(progress)
}

/**
 * The CI-secret entries for the upload / workflow effects. Prefers the driver's
 * carried entries (resolved ONCE at `saving-credentials` with the Capgo API key
 * folded in) so we never re-derive — and never re-resolve the API key. Falls
 * back to a single re-derivation from progress only when the driver did not
 * thread them through (entries then omit CAPGO_TOKEN). Returns [] when neither
 * the carried entries nor the `createCiSecretEntries` helper + rebuildable
 * credentials are available.
 */
function tailCiSecretEntries<P extends TailEffectProgress>(progress: P, deps: TailEffectDeps<P>): CiSecretEntry[] {
  const carried = deps.carried?.ciSecretEntries
  if (carried)
    return carried
  if (!deps.createCiSecretEntries)
    return []
  const credentials = deps.rebuildTailCredentials(progress)
  if (Object.keys(credentials).length === 0)
    return []
  return deps.createCiSecretEntries(credentials)
}

/**
 * The workflow-builder script preload run at `uploading-ci-secrets` on the
 * with-workflow path, BEFORE routing to `pick-package-manager`, so the later
 * `pick-build-script` view has real options. Mirrors the bespoke android tail
 * (app.tsx ~L1481-1498): read the package.json scripts, detect the project type,
 * and pick the recommended build script ONLY when it is actually one of the
 * scripts. Every dep is OPTIONAL and the whole thing is best-effort — a missing
 * dep or a thrown helper yields a smaller/empty preload (pick-build-script falls
 * back to its escape hatches) and NEVER blocks the flow. Returns the transient
 * fragment to spread into the effect result.
 */
async function preloadWorkflowScripts<P extends TailEffectProgress>(
  deps: TailEffectDeps<P>,
): Promise<{ availableScripts?: Record<string, string>, recommendedScript?: string | null }> {
  if (!deps.getPackageScripts)
    return {}
  try {
    const availableScripts = deps.getPackageScripts() ?? {}
    let recommendedScript: string | null = null
    if (deps.findProjectType) {
      const projectType = await deps.findProjectType({ quiet: true }).catch(() => null)
      if (projectType && deps.findBuildCommandForProjectType) {
        const recommended = await deps.findBuildCommandForProjectType(projectType).catch(() => null)
        if (recommended && Object.hasOwn(availableScripts, recommended))
          recommendedScript = recommended
      }
    }
    return { availableScripts, recommendedScript }
  }
  catch {
    // Best-effort; pick-build-script falls back to its empty list + escape hatches.
    return {}
  }
}

// ─── runTailEffect ────────────────────────────────────────────────────────────

/**
 * Dispatches to the right tail effect handler. Moved verbatim from
 * `runAndroidEffect`'s tail cases. Platform-specific calls are parameterised via
 * `deps.platform` / `deps.buildSavedCredentials` / `deps.rebuildTailCredentials`
 * / `deps.resumeStep`; everything else is unchanged.
 */
export async function runTailEffect<P extends TailEffectProgress>(
  step: TailStep,
  progress: P,
  deps: TailEffectDeps<P>,
): Promise<TailEffectResult<P>> {
  switch (step) {
    // ── saving-credentials ────────────────────────────────────────────────
    case 'saving-credentials': {
      // Self-heal: re-validate progress before attempting the save.
      const fresh = await deps.loadProgress(progress.appId)
      if (fresh) {
        const expectedStep = deps.resumeStep(fresh)
        if (expectedStep !== 'saving-credentials') {
          return { progress, next: expectedStep }
        }
      }

      // Build the platform credential SHAPE (throws on missing inputs).
      const credentials = deps.buildSavedCredentials(progress)

      await deps.updateSavedCredentials(progress.appId, deps.platform, credentials)
      await deps.deleteProgress(progress.appId)
      deps.onLog?.('✔ Credentials saved')

      // Random-password backup hint — emitted only here (post-save) so the
      // claim "stored in credentials.json" is true. Gated on the persisted
      // `keystorePasswordGenerated` marker; absent on a crash-recovery resume
      // (same acceptable trade-off the TUI makes when its in-memory flag was
      // wiped) and never set on iOS.
      if (progress.keystorePasswordGenerated)
        deps.onLog?.('  ℹ Your auto-generated keystore password is now in ~/.capgo-credentials/credentials.json — back up that file.', 'yellow')

      // Stash the CI-secret entries + raw credentials for the post-build
      // sub-flow. We do NOT push to GitHub/GitLab here — the wizard offers that
      // only AFTER a successful first build, so users never end up with orphan
      // secrets in a repo whose build was never proven to work. The driver
      // pre-binds the Capgo API key into createCiSecretEntries (so CAPGO_TOKEN
      // is included for the generated workflow); the core supplies the
      // credentials it just wrote. Both values ride in transient — resolved
      // ONCE here; later tail effects REUSE them via deps.carried.*.
      const entries = deps.createCiSecretEntries?.(credentials) ?? []

      // 'ask-build' is the driver's post-save entry point.
      return { progress, next: 'ask-build', transient: { ciSecretEntries: entries, savedCredentials: credentials } }
    }

    // ── detecting-ci-secrets ──────────────────────────────────────────────
    case 'detecting-ci-secrets': {
      const discovery = deps.detectCiSecretTargets!()

      // Surface the discovered targets + per-destination setup advice on EVERY
      // return path. Transient only — never persisted to progress.
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
        // Persist the chosen destination — the later checking/uploading steps
        // read it back.
        const nextProgress: P = { ...progress, ciSecretTarget: target }
        await deps.saveProgress(progress.appId, nextProgress)
        // GitHub → 3-option workflow flow; GitLab → legacy 2-option flow.
        const next = target.provider === 'github' ? 'ask-github-actions-setup' : 'ask-ci-secrets'
        return { progress: nextProgress, next, transient: discoveryTransient }
      }

      return { progress, next: 'ci-secrets-target-select', transient: discoveryTransient }
    }

    // ── checking-ci-secrets ───────────────────────────────────────────────
    case 'checking-ci-secrets': {
      const target = progress.ciSecretTarget
      if (!target)
        throw new Error('No git hosting target selected.')

      // 2-phase status text, mirroring the bespoke android tail (app.tsx
      // ~L1421-1438). Surface it on BOTH onStatus (the neutral status channel) and
      // the dedicated onCiSecretCheckPhase hook (android: setCiSecretCheckPhase).
      // Both are OPTIONAL — absent on iOS, where this is a no-op.
      const emitCheckPhase = (phase: string): void => {
        deps.onStatus?.(phase)
        deps.onCiSecretCheckPhase?.(phase)
      }

      // Phase 1: resolve the target repo (GitHub only) — non-blocking so the
      // spinner keeps animating.
      emitCheckPhase('Resolving GitHub repository…')
      let repoLabel: string | null = null
      if (target.provider === 'github') {
        repoLabel = await deps.getCiSecretRepoLabelAsync!(target)
        if (!repoLabel)
          return { progress, next: 'ci-secrets-failed', transient: { ciSecretRepoLabel: null } }
      }

      // Phase 2: list existing secrets in the resolved repo (or the target label
      // when there is no GitHub repo to name).
      emitCheckPhase(repoLabel
        ? `Checking existing env vars in ${repoLabel}…`
        : `Checking existing env vars in ${getCiSecretTargetLabel(target)}…`)
      const entries = tailCiSecretEntries(progress, deps)
      const existing = await deps.listExistingCiSecretKeysAsync!(target, entries.map(entry => entry.key))

      if (target.provider === 'github')
        return { progress, next: 'confirm-secrets-push', transient: { ciSecretRepoLabel: repoLabel, ciSecretExistingKeys: existing, ciSecretEntries: entries } }

      const next = existing.length > 0 ? 'confirm-ci-secret-overwrite' : 'uploading-ci-secrets'
      return { progress, next, transient: { ciSecretExistingKeys: existing, ciSecretEntries: entries } }
    }

    // ── uploading-ci-secrets ──────────────────────────────────────────────
    case 'uploading-ci-secrets': {
      const target = progress.ciSecretTarget
      if (!target)
        throw new Error('No git hosting target selected.')

      const entries = tailCiSecretEntries(progress, deps)
      // The existing-key list lives in the driver's transient (set at
      // checking-ci-secrets and threaded back via deps.carried) — it is NEVER
      // persisted to progress. Pass it as the 4th arg so an already-existing
      // secret is treated as an UPDATE rather than a create. When the driver did
      // not thread it (crash-recovery resume), it stays undefined.
      // Forward the per-key upload progress callback as the 5th arg so the driver
      // can render a progress bar (android: setCiSecretUploadProgress). The 4th
      // (runner) stays undefined — the helper uses its default. When the driver did
      // not thread the existing-key list (crash-recovery resume) it stays undefined.
      await deps.uploadCiSecretsAsync!(
        target,
        entries,
        deps.carried?.ciSecretExistingKeys,
        undefined,
        deps.onCiSecretUploadProgress,
      )

      const summary = `Uploaded ${entries.length} env var${entries.length === 1 ? '' : 's'} to ${target.label}`
      deps.onLog?.(`✔ ${summary}`)

      if (progress.setupMode === 'with-workflow') {
        // Pre-pick-package-manager script preload — resolve the package.json scripts
        // + recommended build script BEFORE routing to pick-package-manager so
        // pick-build-script has real options (mirrors app.tsx ~L1481-1498). Each dep
        // is OPTIONAL and best-effort: any absent dep or thrown helper just yields a
        // smaller (or empty) preload and pick-build-script falls back to its escape
        // hatches. Surfaced in transient — never persisted.
        const preload = await preloadWorkflowScripts(deps)
        return { progress, next: 'pick-package-manager', transient: { ciSecretUploadSummary: summary, ...preload } }
      }
      return { progress, next: 'build-complete', transient: { ciSecretUploadSummary: summary } }
    }

    // ── exporting-env ─────────────────────────────────────────────────────
    case 'exporting-env': {
      // Mirror the bespoke android tail (app.tsx ~L1592-1624): an empty export or a
      // thrown helper records the reason in transient.envExportError and routes to
      // build-complete — it NEVER throws (credentials are already saved).
      try {
        const targetPath = progress.envExportTargetPath || deps.defaultExportPath!(progress.appId, deps.platform)
        const result = deps.exportCredentialsToEnv!({
          appId: progress.appId,
          platform: deps.platform,
          credentials: tailSavedCredentials(progress, deps),
          targetPath,
        })

        if (result.kind === 'empty')
          return { progress, next: 'build-complete', transient: { envExportError: 'No credentials to export — saved state is empty.' } }

        if (result.kind === 'exists') {
          const nextProgress: P = { ...progress, envExportTargetPath: result.path }
          await deps.saveProgress(progress.appId, nextProgress)
          return { progress: nextProgress, next: 'confirm-env-export-overwrite' }
        }

        deps.onLog?.(`✔ Exported ${result.fieldCount} field${result.fieldCount === 1 ? '' : 's'} → ${result.path}`)
        return { progress, next: 'build-complete', transient: { envExportPath: result.path } }
      }
      catch (err) {
        return { progress, next: 'build-complete', transient: { envExportError: err instanceof Error ? err.message : String(err) } }
      }
    }

    // ── overwrite-and-export-env ──────────────────────────────────────────
    case 'overwrite-and-export-env': {
      // Same error contract as exporting-env (app.tsx ~L1627-1651): a thrown helper
      // records transient.envExportError and routes to build-complete, never throws.
      try {
        const result = deps.exportCredentialsToEnv!({
          appId: progress.appId,
          platform: deps.platform,
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
      catch (err) {
        return { progress, next: 'build-complete', transient: { envExportError: err instanceof Error ? err.message : String(err) } }
      }
    }

    // ── writing-workflow-file ─────────────────────────────────────────────
    case 'writing-workflow-file': {
      const buildScript = progress.buildScriptChoice
      if (!buildScript)
        throw new Error('Internal error: no build script choice recorded.')

      const entries = tailCiSecretEntries(progress, deps)
      const result = deps.writeWorkflowFile!(
        {
          appId: progress.appId,
          defaultPlatform: deps.platform,
          packageManager: progress.selectedPackageManager ?? 'npm',
          buildScript,
          secretKeys: entries.map(entry => entry.key),
        },
        { overwrite: true },
      )

      if (result.kind === 'written') {
        // Match the bespoke android log text (app.tsx ~L1572): the workflow path
        // constant, not the absolute path. The engine has no preview `isNew` flag
        // (that is TUI-only state) so it always reports 'Wrote'.
        deps.onLog?.(`✔ Wrote ${WORKFLOW_PATH}`)
        // Workflow-file telemetry (android: trackWorkflowEvent). OPTIONAL — no-op on iOS.
        deps.trackWorkflowEvent?.('workflow-file-written', { decision: 'write' })
        return { progress, next: 'build-complete', transient: { workflowFilePath: result.absolutePath } }
      }
      return { progress, next: 'build-complete' }
    }

    // ── requesting-build ──────────────────────────────────────────────────
    case 'requesting-build': {
      // CLI-flag key takes precedence over the saved one — the driver resolves it
      // (apikey ?? findSavedKeySilent()) and hands it back via deps.resolveApikey.
      // When that dep is wired and yields nothing, mirror the android no-key UX:
      // log the guidance and finish at build-complete WITHOUT attempting a build.
      // When the dep is ABSENT (legacy callers / iOS not-yet-wired) fall back to the
      // empty-string apikey so the existing behaviour is preserved.
      let apikey = ''
      if (deps.resolveApikey) {
        const resolved = deps.resolveApikey()
        if (!resolved) {
          deps.onLog?.('⚠ No Capgo API key found.', 'yellow')
          deps.onLog?.(`Run \`capgo login\` first, then \`capgo build request --platform ${deps.platform}\`.`)
          return { progress, next: 'build-complete' }
        }
        apikey = resolved
      }

      const result = await deps.requestBuildInternal!(
        progress.appId,
        { apikey, platform: deps.platform, aiAnalysisMode: 'caller-handled' },
        true,
        deps.logger,
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

    // ── Not a tail effect step ────────────────────────────────────────────
    default:
      throw new Error(`Unhandled tail effect step: ${step}`)
  }
}
