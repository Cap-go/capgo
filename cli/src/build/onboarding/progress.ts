import type { OnboardingProgress, OnboardingStep } from './types.js'
// src/build/onboarding/progress.ts
import { readFile, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ensureSecureDirectory, writeFileAtomic } from '../../utils/safeWrites.js'

const CREDENTIALS_DIR = '.capgo-credentials'
const ONBOARDING_DIR = 'onboarding'

function getOnboardingDir(baseDir?: string): string {
  const base = baseDir || join(homedir(), CREDENTIALS_DIR)
  return join(base, ONBOARDING_DIR)
}

/** Sanitize appId to prevent path traversal (e.g. "../" or absolute paths) */
function sanitizeAppId(appId: string): string {
  // Strip path separators and traversal sequences, keep only safe chars
  const sanitized = appId.replace(/[/\\]/g, '_').replace(/\.\./g, '_')
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new Error(`Invalid appId for progress file: "${appId}"`)
  }
  return sanitized
}

function getProgressPath(appId: string, baseDir?: string): string {
  return join(getOnboardingDir(baseDir), `${sanitizeAppId(appId)}.json`)
}

/**
 * Load onboarding progress for an app. Returns null if no progress file exists.
 */
export async function loadProgress(
  appId: string,
  baseDir?: string,
): Promise<OnboardingProgress | null> {
  const filePath = getProgressPath(appId, baseDir)
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as OnboardingProgress
  }
  catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

/**
 * Save onboarding progress. Creates the onboarding directory if needed.
 * File is written with mode 0o600, directory with 0o700.
 */
export async function saveProgress(
  appId: string,
  progress: OnboardingProgress,
  baseDir?: string,
): Promise<void> {
  const dir = getOnboardingDir(baseDir)
  await ensureSecureDirectory(dir, 0o700)
  const filePath = getProgressPath(appId, baseDir)
  await writeFileAtomic(filePath, JSON.stringify(progress, null, 2), { mode: 0o600 })
}

/**
 * Delete the progress file for an app (called on successful completion).
 */
export async function deleteProgress(
  appId: string,
  baseDir?: string,
): Promise<void> {
  const filePath = getProgressPath(appId, baseDir)
  try {
    await unlink(filePath)
  }
  catch {
    // File doesn't exist, that's fine
  }
}

/**
 * Determine the first incomplete step based on saved progress.
 * Returns the step to resume from.
 *
 * Branches on `setupMethod` so the import flow doesn't accidentally resume
 * into the create-new path's `creating-certificate` step (which would trigger
 * the Apple 3-cert-limit error for users at the limit).
 */
export function getResumeStep(progress: OnboardingProgress | null): OnboardingStep {
  if (!progress)
    return 'welcome'

  const { completedSteps, setupMethod } = progress

  // Import flow: identity/profile selection state is ephemeral (lives only in
  // React UI state, never persisted). On resume we re-run the silent inventory
  // and re-render the picker — the user's previously verified .p8 / Key ID /
  // Issuer ID are reused so they don't have to re-enter those.
  if (setupMethod === 'import-existing') {
    if (!completedSteps.apiKeyVerified) {
      // For app_store mode the .p8 chain hadn't completed yet — resume there.
      // For ad_hoc mode this branch is normally unreachable (.p8 isn't asked
      // until no-match recovery), so we fall through to import-scanning,
      // which is the safe default.
      if (progress.issuerId && progress.keyId && progress.p8Path)
        return 'verifying-key'
      if (progress.keyId && progress.p8Path)
        return 'input-issuer-id'
      if (progress.p8Path)
        return 'input-key-id'
      // Distribution mode is gone from progress, so re-ask: jump back to the
      // setup-method fork. The user will pick "Import existing" again and
      // re-enter the (cheap) distribution-mode question.
      return 'setup-method-select'
    }
    // .p8 verified, but no cert/profile completed yet — resume at scanning.
    return 'import-scanning'
  }

  // Create-new flow (default for legacy progress files lacking setupMethod).
  if (!completedSteps.apiKeyVerified) {
    // Resume at the furthest partial input step
    if (progress.issuerId && progress.keyId && progress.p8Path)
      return 'verifying-key'
    if (progress.keyId && progress.p8Path)
      return 'input-issuer-id'
    if (progress.p8Path)
      return 'input-key-id'
    return 'api-key-instructions'
  }
  if (!completedSteps.certificateCreated)
    return 'creating-certificate'
  if (!completedSteps.profileCreated)
    return 'creating-profile'

  return 'saving-credentials'
}

/**
 * Pure routing decision used by the `import-scanning` useEffect to skip
 * questions the user already answered on a previous attempt.
 *
 * The shipped flow always sent users to `import-distribution-mode` after
 * scanning, and the distribution-mode picker always sent app_store users to
 * `api-key-instructions`. That re-asked the .p8 file path on resume even
 * though `keyId` / `issuerId` / `p8Path` / `apiKeyVerified` were already
 * saved in progress — exposed by users seeing "✔ API Key verified — Key: X"
 * (hydrated log) alongside "How do you want to provide the .p8 file?" on the
 * same screen.
 *
 * Exported so the routing decision can be unit-tested without rendering Ink.
 *
 * Returns the step to land on after a successful Keychain scan.
 */
export function getImportEntryStep(progress: OnboardingProgress | null): OnboardingStep {
  // No prior choice — ask distribution mode (existing behavior).
  if (!progress?.importDistribution)
    return 'import-distribution-mode'

  if (progress.importDistribution === 'ad_hoc') {
    // ad_hoc never needs the .p8 chain — go straight to identity selection.
    return 'import-pick-identity'
  }

  // app_store: needs an ASC API key. Skip the .p8 input chain if the key was
  // already verified on a previous attempt, otherwise resume at the furthest
  // partial input step (mirrors the create-new flow's resume logic).
  if (progress.completedSteps.apiKeyVerified)
    return 'import-pick-identity'
  if (progress.issuerId && progress.keyId && progress.p8Path)
    return 'verifying-key'
  if (progress.keyId && progress.p8Path)
    return 'input-issuer-id'
  if (progress.p8Path)
    return 'input-key-id'
  return 'api-key-instructions'
}
