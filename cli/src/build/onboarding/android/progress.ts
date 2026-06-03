// src/build/onboarding/android/progress.ts
import type { AndroidOnboardingProgress, AndroidOnboardingStep } from './types.js'
import { readFile, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ensureSecureDirectory, writeFileAtomic } from '../../../utils/safeWrites.js'

const CREDENTIALS_DIR = '.capgo-credentials'
const ONBOARDING_DIR = 'onboarding'
const ANDROID_PREFIX = 'android-'

function getOnboardingDir(baseDir?: string): string {
  const base = baseDir || join(homedir(), CREDENTIALS_DIR)
  return join(base, ONBOARDING_DIR)
}

function sanitizeAppId(appId: string): string {
  const sanitized = appId.replace(/[/\\]/g, '_').replace(/\.\./g, '_')
  if (!sanitized || sanitized === '.' || sanitized === '..')
    throw new Error(`Invalid appId for progress file: "${appId}"`)
  return sanitized
}

function getProgressPath(appId: string, baseDir?: string): string {
  return join(getOnboardingDir(baseDir), `${ANDROID_PREFIX}${sanitizeAppId(appId)}.json`)
}

export async function loadAndroidProgress(
  appId: string,
  baseDir?: string,
): Promise<AndroidOnboardingProgress | null> {
  const filePath = getProgressPath(appId, baseDir)
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as AndroidOnboardingProgress
  }
  catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT')
      return null
    throw error
  }
}

export async function saveAndroidProgress(
  appId: string,
  progress: AndroidOnboardingProgress,
  baseDir?: string,
): Promise<void> {
  const dir = getOnboardingDir(baseDir)
  await ensureSecureDirectory(dir, 0o700)
  const filePath = getProgressPath(appId, baseDir)
  await writeFileAtomic(filePath, JSON.stringify(progress, null, 2), { mode: 0o600 })
}

export async function deleteAndroidProgress(
  appId: string,
  baseDir?: string,
): Promise<void> {
  const filePath = getProgressPath(appId, baseDir)
  try {
    await unlink(filePath)
  }
  catch (err) {
    // ENOENT (file already absent) is the happy path — swallow only that.
    // EACCES / EPERM / EBUSY indicate a real problem the caller should see.
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT')
      throw err
  }
}

/**
 * Validate that the keystore phase is genuinely complete.
 *
 * `completedSteps.keystoreReady` being set is necessary but not sufficient:
 * the ephemeral top-level fields (`keystoreStorePassword`, `keystoreAlias`,
 * `_keystoreBase64`) can race independently of the `completedSteps` write.
 * If any of these are missing, we treat the keystore phase as incomplete
 * and resume sends the user back to the matching input step instead of
 * letting `doSaveCredentials` crash with "keystore inputs missing".
 */
function keystoreFullyValid(progress: AndroidOnboardingProgress): boolean {
  if (!progress.completedSteps.keystoreReady)
    return false
  if (!progress.keystoreAlias)
    return false
  if (!progress.keystoreStorePassword)
    return false
  if (!progress._keystoreBase64)
    return false
  return true
}

/**
 * Routing into the keystore phase when validation fails. Called both for
 * never-completed-yet runs AND for partial-completion recovery (e.g. when a
 * race lost one of the top-level fields after `keystoreReady` was set).
 */
function keystoreResumeStep(progress: AndroidOnboardingProgress): AndroidOnboardingStep {
  if (progress.keystoreMethod === 'existing') {
    if (progress.keystoreAlias && progress.keystoreStorePassword && progress.keystoreExistingPath)
      return 'keystore-existing-key-password'
    if (progress.keystoreStorePassword && progress.keystoreExistingPath)
      return 'keystore-existing-detecting-alias'
    if (progress.keystoreExistingPath)
      return 'keystore-existing-store-password'
    return 'keystore-existing-path'
  }
  if (progress.keystoreMethod === 'generate') {
    if (progress.keystoreStorePassword && progress.keystoreAlias)
      return 'keystore-new-cn'
    if (progress.keystoreAlias) {
      // Once the user picks "manual", advance to the dedicated store-password
      // input so the step title changes and a stateless caller (the MCP) sees
      // clear forward progress. "random" auto-fills the password above, so it
      // never reaches this branch.
      if (progress.keystorePasswordManual)
        return 'keystore-new-store-password'
      return 'keystore-new-password-method'
    }
    return 'keystore-new-alias'
  }
  return 'keystore-method-select'
}

export function hasAnyOAuthProgress(progress: AndroidOnboardingProgress): boolean {
  return !!(
    progress.completedSteps.googleSignInComplete
    || progress.completedSteps.playAccountChosen
    || progress.completedSteps.gcpProjectChosen
    || progress.completedSteps.androidPackageChosen
    || progress._oauthRefreshToken
  )
}

/**
 * Determine the first incomplete step for the Android flow.
 *
 * Each phase is validated by checking both:
 *   1. The `completedSteps.<phase>` marker (atomic write to a single field)
 *   2. The ephemeral fields the marker depends on (separate top-level writes
 *      that can race against each other and against the marker)
 *
 * If a marker is present but the ephemeral data is missing, the phase is
 * treated as incomplete — the user is routed back to the input step that
 * collects the missing field, never further forward.
 *
 * This is the contract that makes the state machine self-healing: any
 * inconsistent state on disk lands the user on a working input step instead
 * of crashing several phases later.
 */
export function getAndroidResumeStep(progress: AndroidOnboardingProgress | null): AndroidOnboardingStep {
  if (!progress)
    return 'welcome'

  const { completedSteps } = progress

  // Phase 0 — Data-safety gate (shared engine). When saved android credentials
  // already exist, the engine routes through `credentials-exist` (backup-or-
  // cancel choice) and, on backup, `backing-up` (the credentials.json → dated
  // copy) BEFORE entering the keystore phase — mirroring main's ink TUI. The
  // gate lifecycle lives in `_credentialsExistGate`; only 'pending'/'backup'
  // park the user on a gate step. 'done'/'cancel'/undefined fall through to the
  // normal keystore routing (the engine handles 'cancel' as a hard stop).
  if (progress._credentialsExistGate === 'pending')
    return 'credentials-exist'
  if (progress._credentialsExistGate === 'backup')
    return 'backing-up'

  // Phase 1 — Keystore: marker + 3 ephemeral fields
  if (!keystoreFullyValid(progress))
    return keystoreResumeStep(progress)

  // Phase 2 — Service-account fork. Routes onto the import path or the OAuth
  // path. Legacy progress files don't have `serviceAccountMethod` — treat
  // those as OAuth (existing behavior) so in-flight onboardings continue
  // along the path they started on.
  if (progress.serviceAccountMethod === 'existing') {
    // Phase 2a — Import existing SA JSON.
    //
    // `_serviceAccountKeyBase64` is set once we accept the JSON (either
    // validation passed or the user picked "save anyway"). After that point
    // routing is identical to the OAuth path's tail: `saving-credentials`.
    if (progress._serviceAccountKeyBase64)
      return 'saving-credentials'

    // Package name confirmation is the first step inside the import path.
    if (!completedSteps.androidPackageChosen)
      return 'android-package-select'

    // We have a package but no accepted SA yet. If the user already picked a
    // file, jump back to validation; otherwise back to file selection.
    if (progress.serviceAccountJsonPath)
      return 'sa-json-validating'
    return 'sa-json-existing-path'
  }

  // Backward compatibility: legacy progress files (created before the
  // service-account fork existed) never set `serviceAccountMethod`. Per the
  // design contract those resume into the OAuth path they were already on.
  // Fresh progress files that reached the fork carry `serviceAccountForkSeen`,
  // so quitting before choosing can restore the method-select screen without
  // changing legacy behavior.
  if (
    progress.serviceAccountForkSeen
    && progress.serviceAccountMethod === undefined
    && !hasAnyOAuthProgress(progress)
  ) {
    return 'service-account-method-select'
  }

  // Phase 2b — Google sign-in: marker + refresh token. We need the refresh
  // token to mint access tokens for the rest of the flow on subsequent
  // resumes; if it's missing we must re-auth.
  if (!completedSteps.googleSignInComplete || !progress._oauthRefreshToken)
    return 'google-sign-in'

  // Phase 3 — Play developer account ID (paste).
  if (!completedSteps.playAccountChosen)
    return 'play-developer-id-input'

  // Phase 4 — GCP project pick or create.
  if (!completedSteps.gcpProjectChosen)
    return 'gcp-projects-loading'

  // Phase 4.5 — Android package (applicationId) to grant SA access to.
  if (!completedSteps.androidPackageChosen)
    return 'android-package-select'

  // Phase 5 — Provisioning: SA creation marker + the SA's JSON key that
  // gets saved as PLAY_CONFIG_JSON. Missing either means we must re-run
  // the provisioning sequence.
  if (
    !completedSteps.serviceAccountProvisioned
    || !completedSteps.playInviteProvisioned
    || !progress._serviceAccountKeyBase64
  ) {
    return 'gcp-setup-running'
  }

  return 'saving-credentials'
}
