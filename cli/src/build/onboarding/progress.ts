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
      // For app_store mode the .p8 chain hadn't completed yet — resume at
      // the furthest partial input step.
      if (progress.issuerId && progress.keyId && progress.p8Path)
        return 'verifying-key'
      if (progress.keyId && progress.p8Path)
        return 'input-issuer-id'
      if (progress.p8Path)
        return 'input-key-id'
      // No .p8 inputs yet. Branch on the saved importDistribution rather
      // than falling back to setup-method-select (which would make the
      // user re-pick a fork they already chose). Mirrors what
      // getImportEntryStep does after a successful scan, but at mount
      // time — so a user who quit right after picking Import + ad_hoc
      // lands on import-scanning instead of being asked "how do you want
      // to set up iOS credentials?" again.
      //
      //   ad_hoc   → scan straight away (no .p8 needed for non-TestFlight)
      //   app_store → start the .p8 input chain at api-key-instructions
      //   undefined → user picked Import but never the distribution mode;
      //               re-ask just that question, not the setup fork
      if (progress.importDistribution === 'ad_hoc')
        return 'import-scanning'
      if (progress.importDistribution === 'app_store')
        return 'api-key-instructions'
      return 'import-distribution-mode'
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
    // No .p8 inputs yet. A user who chose the guided macOS helper
    // (`p8CreateMethod === 'automated'`) deliberately opted out of the manual
    // .p8 picker — resume them back on the helper (`asc-key-generating`
    // re-launches the guided window), not the manual instructions. Manual
    // choosers (and legacy/undefined) fall through to the .p8 instructions.
    if (progress.p8CreateMethod === 'automated')
      return 'asc-key-generating'
    return 'api-key-instructions'
  }
  if (!completedSteps.certificateCreated) {
    // Create-new is always app_store, so before committing the bundle id to
    // cert creation it must clear the remote App Store verification gate — the
    // same step the live flow runs between verifying-key and creating-certificate
    // (app.tsx, the verifying-key create-new branch). Resuming straight to
    // creating-certificate would skip that gate, letting a user who quit while
    // blocked on the App Store app check proceed with cert/profile creation for
    // an unverified bundle id — defeating the invariant. We re-run verify-app
    // (it re-checks via the ASC API and, on a fresh mount, has no
    // pendingVerifyNext, so every exit path falls back to creating-certificate).
    return 'verify-app'
  }
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
 * though `keyId` / `issuerId` / `p8Path` were already saved in progress —
 * exposed by users seeing "✔ API Key verified — Key: X" (hydrated log)
 * alongside "How do you want to provide the .p8 file?" on the same screen.
 *
 * IMPORTANT — we intentionally do NOT short-circuit on
 * `completedSteps.apiKeyVerified`. Going through `verifying-key` on every
 * resume is a brief network round-trip that catches two failure modes a
 * short-circuit would silently allow:
 *   1. The user moved/deleted the saved .p8 between runs — `verifying-key`
 *      surfaces this via NeedP8Error and routes back to the .p8 input.
 *   2. The key was revoked on Apple's side — `verifying-key` gets a 401 and
 *      the user gets a clear error instead of a late failure inside
 *      `saving-credentials` (after the Keychain ACL prompt has already
 *      fired for the .p12 export).
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

  // app_store: needs an ASC API key. Resume at the furthest partial input
  // step (mirrors the create-new flow's resume logic). When all three inputs
  // are saved we land on `verifying-key` — the brief Apple round-trip catches
  // both stale local .p8 files and revoked Apple-side keys.
  if (progress.issuerId && progress.keyId && progress.p8Path)
    return 'verifying-key'
  if (progress.keyId && progress.p8Path)
    return 'input-issuer-id'
  if (progress.p8Path)
    return 'input-key-id'
  return 'api-key-instructions'
}

// Apple names downloaded App Store Connect API keys "AuthKey_<KEYID>.p8" (older
// portals used "ApiKey_"), so the Key ID is recoverable from the filename. Used
// both to pre-fill the Key ID when a .p8 is picked and to re-derive it on resume
// when a prior session saved the path but quit before confirming the Key ID step.
// Returns '' when the filename doesn't match (e.g. a manually-renamed file).
export function extractKeyIdFromP8Path(filePath: string): string {
  // /i tolerates manually-renamed files, but the JWT `kid` claim is always
  // upper-case (Apple registers keys that way). Normalize here so a renamed
  // file like `authkey_abc123.p8` still produces a usable kid.
  return filePath.match(/(?:Auth|Api)Key_([A-Z0-9]+)\.p8$/i)?.[1]?.toUpperCase() ?? ''
}
