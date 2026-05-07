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
  catch {
    // Not found — fine
  }
}

/**
 * Determine the first incomplete step for the Android flow.
 *
 * Order:
 *   keystore → google-sign-in → saving-credentials
 */
export function getAndroidResumeStep(progress: AndroidOnboardingProgress | null): AndroidOnboardingStep {
  if (!progress)
    return 'welcome'

  const { completedSteps } = progress

  if (!completedSteps.keystoreReady) {
    if (progress.keystoreMethod === 'existing') {
      // Path → store password → (auto-detect alias) → key password.
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
      if (progress.keystoreAlias)
        return 'keystore-new-password-method'
      return 'keystore-new-alias'
    }
    return 'keystore-method-select'
  }

  if (!completedSteps.googleSignInComplete)
    return 'google-sign-in'
  if (!completedSteps.playAccountChosen)
    return 'play-developer-id-input'
  if (!completedSteps.gcpProjectChosen)
    return 'gcp-projects-loading'
  if (!completedSteps.androidPackageChosen)
    return 'android-package-select'
  if (!completedSteps.serviceAccountProvisioned || !completedSteps.playInviteProvisioned)
    return 'gcp-setup-running'

  return 'saving-credentials'
}
